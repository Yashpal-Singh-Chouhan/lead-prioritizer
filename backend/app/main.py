"""The FastAPI server: every URL the frontend can call is defined here."""
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import prompts
from .ai import AIError, call_ai, call_ai_json
from .auth import get_current_user, get_db
from .auth import router as auth_router
from .config import ALLOWED_ORIGINS, JWT_SECRET
from .db import CallLog, ChatMessage, Lead, User, create_tables
from .ratelimit import rate_limit
from .schemas import CallIn, ChatIn, LeadIn


@asynccontextmanager
async def lifespan(app: FastAPI):
    if JWT_SECRET == "dev-only-secret-change-me":
        print("WARNING: JWT_SECRET is not set. Set a long random value in production.")
    create_tables()  # make sure the tables exist (and are upgraded) when the server starts
    yield


app = FastAPI(title="Lead Prioritizer API", version="2.0.0", lifespan=lifespan)

# CORS: only our own frontend websites may call this API from a browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth_router)

# AI endpoints get a stricter limit to protect the free AI quota
ai_limit = rate_limit("ai", 15)


# ---------- Friendly error messages ----------

FIELD_LABELS = {
    "name": "Name",
    "email": "Email",
    "password": "Password",
    "location": "Location",
    "requirement": "Property requirement",
    "budget": "Budget",
    "timeline": "Buying timeline",
    "message": "Customer message",
    "phone": "Phone number",
    "question": "Question",
    "notes": "Call notes",
}


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    first = exc.errors()[0]
    key = str(first["loc"][-1]) if first.get("loc") else ""
    field = FIELD_LABELS.get(key, key.capitalize() or "Input")
    msg = first["msg"].removeprefix("Value error, ")
    return JSONResponse(status_code=422, content={"error": f"{field}: {msg}"})


@app.exception_handler(AIError)
async def ai_error(_: Request, exc: AIError):
    return JSONResponse(status_code=502, content={"error": str(exc)})


@app.exception_handler(StarletteHTTPException)
async def http_error(_: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


# ---------- Helpers ----------

def lead_to_dict(lead: Lead, include_chat: bool = True) -> dict:
    """Converts a database row into the JSON shape the frontend expects."""
    return {
        "id": lead.id,
        "name": lead.name,
        "phone": lead.phone,
        "email": lead.email,
        "location": lead.location,
        "requirement": lead.requirement,
        "budget": lead.budget,
        "timeline": lead.timeline,
        "message": lead.message,
        "createdAt": lead.created_at.isoformat(),
        "analysis": lead.analysis,
        "calls": [
            {
                "id": c.id,
                "date": c.created_at.isoformat(),
                "notes": c.notes,
                "outcome": c.outcome,
                "previousScore": c.previous_score,
                "newScore": c.new_score,
            }
            for c in lead.calls
        ],
        "chat": [{"role": m.role, "content": m.content} for m in lead.chat] if include_chat else [],
    }


def analyze(lead, calls=()) -> dict:
    """Asks the AI for the structured analysis and validates/cleans it before anything is saved."""
    raw = call_ai_json(
        [
            {"role": "system", "content": prompts.ANALYSIS_SYSTEM},
            {"role": "user", "content": prompts.analysis_prompt(lead, calls)},
        ]
    )
    return prompts.normalize_analysis(raw)


def set_analysis(lead: Lead, analysis: dict) -> None:
    lead.analysis = analysis
    # copied into their own columns so the list can be filtered and sorted fast (indexed)
    lead.score = analysis["score"]
    lead.priority = analysis["priority"]


def get_own_lead(db: Session, lead_id: str, user: User) -> Lead:
    """Finds a lead ONLY if it belongs to the logged-in salesperson.
    Someone else's lead gives the same 'not found' answer, so its existence isn't leaked."""
    lead = db.get(Lead, lead_id)
    if not lead or lead.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Lead not found.")
    return lead


# ---------- Endpoints ----------

@app.get("/healthz")
def health():
    return {"status": "ok"}


# "Most urgent" sort: soonest buying timeline first
TIMELINE_RANK = case(
    {"Within 1 month": 0, "1-3 months": 1, "3-6 months": 2, "6+ months": 3, "Just exploring": 4},
    value=Lead.timeline,
    else_=5,
)
SORTS = {
    "score": (Lead.score.desc(), Lead.created_at.desc()),
    "newest": (Lead.created_at.desc(),),
    "urgent": (TIMELINE_RANK, Lead.score.desc()),
}


@app.get("/leads")
def list_leads(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    priority: Literal["Hot", "Warm", "Cold"] | None = None,
    sort: Literal["score", "newest", "urgent"] = "score",
    q: str = Query("", max_length=80),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Paginated list of MY leads. Filter by priority, search by name/location, sort in the database."""
    filters = [Lead.owner_id == user.id]
    if priority:
        filters.append(Lead.priority == priority)
    if q.strip():
        like = f"%{q.strip()}%"
        filters.append(or_(Lead.name.ilike(like), Lead.location.ilike(like), Lead.requirement.ilike(like)))
    total = db.scalar(select(func.count()).select_from(Lead).where(*filters))
    rows = db.scalars(
        select(Lead)
        .where(*filters)
        .options(selectinload(Lead.calls))
        .order_by(*SORTS[sort])
        .limit(limit)
        .offset(offset)
    ).all()
    return {"items": [lead_to_dict(l, include_chat=False) for l in rows], "total": total}


@app.get("/leads/{lead_id}")
def get_lead(lead_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return lead_to_dict(get_own_lead(db, lead_id, user))


@app.post("/leads", status_code=201, dependencies=[Depends(ai_limit)])
def create_lead(data: LeadIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Validate -> ask the AI for a structured analysis -> validate it -> save under this salesperson."""
    analysis = analyze(data)
    lead = Lead(
        **data.model_dump(),
        owner_id=user.id,
        analysis=analysis,
        score=analysis["score"],
        priority=analysis["priority"],
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead_to_dict(lead)


@app.post("/leads/{lead_id}/analyze", dependencies=[Depends(ai_limit)])
def reanalyze(lead_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Runs the analysis again (e.g. for leads saved before the Sales Action Plan existed).
    Logged calls are included, so nothing learned on a call is lost."""
    lead = get_own_lead(db, lead_id, user)
    set_analysis(lead, analyze(lead, lead.calls))
    db.commit()
    db.refresh(lead)
    return lead_to_dict(lead)


@app.delete("/leads/{lead_id}", status_code=204)
def delete_lead(lead_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.delete(get_own_lead(db, lead_id, user))
    db.commit()
    return Response(status_code=204)


@app.post("/leads/{lead_id}/chat", dependencies=[Depends(ai_limit)])
def chat(lead_id: str, data: ChatIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Answers a question about ONE lead, grounded in that lead's full context."""
    lead = get_own_lead(db, lead_id, user)
    history = [{"role": m.role, "content": m.content} for m in lead.chat][-11:]
    reply = call_ai(
        [{"role": "system", "content": prompts.chat_system(lead)}]
        + history
        + [{"role": "user", "content": data.question}]
    )
    # save both messages only after the AI answered successfully
    db.add_all(
        [
            ChatMessage(lead_id=lead.id, role="user", content=data.question),
            ChatMessage(lead_id=lead.id, role="assistant", content=reply),
        ]
    )
    db.commit()
    db.refresh(lead)
    return lead_to_dict(lead)


@app.post("/leads/{lead_id}/calls", dependencies=[Depends(ai_limit)])
def log_call(lead_id: str, data: CallIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """After a call, re-score the lead and rewrite the action plan for the next step."""
    lead = get_own_lead(db, lead_id, user)
    raw = call_ai_json(
        [
            {"role": "system", "content": prompts.ANALYSIS_SYSTEM},
            {"role": "user", "content": prompts.call_update_prompt(lead, data.notes)},
        ]
    )
    analysis = prompts.normalize_analysis(raw)
    outcome = prompts.clean_text(raw.get("callOutcome"), "Lead updated after call.")
    db.add(
        CallLog(
            lead_id=lead.id,
            notes=data.notes,
            outcome=outcome,
            previous_score=lead.score,
            new_score=analysis["score"],
        )
    )
    set_analysis(lead, analysis)
    db.commit()
    db.refresh(lead)
    return lead_to_dict(lead)


@app.get("/stats")
def stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Dashboard numbers for MY leads. All counting happens in the database (GROUP BY),
    so only a small summary travels to the browser, however many leads there are."""
    mine = Lead.owner_id == user.id

    total, avg_score = db.execute(select(func.count(), func.avg(Lead.score)).where(mine)).one()

    by_priority = dict(db.execute(select(Lead.priority, func.count()).where(mine).group_by(Lead.priority)).all())

    by_timeline = dict(db.execute(select(Lead.timeline, func.count()).where(mine).group_by(Lead.timeline)).all())

    bucket = func.least(Lead.score // 20, 4)  # floor division: 0-19, 20-39, 40-59, 60-79, 80-100
    by_bucket = dict(db.execute(select(bucket, func.count()).where(mine).group_by(bucket)).all())

    since = datetime.now(timezone.utc) - timedelta(days=13)
    day = func.date(Lead.created_at)
    per_day = {
        str(d): c
        for d, c in db.execute(
            select(day, func.count()).where(mine, Lead.created_at >= since.replace(hour=0, minute=0, second=0))
            .group_by(day)
        ).all()
    }
    days = [(since + timedelta(days=i)).date().isoformat() for i in range(14)]

    calls_count, avg_change = db.execute(
        select(func.count(CallLog.id), func.avg(CallLog.new_score - CallLog.previous_score))
        .join(Lead, CallLog.lead_id == Lead.id)
        .where(mine)
    ).one()

    return {
        "total": total,
        "avgScore": round(float(avg_score), 1) if avg_score is not None else 0,
        "byPriority": {p: by_priority.get(p, 0) for p in ("Hot", "Warm", "Cold")},
        "byTimeline": [
            {"label": t or "Not specified", "count": by_timeline.get(t, 0)}
            for t in ("Within 1 month", "1-3 months", "3-6 months", "6+ months", "Just exploring", "")
        ],
        "scoreBuckets": [
            {"label": label, "count": by_bucket.get(i, 0)}
            for i, label in enumerate(["0-19", "20-39", "40-59", "60-79", "80-100"])
        ],
        "perDay": [{"date": d, "count": per_day.get(d, 0)} for d in days],
        "calls": {
            "count": calls_count,
            "avgScoreChange": round(float(avg_change), 1) if avg_change is not None else 0,
        },
    }
