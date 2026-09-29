"""Sign up, log in, and 'who is calling?' checks.

Passwords are stored as bcrypt hashes (a one-way scramble).
After login the server hands out a signed token (JWT). The browser sends it with every
request, and get_current_user() checks it before any lead data is touched."""
import re
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import DEMO_EMAIL, JWT_SECRET, TOKEN_HOURS
from .db import SessionLocal, User
from .ratelimit import rate_limit

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------- Input rules ----------

class SignupIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=72)  # bcrypt only uses the first 72 bytes

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
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("please enter a valid email address")
        return v


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=72)


# ---------- Helpers ----------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def check_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:  # e.g. the demo account's unusable password
        return False


def make_token(user: User) -> dict:
    expires = datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)
    token = jwt.encode({"sub": user.id, "exp": expires}, JWT_SECRET, algorithm="HS256")
    return {"token": token, "user": {"id": user.id, "name": user.name, "email": user.email}}


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    """Runs before every protected endpoint: no valid token, no data."""
    if not creds:
        raise HTTPException(status_code=401, detail="Please log in.")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Your session expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Please log in.")
    user = db.get(User, payload.get("sub"))
    if not user:
        raise HTTPException(status_code=401, detail="Please log in.")
    return user


# ---------- Endpoints ----------

@router.post("/signup", status_code=201, dependencies=[Depends(rate_limit("auth", 10))])
def signup(data: SignupIn, db: Session = Depends(get_db)):
    if data.email == DEMO_EMAIL or db.scalar(select(User).where(User.email == data.email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(name=data.name, email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    return make_token(user)


@router.post("/login", dependencies=[Depends(rate_limit("auth", 10))])
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.strip().lower()))
    # same message whether the email or the password is wrong, so attackers learn nothing
    if not user or not check_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong email or password.")
    return make_token(user)


@router.post("/demo", dependencies=[Depends(rate_limit("auth", 10))])
def demo_login(db: Session = Depends(get_db)):
    """One-click login to the shared demo account, so reviewers can test instantly."""
    user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if not user:
        raise HTTPException(status_code=503, detail="Demo account not ready yet. Try again shortly.")
    return make_token(user)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "name": user.name, "email": user.email}
