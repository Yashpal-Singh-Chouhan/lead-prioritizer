"""Reads settings from environment variables (the 'safe'), so no secrets live in the code."""
import os

from dotenv import load_dotenv

load_dotenv()  # loads backend/.env when running locally; hosting platforms set real env vars

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_API_URL = os.getenv("GROQ_API_URL", "https://api.groq.com/openai/v1/chat/completions")

# Neon gives a URL starting with postgresql:// ; SQLAlchemy needs to know to use the psycopg driver
_raw_db_url = os.getenv("DATABASE_URL", "")
DATABASE_URL = _raw_db_url.replace("postgresql://", "postgresql+psycopg://", 1).replace(
    "postgres://", "postgresql+psycopg://", 1
)

# Which websites may call this API (CORS). Comma-separated list.
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()
]

# Secret used to sign login tokens. MUST be set to a long random value in production.
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me")
TOKEN_HOURS = int(os.getenv("TOKEN_HOURS", "12"))
DEMO_EMAIL = "demo@leadprioritizer.app"
