"""Validation rules for everything the browser sends us (Pydantic).
The frontend checks too, but THIS is the real security gate: anyone can bypass a browser."""
import re
import unicodedata
from typing import Literal

from pydantic import BaseModel, Field, field_validator

TIMELINES = ("", "Within 1 month", "1-3 months", "3-6 months", "6+ months", "Just exploring")
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


class LeadIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    location: str = Field(default="", max_length=120)
    requirement: str = Field(default="", max_length=200)
    budget: str = Field(default="", max_length=60)
    timeline: Literal[TIMELINES] = ""  # only these exact values are accepted
    message: str = Field(min_length=1, max_length=2000)

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        v = _allowed(v, ".'-")
        if any(ch.isdigit() for ch in v):
            raise ValueError("numbers aren't allowed")
        return v

    @field_validator("location")
    @classmethod
    def check_location(cls, v: str) -> str:
        return _allowed(v, ",.-/()")

    @field_validator("requirement")
    @classmethod
    def check_requirement(cls, v: str) -> str:
        return _allowed(v, ",.-/+()&")

    @field_validator("budget")
    @classmethod
    def check_budget(cls, v: str) -> str:
        return _allowed(v, "₹.,-+/")

    @field_validator("message")
    @classmethod
    def check_message(cls, v: str) -> str:
        # free text: customers may include emails etc., so we only strip invisible control characters
        v = _clean_text(v)
        if not v:
            raise ValueError("can't be empty")
        return v


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)

    @field_validator("message")
    @classmethod
    def clean(cls, v: str) -> str:
        return _clean_text(v)


class CallIn(BaseModel):
    notes: str = Field(min_length=3, max_length=3000)

    @field_validator("notes")
    @classmethod
    def clean(cls, v: str) -> str:
        return _clean_text(v)
