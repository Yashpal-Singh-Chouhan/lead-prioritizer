"""The FastAPI server: every URL the frontend can call is defined here."""
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from . import prompts
from .ai import AIError, call_ai, parse_json
from .config import ALLOWED_ORIGINS
from .db import CallLog, ChatMessage, Lead, SessionLocal, create_tables
from .schemas import CallIn, ChatIn, LeadIn


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()  # make sure the tables exist when the server starts
    yield


app = FastAPI(title="Lead Prioritizer API", version="1.0.0", lifespan=lifespan)

# CORS: only our own frontend websites may call this API from a browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)


# ---------- Friendly error messages ----------

FIELD_LABELS = {
    "name": "Name",
    "location": "Location",
    "requirement": "Property requirement",
    "budget": "Budget",
    "timeline": "Buying timeline",
    "message": "Customer message",
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


# ---------- Simple rate limit for AI endpoints (protects the free AI quota) ----------

_hits: dict[str, deque] = defaultdict(deque)
AI_LIMIT_PER_MINUTE = 15


def ai_rate_limit(request: Request) -> None:
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0]
    now, window = time.time(), _hits[ip]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= AI_LIMIT_PER_MINUTE:
        raise HTTPException(status_code=429, detail="Too many AI requests. Please wait a minute.")
    window.append(now)


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


# ---------- Database session per request ----------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def lead_to_dict(lead: Lead, include_chat: bool = True) -> dict:
    """Converts a database row into the JSON shape the frontend expects."""
    return {
        "id": lead.id,
        "name": lead.name,
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


def get_lead_or_404(db: Session, lead_id: str) -> Lead:
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")
    return lead


# ---------- Endpoints ----------

@app.get("/healthz")
def health():
    return {"status": "ok"}


@app.get("/leads")
def list_leads(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Paginated list, highest score first."""
    total = db.scalar(select(func.count()).select_from(Lead))
    rows = db.scalars(
        select(Lead)
        .options(selectinload(Lead.calls))
        .order_by(Lead.score.desc(), Lead.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return {"items": [lead_to_dict(l, include_chat=False) for l in rows], "total": total}


@app.get("/leads/{lead_id}")
def get_lead(lead_id: str, db: Session = Depends(get_db)):
    return lead_to_dict(get_lead_or_404(db, lead_id))


@app.post("/leads", status_code=201, dependencies=[Depends(ai_rate_limit)])
def create_lead(data: LeadIn, db: Session = Depends(get_db)):
    """Validate -> ask the AI for an analysis -> save -> return the saved lead."""
    text = call_ai(
        [
            {"role": "system", "content": prompts.ANALYSIS_SYSTEM},
            {"role": "user", "content": prompts.analysis_prompt(data)},
        ],
        want_json=True,
    )
    analysis = prompts.normalize_analysis(parse_json(text))
    lead = Lead(
        **data.model_dump(),
        analysis=analysis,
        score=analysis["score"],
        priority=analysis["priority"],
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead_to_dict(lead)


@app.delete("/leads/{lead_id}", status_code=204)
def delete_lead(lead_id: str, db: Session = Depends(get_db)):
    db.delete(get_lead_or_404(db, lead_id))
    db.commit()
    return Response(status_code=204)


@app.post("/leads/{lead_id}/chat", dependencies=[Depends(ai_rate_limit)])
def chat(lead_id: str, data: ChatIn, db: Session = Depends(get_db)):
    """Answers a question about ONE lead, grounded in that lead's full context."""
    lead = get_lead_or_404(db, lead_id)
    history = [{"role": m.role, "content": m.content} for m in lead.chat][-11:]
    reply = call_ai(
        [{"role": "system", "content": prompts.chat_system(lead)}]
        + history
        + [{"role": "user", "content": data.message}]
    )
    # save both messages only after the AI answered successfully
    db.add_all(
        [
            ChatMessage(lead_id=lead.id, role="user", content=data.message),
            ChatMessage(lead_id=lead.id, role="assistant", content=reply),
        ]
    )
    db.commit()
    db.refresh(lead)
    return lead_to_dict(lead)


@app.post("/leads/{lead_id}/calls", dependencies=[Depends(ai_rate_limit)])
def log_call(lead_id: str, data: CallIn, db: Session = Depends(get_db)):
    """OUR OWN FEATURE: after a call, re-score the lead and update the plan."""
    lead = get_lead_or_404(db, lead_id)
    text = call_ai(
        [
            {"role": "system", "content": prompts.ANALYSIS_SYSTEM},
            {"role": "user", "content": prompts.call_update_prompt(lead, data.notes)},
        ],
        want_json=True,
    )
    raw = parse_json(text)
    analysis = prompts.normalize_analysis(raw)
    outcome = raw.get("callOutcome") if isinstance(raw.get("callOutcome"), str) else ""
    db.add(
        CallLog(
            lead_id=lead.id,
            notes=data.notes,
            outcome=outcome.strip() or "Lead updated after call.",
            previous_score=lead.score,
            new_score=analysis["score"],
        )
    )
    lead.analysis = analysis
    lead.score = analysis["score"]
    lead.priority = analysis["priority"]
    db.commit()
    db.refresh(lead)
    return lead_to_dict(lead)
