"""Database connection and table definitions (PostgreSQL via SQLAlchemy)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, create_engine, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from .config import DATABASE_URL, DEMO_EMAIL

# pool_pre_ping: checks a connection is alive before using it (Neon closes idle connections)
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=5)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


class Base(DeclarativeBase):
    pass


class User(Base):
    """A salesperson. Each one only ever sees their own leads."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(100))  # never the real password
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Lead(Base):
    __tablename__ = "leads"
    # speeds up "my leads, highest score first", the most common query
    __table_args__ = (Index("ix_leads_owner_score", "owner_id", "score"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    # contact details: shown to the salesperson, never sent to the AI
    phone: Mapped[str] = mapped_column(String(20), default="", server_default="")
    email: Mapped[str] = mapped_column(String(254), default="", server_default="")
    location: Mapped[str] = mapped_column(String(120), default="")
    requirement: Mapped[str] = mapped_column(String(200), default="")
    budget: Mapped[str] = mapped_column(String(60), default="")
    timeline: Mapped[str] = mapped_column(String(30), default="")
    message: Mapped[str] = mapped_column(Text)  # shown as "Customer remark"
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
    """Creates missing tables and upgrades the older version of the database (runs on startup)."""
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        # Older databases had a leads table without owners: add the column if it's missing
        conn.execute(text(
            "ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_id VARCHAR(32) "
            "REFERENCES users(id) ON DELETE CASCADE"
        ))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_leads_owner_score ON leads (owner_id, score)"))
        # v4: contact details
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NOT NULL DEFAULT ''"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS email VARCHAR(254) NOT NULL DEFAULT ''"))

    # Make sure the one-click demo account exists, and give it any leads that have no owner yet
    with SessionLocal() as db:
        demo = db.scalar(select(User).where(User.email == DEMO_EMAIL))
        if not demo:
            # random unusable password: the demo account is only reachable through the demo button
            demo = User(email=DEMO_EMAIL, name="Demo Salesperson", password_hash="!" + new_id())
            db.add(demo)
            db.commit()
        db.execute(text("UPDATE leads SET owner_id = :id WHERE owner_id IS NULL"), {"id": demo.id})
        db.commit()
