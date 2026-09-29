# Lead Prioritizer — AI lead triage for real-estate sales teams

**Live app (Vercel):** _add link_
**Backend API (FastAPI in Docker on Render):** _add link_ (free tier sleeps; first load can take ~50s)
**Demo video:** _add link_

## What I built

A web app that helps a real-estate salesperson decide **who to call first and what to say**.

1. **Lead intake** – form for name, location, property requirement, budget, buying timeline and the customer's message/chat transcript (with a one-click example).
2. **AI analysis** – each lead gets a summary, intent, key requirements, objections, recommended next action and a ready-to-send reply, plus a **0–100 lead score** with a one-line reason.
3. **Lead list & prioritization** – all leads saved in PostgreSQL, grouped into 🔥 Hot / 🌤 Warm / ❄️ Cold and sorted by score, so the top of the list is always the next call.
4. **Grounded chat** – ask follow-ups about one lead ("what should I emphasize on the call?", "make my reply more assertive"). Every question is sent with that lead's details, analysis and call history.
5. **Scannable display** – the "Next action" is the most prominent element; everything else is short cards. Reply can be copied or opened directly in WhatsApp.
6. **My own feature: "After the call" re-scoring** – after speaking to a customer, the salesperson pastes call notes (or a call transcript). The AI updates the lead: new score, new next action, new reply, and a logged outcome showing the score change (e.g. `62 → 81 (+19)`). The lead moves between Hot/Warm/Cold automatically.

**Why this feature:** a lead's first message is the weakest signal about it. What really tells you whether someone will buy is the conversation. Without this, the ranking goes stale after the first call and the salesperson falls back to memory and spreadsheets. It also connects directly to Masal AI's product: AI voice-call transcripts could flow into this same step automatically.

## Architecture

```
Browser                          Backend (Docker on Render)                Managed services
┌───────────────────────┐ HTTPS ┌─────────────────────────────────┐
│ Next.js + React (TS)  │ ────► │ FastAPI (Python)                │ ────► PostgreSQL (Neon)
│ on Vercel             │ JSON  │  ├─ Pydantic input validation   │
│ Tailwind CSS          │ ◄──── │  ├─ SQLAlchemy (DB access)      │ ────► Groq LLM API
│ Input checks (UX)     │       │  ├─ prompts + score rules       │
└───────────────────────┘       │  └─ CORS allowlist, rate limit  │
                                └─────────────────────────────────┘
```

**Frontend** (`app/`, `components/`, `lib/`) – Next.js + React + TypeScript, styled with Tailwind. Only screens; it never sees the AI key. Talks to the backend at `NEXT_PUBLIC_API_URL`.

**Backend** (`backend/app/`)
- `main.py` – FastAPI app: endpoints, CORS, error handling, rate limit.
- `schemas.py` – Pydantic validation rules (the real security gate).
- `db.py` – PostgreSQL tables via SQLAlchemy (created automatically on startup).
- `ai.py` – the single function that calls Groq.
- `prompts.py` – prompts, scoring rubric, and `normalize_analysis` (cleans AI output).

**Database tables**
- `leads` – form fields, `score` and `priority` (indexed, for fast sorting), and the full AI `analysis` as JSONB.
- `call_logs` – each logged call with previous and new score.
- `chat_messages` – the saved conversation per lead.
Deleting a lead cascades to its calls and messages.

**API**

| Method | Path | Purpose |
|---|---|---|
| GET | `/leads?limit=20&offset=0` | Paginated list, highest score first |
| POST | `/leads` | Validate, analyze with AI, save |
| GET | `/leads/{id}` | One lead with chat history |
| POST | `/leads/{id}/chat` | Grounded chat about that lead |
| POST | `/leads/{id}/calls` | Log a call and re-score (own feature) |
| DELETE | `/leads/{id}` | Delete a lead |
| GET | `/healthz` | Health check |

Interactive API docs are auto-generated at `<backend-url>/docs`.

## AI model / API

- **Provider:** Groq (free tier), OpenAI-compatible Chat Completions endpoint, called from the backend with `httpx`.
- **Model:** `openai/gpt-oss-120b` by default, configurable with `GROQ_MODEL`.
- **Analysis & re-scoring:** JSON mode, temperature 0.2, explicit scoring rubric in the prompt.
- **Chat:** system prompt contains the lead, its analysis and call history; the last 11 messages plus the new question are sent.

## Key technical decisions

- **AI gives the score, code gives the label.** Hot ≥70, Warm 40–69, Cold <40, computed in Python so labels are consistent and tunable.
- **Never trust raw AI output.** `normalize_analysis` clamps the score, fills missing fields and fixes types.
- **Strict inputs.** Timeline is a fixed list; name allows only letters (any language) and `. ' -`; location, requirement and budget allow letters, digits and a few safe symbols, so values like `2 BHK` pass and `@`, `<`, `>` are rejected. Checked in the browser for a quick response and again in FastAPI, which is the real gate. The customer message stays free text (it may contain emails) but has control characters stripped, a length limit, and is marked as untrusted in prompts (prompt-injection guard).
- **Security basics.** AI key and database URL only in server environment variables; CORS allowlist; parameterized queries via SQLAlchemy; per-IP rate limit on AI endpoints; readable errors without internal details; container runs as a non-root user.
- **Pagination.** 20 leads per page, sorted by an indexed score column, with "Load more".
- **Hosting split.** Frontend on Vercel (built for Next.js); backend in Docker on Render (runs anywhere); database on Neon (free managed Postgres that doesn't expire).

## Run locally

Requirements: Node.js 20+, Python 3.11+, a free Groq key (https://console.groq.com/keys), a free Neon Postgres database (https://neon.tech).

Backend:
```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt    # macOS/Linux: .venv/bin/python
cp .env.example .env                                        # fill in GROQ_API_KEY and DATABASE_URL
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Frontend (second terminal, project root):
```bash
npm install
cp .env.example .env.local        # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                       # open http://localhost:3000
```

Backend with Docker:
```bash
cd backend
docker build -t lead-prioritizer-api .
docker run -p 8000:8000 --env-file .env lead-prioritizer-api
```

## Known limitations

- No authentication: anyone with the link sees the same leads. First production step: user accounts and per-team data.
- Tables are created on startup instead of versioned migrations (Alembic would be next).
- The rate limit is kept in server memory, so it resets on restart and wouldn't be shared across multiple servers (Redis would fix this).
- Offset pagination; cursor pagination would be more stable at large scale.
- Free-tier Groq rate limits: bursts of requests can briefly fail with a "busy" message.
- Scores come from an LLM with a rubric; they are consistent-ish, not calibrated against real conversion data.
- Leads are entered one at a time (no CSV/CRM import yet).
- Render free tier sleeps after inactivity, so the first request can take up to a minute.

## AI usage disclosure

_Fill in honestly, e.g.:_ Claude (Anthropic) as a mentor to plan the architecture, generate and explain the Next.js frontend and FastAPI backend code, write prompts, the Dockerfile and a README draft. I reviewed, ran and tested every part, and can explain each file.
