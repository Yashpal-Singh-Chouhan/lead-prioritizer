"""Database connection and table definitions (PostgreSQL via SQLAlchemy)."""
import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, create_engine, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from .config import DATABASE_URL, DEMO_ACCOUNTS, DEMO_EMAIL, DEMO_TEAM_ID

# pool_pre_ping: checks a connection is alive before using it (Neon closes idle connections)
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=5)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

# join codes avoid look-alike characters (0/O, 1/I/L) so they're easy to read out on a call
JOIN_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


def new_join_code() -> str:
    return "".join(secrets.choice(JOIN_CODE_CHARS) for _ in range(8))


class Base(DeclarativeBase):
    pass


class Team(Base):
    """A sales team. Everyone in a team sees the same leads; other teams never see them."""

    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(60))
    join_code: Mapped[str] = mapped_column(String(12), unique=True, default=new_join_code)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class User(Base):
    """A salesperson, always part of one team."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(100))  # never the real password
    team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id", ondelete="SET NULL"), index=True)
    # no access until the owner of the address clicks the link we email them
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    # login tokens issued before this moment stop working (e.g. after a password reset)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    team: Mapped[Team | None] = relationship()


class AuthToken(Base):
    """One-time links for 'verify your email' and 'reset your password'.
    Only a SHA-256 hash is stored, so a leaked database can't be used to take over accounts."""

    __tablename__ = "auth_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purpose: Mapped[str] = mapped_column(String(10))  # "verify" or "reset"
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Lead(Base):
    __tablename__ = "leads"
    # speeds up "my team's leads, highest score first", the most common query
    __table_args__ = (
        Index("ix_leads_owner_score", "owner_id", "score"),
        Index("ix_leads_team_score", "team_id", "score"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))  # who added it
    # who claimed ("opted in to") the lead: only they can work on it; empty = open for anyone in the team
    claimed_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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

    # loaded together with the lead, so every lead can show "added by" and "claimed by" names
    owner: Mapped[User] = relationship(foreign_keys=[owner_id], lazy="joined")
    claimed_by: Mapped[User | None] = relationship(foreign_keys=[claimed_by_id], lazy="joined")
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
    """Creates missing tables and upgrades older versions of the database (runs on startup)."""
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
        # v5: teams, email verification, claiming
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id VARCHAR(32) REFERENCES teams(id) ON DELETE SET NULL"
        ))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_team_id ON users (team_id)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ"))
        conn.execute(text(
            "ALTER TABLE leads ADD COLUMN IF NOT EXISTS team_id VARCHAR(32) REFERENCES teams(id) ON DELETE CASCADE"
        ))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_leads_team_score ON leads (team_id, score)"))
        conn.execute(text(
            "ALTER TABLE leads ADD COLUMN IF NOT EXISTS claimed_by_id VARCHAR(32) REFERENCES users(id) ON DELETE SET NULL"
        ))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ"))

    with SessionLocal() as db:
        # The demo team and its two salespeople (only reachable through the demo buttons)
        if not db.get(Team, DEMO_TEAM_ID):
            db.add(Team(id=DEMO_TEAM_ID, name="Demo team"))
            db.flush()
        for email, name in DEMO_ACCOUNTS.values():
            demo = db.scalar(select(User).where(User.email == email))
            if not demo:
                # random unusable password: demo accounts can't be logged into with a password
                demo = User(email=email, password_hash="!" + new_id())
                db.add(demo)
            demo.name, demo.team_id, demo.email_verified = name, DEMO_TEAM_ID, True
        db.flush()

        # Accounts from before teams existed each get their own team (they can share its join code)
        for user in db.scalars(select(User).where(User.team_id.is_(None))).all():
            user.team = Team(name=f"{user.name.split()[0]}'s team")
        db.flush()

        # Leads without an owner go to the demo account; leads without a team join their owner's team
        demo_a = db.scalar(select(User).where(User.email == DEMO_EMAIL))
        db.execute(text("UPDATE leads SET owner_id = :id WHERE owner_id IS NULL"), {"id": demo_a.id})
        db.execute(text(
            "UPDATE leads SET team_id = users.team_id FROM users "
            "WHERE leads.owner_id = users.id AND leads.team_id IS NULL"
        ))
        db.commit()
