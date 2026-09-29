"""Validation rules for everything the browser sends us (Pydantic).
The frontend checks too, but THIS is the real security gate: anyone can bypass a browser."""
import re
import unicodedata
from typing import Literal

from pydantic import BaseModel, Field, field_validator

TIMELINES = ("Within 1 month", "1-3 months", "3-6 months", "6+ months", "Just exploring")
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _ok_char(ch: str, extra: str) -> bool:
    # letters/digits in any language, their accent marks (e.g. Hindi vowel signs), spaces, safe punctuation
    return ch.isalnum() or ch == " " or ch in extra or unicodedata.category(ch).startswith("M")


def _allowed(value: str, extra: str) -> str:
    """Allow letters/digits (any language) plus a small set of safe punctuation."""
    value = " ".join(value.split())  # trim and collapse repeated spaces
    bad = sorted({ch for ch in value if not _ok_char(ch, extra)})
    if bad:
        raise ValueError(f"these characters aren't allowed: {' '.join(bad)}")
    return value


def _clean_text(value: str) -> str:
    return CONTROL_CHARS.sub("", value).strip()


def _required(value: str, minimum: int = 2) -> str:
    """Spaces-only input passes the length check, so we check again after cleaning."""
    if len(value) < minimum:
        raise ValueError("is required" if not value else f"must have at least {minimum} characters")
    return value


class LeadIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(default="", max_length=20)
    email: str = Field(default="", max_length=254)
    # the six assignment fields are all required; phone and email are optional extras
    location: str = Field(max_length=120)
    requirement: str = Field(max_length=200)
    budget: str = Field(max_length=60)
    timeline: Literal[TIMELINES]  # only these exact values are accepted
    message: str = Field(max_length=2000)

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        v = _required(_allowed(v, ".'-"))
        if any(ch.isdigit() for ch in v):
            raise ValueError("numbers aren't allowed")
        return v

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str) -> str:
        """Optional. Accepts spaces, dashes and brackets while typing, stores only + and digits."""
        v = v.strip()
        if not v:
            return ""
        if any(not (ch.isdigit() or ch in "+ -()") for ch in v):
            raise ValueError("only digits, spaces and + - ( ) are allowed")
        digits = "".join(ch for ch in v if ch.isdigit())
        if not 10 <= len(digits) <= 15:
            raise ValueError("must have 10 to 15 digits")
        if v.startswith("+"):
            return "+" + digits
        if len(digits) == 10 and digits[0] not in "6789":
            raise ValueError("an Indian mobile number starts with 6, 7, 8 or 9")
        return digits

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        """Optional. Must look like name@domain.com if given."""
        v = v.strip().lower()
        if v and not EMAIL_RE.match(v):
            raise ValueError("please enter a valid email address")
        return v

    @field_validator("location")
    @classmethod
    def check_location(cls, v: str) -> str:
        return _required(_allowed(v, ",.-/()"))

    @field_validator("requirement")
    @classmethod
    def check_requirement(cls, v: str) -> str:
        return _required(_allowed(v, ",.-/+()&"))

    @field_validator("budget")
    @classmethod
    def check_budget(cls, v: str) -> str:
        return _required(_allowed(v, "₹.,-+/"))

    @field_validator("message")
    @classmethod
    def check_message(cls, v: str) -> str:
        # free text: customers may include emails etc., so we only strip invisible control characters
        return _required(_clean_text(v), 5)


class ChatIn(BaseModel):
    question: str = Field(max_length=1000)

    @field_validator("question")
    @classmethod
    def clean(cls, v: str) -> str:
        return _required(_clean_text(v), 1)


class CallIn(BaseModel):
    notes: str = Field(max_length=3000)

    @field_validator("notes")
    @classmethod
    def clean(cls, v: str) -> str:
        return _required(_clean_text(v), 3)
