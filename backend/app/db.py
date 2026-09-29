"""Database connection and table definitions (PostgreSQL via SQLAlchemy)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Integer, String, Text, DateTime, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from .config import DATABASE_URL

# pool_pre_ping: checks a connection is alive before using it (Neon closes idle connections)
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=5)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


class Base(DeclarativeBase):
    pass


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(80))
    location: Mapped[str] = mapped_column(String(120), default="")
    requirement: Mapped[str] = mapped_column(String(200), default="")
    budget: Mapped[str] = mapped_column(String(60), default="")
    timeline: Mapped[str] = mapped_column(String(30), default="")
    message: Mapped[str] = mapped_column(Text)
    # score and priority are copied out of the analysis so the list can be sorted fast (indexed)
    score: Mapped[int] = mapped_column(Integer, index=True)
    priority: Mapped[str] = mapped_column(String(4), index=True)
    analysis: Mapped[dict] = mapped_column(JSONB)  # the full AI analysis, stored as JSON
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    # one lead has many calls and chat messages; deleting a lead deletes them too
    calls: Mapped[list["CallLog"]] = relationship(
        back_populates="lead", cascade="all, delete-orphan", order_by="CallLog.created_at.desc()"
    )
    chat: Mapped[list["ChatMessage"]] = relationship(
        back_populates="lead", cascade="all, delete-orphan", order_by="ChatMessage.id"
    )


class CallLog(Base):
    __tablename__ = "call_logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    lead_id: Mapped[str] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    notes: Mapped[str] = mapped_column(Text)
    outcome: Mapped[str] = mapped_column(Text)
    previous_score: Mapped[int] = mapped_column(Integer)
    new_score: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    lead: Mapped[Lead] = relationship(back_populates="calls")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lead_id: Mapped[str] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(10))  # "user" or "assistant"
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    lead: Mapped[Lead] = relationship(back_populates="chat")


def create_tables() -> None:
    """Creates the tables if they don't exist yet (runs when the server starts)."""
    Base.metadata.create_all(engine)
