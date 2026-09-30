# Lead Prioritizer — AI lead triage for real-estate sales teams

**Live app (Vercel):** https://lead-prioritizer.vercel.app (use "Try the demo account" to log in instantly)
**Backend API (FastAPI in Docker on Render):** https://lead-prioritizer-api.onrender.com (interactive docs at [/docs](https://lead-prioritizer-api.onrender.com/docs)) (free tier sleeps; first load can take ~50s)
**Demo video:** _add link_

## What I built

A web app that helps a real-estate salesperson decide **who to call first, what to say, and how to act**.

1. **Lead intake** – name, location, property requirement, budget, buying timeline and the customer's message are all required (phone and email optional). Every field shows its own error; the same rules are enforced again by the backend. One-click "Fill with an example".
2. **AI analysis (real LLM, structured JSON)** – lead summary, customer intent, key requirements, objections/concerns (or an explicit "No major objection identified"), recommended next action and a ready-to-send customer response.
3. **Transparent priority score** – the AI scores five signals separately (timeline & urgency /30, budget clarity /20, requirement clarity /20, purchase intent /15, customer engagement /15, minus up to 15 for serious objections). **Our code adds them up** to a 0–100 score and maps it to 🔥 HOT (≥70) / 🌤 WARM (40–69) / ❄️ COLD (<40). The lead page shows every signal with its points and a one-line reason, plus a plain-English explanation.
4. **Lead dashboard (first screen)** – every lead in one scannable table: priority, score, name, location, requirement, budget, timeline, short AI summary and next action. Filter by priority (chips show counts), sort by score / most urgent timeline / newest, search by name, location or property. Filtering and sorting happen in the database. Pipeline insights (score distribution, timelines, new leads per day, calls logged) below.
5. **Lead detail page** – customer information, the original message, full AI analysis, score breakdown, suggested response with **Copy Response** and **Send on WhatsApp**.
6. **Grounded conversational AI** – ask follow-ups about one lead ("What should I emphasize on the call?", "Make my reply more assertive", "Why is this lead considered hot?", "Give me a short call script"...). Every request sends that lead's details, message, analysis, action plan and call history to the model. The conversation is saved with the lead.
7. **My own feature: Sales Action Plan** – see below.
8. **Extra: "After the call" re-scoring** – paste call notes; the AI updates the score, analysis, action plan and reply, and logs the change (e.g. `69 → 34 (−35)`). The lead moves between HOT/WARM/COLD automatically.
9. **Accounts** – sign up / log in; each salesperson sees only their own leads. **"Try the demo account"** gives reviewers one-click access. (The brief makes auth optional; it's kept because a shared, deployed app would otherwise mix everyone's leads.)

### Original feature: Sales Action Plan

The AI analysis tells the salesperson **what** the lead looks like. The Sales Action Plan tells them **how to act on it**, covering before, during and after the conversation:

| Step | When | Content |
|---|---|---|
| 1. Immediate action | Right now | e.g. "Call Rahul within 2 hours and offer a Saturday site visit" |
| 2. Questions to ask | On the call | 2–4 questions that fill the most important gaps (budget ceiling, loan, must-have location...) |
| 3. Call talking points | On the call | 2–4 points to emphasize, based on this customer's needs and concerns |
| 4. Follow-up | After the call | e.g. "Send 3 matching properties after the call" |

It is generated in the same structured AI call as the analysis (no extra request), validated like every other field, shown as a highlighted card on the lead page with **Copy plan**, and **regenerated after every logged call**, so it always describes the *next* step. The chat model also receives it, so "give me a call script" follows the plan. Leads saved before the feature existed get a "Generate Sales Action Plan" button (`POST /leads/{id}/analyze`).

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

**Frontend** (`app/`, `components/`, `lib/`) – Next.js + React + TypeScript, styled with Tailwind. Only screens; it never sees the AI key. Talks to the backend at `NEXT_PUBLIC_API_URL`, sending the login token with every request.

Pages are split by **user task**, not by feature:

| Route | Task |
|---|---|
| `/login` | Log in, sign up, or try the demo account |
| `/dashboard` | **First screen.** All leads with filter / sort / search, pipeline insights |
| `/leads` | Workspace: prioritized list on the left |
| `/leads/new` | Add a lead (list stays visible) |
| `/leads/[id]` | Work one lead: analysis, action plan, reply, chat, call log. Shareable URL |

`app/(app)/layout.tsx` protects every page except login and holds the shared leads state (`lib/leads-context.tsx`), so switching pages is instant.

**Backend** (`backend/app/`)
- `main.py` – FastAPI app: lead endpoints, dashboard stats, CORS, error handling.
- `auth.py` – sign up / log in / demo login, bcrypt password hashing, JWT tokens, and `get_current_user` (runs before every protected endpoint).
- `ratelimit.py` – per-visitor request limits (AI and login endpoints).
- `schemas.py` – Pydantic validation rules (the real security gate).
- `db.py` – PostgreSQL tables via SQLAlchemy (created automatically on startup).
- `ai.py` – the only code that calls Groq; `call_ai_json` retries once if the model returns invalid JSON.
- `prompts.py` – prompts, the scoring signals, and `normalize_analysis` (validates AI output and adds up the score).

**Database tables**
- `users` – name, unique email, bcrypt password hash.
- `leads` – `owner_id` (which salesperson), form fields including optional `phone` and `email`, `score` and `priority` (index on owner + score for fast "my leads, best first"), and the full AI `analysis` as JSONB.
- `call_logs` – each logged call with previous and new score.
- `chat_messages` – the saved conversation per lead.
Deleting a lead cascades to its calls and messages. On startup the server creates missing tables and upgrades older databases (adds `owner_id`, `phone` and `email`; assigns ownerless leads to the demo account).

**API**

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/signup`, `/auth/login`, `/auth/demo` | Get a login token |
| GET | `/auth/me` | Who am I |
| GET | `/leads?limit=20&offset=0&priority=Hot&sort=score&q=pune` | MY leads, paginated; filter by priority, sort by `score` / `urgent` / `newest`, search |
| POST | `/leads` | Validate, analyze with AI, save |
| GET | `/leads/{id}` | One lead with chat history |
| POST | `/leads/{id}/analyze` | Re-run the analysis (includes call history) |
| POST | `/leads/{id}/chat` | Grounded chat about that lead |
| POST | `/leads/{id}/calls` | Log a call and re-score (own feature) |
| DELETE | `/leads/{id}` | Delete a lead |
| GET | `/stats` | Dashboard numbers (SQL GROUP BY) |
| GET | `/healthz` | Health check |

All `/leads` and `/stats` endpoints require `Authorization: Bearer <token>` and only touch the caller's own leads.

Interactive API docs are auto-generated at `<backend-url>/docs`.

## AI model / API

- **Provider:** Groq (free tier), OpenAI-compatible Chat Completions endpoint, called from the backend with `httpx`.
- **Model:** `openai/gpt-oss-120b` by default, configurable with `GROQ_MODEL`.
- **Analysis & re-scoring:** JSON mode, temperature 0.2, explicit per-signal rubric in the prompt. Output shape:
  ```ts
  { summary, intent, keyRequirements: string[], objections: string[], nextAction, suggestedResponse,
    scoreBreakdown: { timeline | budget | requirement | intent | engagement: { points, note } },
    objectionPenalty, scoreReason,
    actionPlan: { immediateAction, questionsToAsk: string[], talkingPoints: string[], followUp } }
  ```
- **Chat:** system prompt contains the lead, its analysis, action plan and call history; the last 11 messages plus the new question are sent. Answers render simple markdown (bold, bullets, steps) as React elements, with no HTML injection.

## Key technical decisions

- **AI scores the signals, code does the maths.** The model rates each signal within its range; Python clamps each one, adds them up, subtracts the objection penalty and picks HOT/WARM/COLD. The score can't disagree with its own breakdown, and thresholds live in one place.
- **Never trust raw AI output.** `normalize_analysis` validates every field: clamps points, fills missing fields, fixes types, limits list lengths, drops "None"-style objections, and replaces typographic characters that paste badly into WhatsApp.
- **Objections: never invented, never ignored.** The prompt lists concern types (price, competitors, financing, location, timeline, missing info) and asks for `[]` only when none apply; the UI then says "No major objection identified".
- **Contact details stay out of the AI.** Phone and email are stored and shown to the salesperson (tap to call, email, or open the customer's WhatsApp chat with the suggested reply pre-filled) but are never included in prompts: the AI doesn't need them to analyze a lead, so they aren't shared with a third party (data minimization).
- **Phone numbers.** Optional. The phone box only accepts digits, spaces and `+ - ( )`; the backend requires 10–15 digits, checks that a 10-digit number looks like an Indian mobile (starts with 6–9), and stores it cleaned (`98765 43210` → `9876543210`). A 10-digit number is assumed to be Indian (+91) for WhatsApp links.
- **Strict inputs.** Timeline is a fixed list; name allows only letters (any language) and `. ' -`; location, requirement and budget allow letters, digits and a few safe symbols, so values like `2 BHK` pass and `@`, `<`, `>` are rejected. Checked in the browser for a quick response and again in FastAPI, which is the real gate. The customer message stays free text (it may contain emails) but has control characters stripped, a length limit, and is marked as untrusted in prompts (prompt-injection guard).
- **Security basics.** AI key and database URL only in server environment variables; CORS allowlist; parameterized queries via SQLAlchemy; per-IP rate limit on AI endpoints; readable errors without internal details; container runs as a non-root user.
- **Authentication.** Passwords hashed with bcrypt; login returns a signed JWT (12-hour expiry). Every lead query filters by owner in the backend. Someone else's lead returns "not found" rather than "forbidden", so its existence isn't revealed. Login errors don't say whether the email or the password was wrong. Login endpoints are rate-limited against password guessing.
- **Dashboard aggregates in the database.** `/stats` uses SQL `GROUP BY`, so the browser gets a small summary instead of every lead. Charts are plain Tailwind bars: no chart library needed for simple bars.
- **Pages by task, not by feature.** Everything needed to act on one lead is on one screen; the list stays visible while you work.
- **Pagination.** 20 leads per page, sorted by an indexed score column, with "Load more".
- **Hosting split.** Frontend on Vercel (built for Next.js); backend in Docker on Render (runs anywhere); database on Neon (free managed Postgres that doesn't expire).

## Run locally

Requirements: Node.js 20+, Python 3.11+, a free Groq key (https://console.groq.com/keys), a free Neon Postgres database (https://neon.tech).

Backend:
```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt    # macOS/Linux: .venv/bin/python
cp .env.example .env                                        # fill in GROQ_API_KEY, DATABASE_URL, JWT_SECRET
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

- The login token is kept in the browser's localStorage. Simple and works across the two domains (Vercel and Render), but readable by scripts if the site ever had an XSS bug; with a shared domain, an httpOnly cookie would be safer.
- No password reset, email verification, or team/manager roles yet. The demo account is shared by everyone who uses it.
- Tables are created on startup instead of versioned migrations (Alembic would be next).
- The rate limit is kept in server memory, so it resets on restart and wouldn't be shared across multiple servers (Redis would fix this).
- Offset pagination; cursor pagination would be more stable at large scale.
- Free-tier Groq rate limits: bursts of requests can briefly fail with a "busy" message.
- Scores come from an LLM with a per-signal rubric: explainable and fairly consistent, but not calibrated against real conversion data.
- Leads are entered one at a time (no CSV/CRM import yet).
- Render free tier sleeps after inactivity, so the first request can take up to a minute.

## AI usage disclosure

- **Building the app:** I used Claude Code (Anthropic's AI coding assistant) throughout: to plan the architecture, write and explain the Next.js frontend and FastAPI backend, design the AI prompts and JSON schema, write the Dockerfile and this README, debug deployment issues, and record and edit the walkthrough video. I directed the work, reviewed the code, ran and tested the app, and can explain every file.
- **Inside the app:** lead analysis, the Sales Action Plan, lead chat and re-scoring after a call use `openai/gpt-oss-120b` via the Groq API, called only from the backend. All the AI output is validated JSON; the lead score itself is added up in Python from the AI's per-signal ratings.
