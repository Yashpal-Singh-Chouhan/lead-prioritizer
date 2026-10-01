"""Sign up, verify email, log in, reset password, and 'who is calling?' checks.

Passwords are stored as bcrypt hashes (a one-way scramble).
After login the server hands out a signed token (JWT). The browser sends it with every
request, and get_current_user() checks it before any lead data is touched.

A new account can't log in until its owner clicks the link we email them, so a made-up
address never gets in. Forgotten passwords are reset through a one-time emailed link."""
import hashlib
import re
import secrets
import time
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .config import DEMO_ACCOUNTS, DEMO_TEAM_ID, JWT_SECRET, TOKEN_HOURS
from .db import AuthToken, Lead, SessionLocal, Team, User, new_join_code, now
from .emails import EmailError, send_reset_email, send_verification_email
from .ratelimit import rate_limit
from .realtime import broker

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
DEMO_EMAILS = {email for email, _ in DEMO_ACCOUNTS.values()}
VERIFY_LIFETIME = timedelta(hours=24)
RESET_LIFETIME = timedelta(minutes=30)
RESEND_GAP = timedelta(seconds=60)  # at most one email per minute per account
CHECK_INBOX = "If an account exists for this email, we've sent it a link. Check your inbox (and spam folder)."

router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)
auth_limit = rate_limit("auth", 10)
email_limit = rate_limit("email", 5)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------- Input rules ----------

def _clean_email(v: str) -> str:
    v = v.strip().lower()
    if not EMAIL_RE.match(v):
        raise ValueError("please enter a valid email address")
    return v


class SignupIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=72)  # bcrypt only uses the first 72 bytes
    # either start a new team (team_name) or join an existing one (join_code)
    team_name: str = Field(default="", max_length=60)
    join_code: str = Field(default="", max_length=20)

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not all(ch.isalpha() or ch in " .'-" for ch in v):
            raise ValueError("only letters, spaces and . ' - are allowed")
        return v

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _clean_email(v)

    @field_validator("team_name")
    @classmethod
    def check_team_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not all(ch.isalnum() or ch in " .'&-" for ch in v):
            raise ValueError("only letters, numbers, spaces and . ' & - are allowed")
        return v

    @field_validator("join_code")
    @classmethod
    def check_join_code(cls, v: str) -> str:
        return _clean_join_code(v)

    @model_validator(mode="after")
    def one_team_choice(self):
        if bool(self.team_name) == bool(self.join_code):
            raise ValueError("enter a new team name or a join code")
        if self.team_name and len(self.team_name) < 2:
            raise ValueError("team name must have at least 2 characters")
        return self


def _clean_join_code(v: str) -> str:
    return "".join(ch for ch in v.upper() if ch.isalnum())  # forgive spaces, dashes and lowercase


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=72)
    join_code: str = Field(default="", max_length=20)  # optional: also join a teammate's team

    @field_validator("join_code")
    @classmethod
    def check_join_code(cls, v: str) -> str:
        return _clean_join_code(v)


class EmailIn(BaseModel):
    email: str = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _clean_email(v)


class TokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class ResetIn(TokenIn):
    password: str = Field(min_length=8, max_length=72)


class DemoIn(BaseModel):
    who: str = Field(default="a", pattern="^[ab]$")


# ---------- Helpers ----------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def check_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:  # e.g. the demo accounts' unusable passwords
        return False


def user_json(user: User) -> dict:
    team = user.team
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        # the join code is how teammates get in; the demo team's code is never shown
        "team": {
            "id": team.id,
            "name": team.name,
            "joinCode": None if team.id == DEMO_TEAM_ID else team.join_code,
        }
        if team
        else None,
    }


def make_token(user: User) -> dict:
    issued = int(time.time())
    expires = datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)
    token = jwt.encode({"sub": user.id, "iat": issued, "exp": expires}, JWT_SECRET, algorithm="HS256")
    return {"token": token, "user": user_json(user)}


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_link(db: Session, user: User, purpose: str, lifetime: timedelta) -> str:
    """Creates a one-time link token. Any older unused link for the same purpose stops working."""
    db.execute(
        update(AuthToken)
        .where(AuthToken.user_id == user.id, AuthToken.purpose == purpose, AuthToken.used_at.is_(None))
        .values(used_at=now())
    )
    raw = secrets.token_urlsafe(32)
    db.add(AuthToken(user_id=user.id, purpose=purpose, token_hash=_hash(raw), expires_at=now() + lifetime))
    return raw


def recently_sent(db: Session, user: User, purpose: str) -> bool:
    last = db.scalar(
        select(AuthToken.created_at)
        .where(AuthToken.user_id == user.id, AuthToken.purpose == purpose)
        .order_by(AuthToken.created_at.desc())
        .limit(1)
    )
    return last is not None and last > now() - RESEND_GAP


def use_link(db: Session, raw: str, purpose: str) -> User:
    """Checks a link token and marks it used, so the same link can never work twice.
    FOR UPDATE locks the row, so two clicks at the same moment can't both use it."""
    row = db.scalar(
        select(AuthToken).where(AuthToken.token_hash == _hash(raw), AuthToken.purpose == purpose).with_for_update()
    )
    if not row or row.used_at or row.expires_at < now():
        raise HTTPException(status_code=400, detail="This link is invalid or has expired. Please request a new one.")
    row.used_at = now()
    user = db.get(User, row.user_id)
    if not user:
        raise HTTPException(status_code=400, detail="This link is invalid or has expired. Please request a new one.")
    return user


def send_quietly(send, *args) -> None:
    """Background sender for 'forgot password' and 'resend': the answer is the same whether or not
    the email exists, so a failure is only logged (telling the user would reveal the account exists)."""
    try:
        send(*args)
    except EmailError as exc:
        print(f"Email not sent: {exc}")


def user_from_token(db: Session, token: str) -> User:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Your session expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Please log in.")
    user = db.get(User, payload.get("sub"))
    if not user or not user.email_verified or not user.team_id:
        raise HTTPException(status_code=401, detail="Please log in.")
    # a password reset logs out every device that was logged in with the old password
    if user.password_changed_at and payload.get("iat", 0) < int(user.password_changed_at.timestamp()):
        raise HTTPException(status_code=401, detail="Your password was changed. Please log in again.")
    return user


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    """Runs before every protected endpoint: no valid token, no data."""
    if not creds:
        raise HTTPException(status_code=401, detail="Please log in.")
    return user_from_token(db, creds.credentials)


# ---------- Endpoints ----------

@router.post("/signup", status_code=201, dependencies=[Depends(auth_limit)])
def signup(data: SignupIn, db: Session = Depends(get_db)):
    if data.email in DEMO_EMAILS:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    existing = db.scalar(select(User).where(User.email == data.email))
    if existing:
        # an address that was never confirmed within 24 hours can be signed up again
        if existing.email_verified or existing.created_at > now() - VERIFY_LIFETIME:
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists. Log in, or use 'Forgot password'. "
                "If you just signed up, check your inbox for the confirmation link.",
            )
        db.delete(existing)
        db.flush()

    if data.join_code:
        team = db.scalar(select(Team).where(Team.join_code == data.join_code))
        if not team or team.id == DEMO_TEAM_ID:
            raise HTTPException(status_code=400, detail="No team has this join code. Ask a teammate to check it.")
    else:
        code = new_join_code()
        while db.scalar(select(Team.id).where(Team.join_code == code)):
            code = new_join_code()
        team = Team(name=data.team_name, join_code=code)

    user = User(name=data.name, email=data.email, password_hash=hash_password(data.password), team=team)
    db.add(user)
    db.flush()
    token = issue_link(db, user, "verify", VERIFY_LIFETIME)
    # sent BEFORE saving: if the email can't go out, nothing is saved and the person can simply retry
    try:
        send_verification_email(user.email, user.name, token)
    except EmailError:
        db.rollback()
        raise HTTPException(status_code=502, detail="We couldn't send the confirmation email. Please try again.")
    db.commit()
    return {"message": f"We sent a confirmation link to {user.email}. Click it to activate your account."}


@router.post("/verify-email", dependencies=[Depends(auth_limit)])
def verify_email(data: TokenIn, db: Session = Depends(get_db)):
    user = use_link(db, data.token, "verify")
    user.email_verified = True
    db.commit()
    return make_token(user)  # confirmed: log them straight in


@router.post("/resend-verification", dependencies=[Depends(email_limit)])
def resend_verification(data: EmailIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email))
    if user and not user.email_verified and not recently_sent(db, user, "verify"):
        token = issue_link(db, user, "verify", VERIFY_LIFETIME)
        db.commit()
        background.add_task(send_quietly, send_verification_email, user.email, user.name, token)
    return {"message": CHECK_INBOX}


def move_to_team(db: Session, user: User, join_code: str) -> None:
    """Moves a salesperson into a teammate's team, using that team's invite code.
    Their claims in the old team are released. If nobody else is left in the old team,
    its leads come along, so a solo user who joins a team doesn't lose their work."""
    team = db.scalar(select(Team).where(Team.join_code == join_code))
    if not team or team.id == DEMO_TEAM_ID:
        raise HTTPException(status_code=400, detail="No team has this invite code. Ask a teammate to check it.")
    if team.id == user.team_id:
        return  # already in this team: just log in

    old_team_id = user.team_id
    db.execute(
        update(Lead)
        .where(Lead.team_id == old_team_id, Lead.claimed_by_id == user.id)
        .values(claimed_by_id=None, claimed_at=None)
    )
    others_left = db.scalar(select(User.id).where(User.team_id == old_team_id, User.id != user.id).limit(1))
    moved = 0
    if old_team_id and not others_left:
        moved = db.execute(update(Lead).where(Lead.team_id == old_team_id).values(team_id=team.id)).rowcount
    user.team_id = team.id
    db.commit()

    # open screens reload their lists: the old team sees the released claims, the new team any moved leads
    if old_team_id:
        broker.publish(old_team_id, {"type": "resync"})
    if moved:
        broker.publish(team.id, {"type": "resync"})
    db.refresh(user)


@router.post("/login", dependencies=[Depends(auth_limit)])
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.strip().lower()))
    # same message whether the email or the password is wrong, so attackers learn nothing
    if not user or not check_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong email or password.")
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="Please confirm your email first: click the link we sent you.")
    if data.join_code:
        move_to_team(db, user, data.join_code)
    return make_token(user)


@router.post("/forgot-password", dependencies=[Depends(email_limit)])
def forgot_password(data: EmailIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Always gives the same answer, so nobody can use this page to find out who has an account."""
    user = db.scalar(select(User).where(User.email == data.email))
    if user and user.email not in DEMO_EMAILS and not recently_sent(db, user, "reset"):
        token = issue_link(db, user, "reset", RESET_LIFETIME)
        db.commit()
        background.add_task(send_quietly, send_reset_email, user.email, user.name, token)
    return {"message": CHECK_INBOX}


@router.post("/reset-password", dependencies=[Depends(auth_limit)])
def reset_password(data: ResetIn, db: Session = Depends(get_db)):
    user = use_link(db, data.token, "reset")
    user.password_hash = hash_password(data.password)
    user.password_changed_at = now()
    user.email_verified = True  # the link reached their inbox, which proves the address is theirs
    db.commit()
    return make_token(user)


@router.post("/demo", dependencies=[Depends(auth_limit)])
def demo_login(data: DemoIn | None = None, db: Session = Depends(get_db)):
    """One-click login to a shared demo salesperson (A or B, both in the demo team)."""
    email, _ = DEMO_ACCOUNTS[(data or DemoIn()).who]
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        raise HTTPException(status_code=503, detail="Demo account not ready yet. Try again shortly.")
    return make_token(user)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_json(user)
