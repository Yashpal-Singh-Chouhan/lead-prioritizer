# Lead Prioritizer — AI lead triage for real-estate sales teams

**Live app (Vercel):** https://lead-prioritizer.vercel.app (click "Demo salesperson A" to log in instantly; open "Demo salesperson B" in a second tab to watch claims sync live)
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
9. **Teams and accounts** – sign up by starting a team (you get an 8-character invite code) or joining one with a teammate's code. Everyone in a team shares one lead list; other teams never see it. New accounts must **confirm their email** through a one-time link before they can log in, and **"Forgot password?"** emails a 30-minute reset link. Two one-click demo salespeople (A and B, same demo team) give reviewers instant access.
10. **Claiming leads (no two salespeople on one customer)** – a salesperson claims ("opts in to") an open lead; teammates instantly see it as taken (🔒 name) and get a view-only page: no call/WhatsApp buttons, no AI chat, no call logging. If two people click Claim at the same moment, the database lets exactly one win and the other sees "Too late: Priya has already claimed this lead". Claims, releases, new leads and re-scores appear on every teammate's screen within a moment (live updates, no refresh), with a small notice. The dashboard has **All team leads / Open to claim / My leads** views.

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
| `/login` | Log in, or one-click demo salesperson A / B |
| `/signup` | Create an account; start a team or join with an invite code |
| `/forgot-password`, `/reset-password` | Email a reset link; choose a new password |
| `/verify-email` | Where the confirmation email lands |
| `/dashboard` | **First screen.** All team leads with claim status, views (all / open / mine), filter / sort / search, pipeline insights. Filters are kept in the URL, so Back returns to the same filtered list |
| `/leads` | Workspace: prioritized list on the left |
| `/leads/new` | Add a lead (list stays visible) |
| `/leads/[id]` | Work one lead: analysis, action plan, reply, chat, call log. Shareable URL |

`app/(app)/layout.tsx` protects every page except login and holds the shared leads state (`lib/leads-context.tsx`), so switching pages is instant.

**Backend** (`backend/app/`)
- `main.py` – FastAPI app: lead endpoints, dashboard stats, CORS, error handling.
- `auth.py` – sign up (with team) / email verification / log in / forgot + reset password / demo login, bcrypt password hashing, JWT tokens, and `get_current_user` (runs before every protected endpoint).
- `emails.py` – sends the verification and reset emails through Brevo's HTTP API (prints them to the console when no key is set).
- `realtime.py` – the in-memory "broker" behind live updates: one queue per open browser tab, grouped by team.
- `ratelimit.py` – per-visitor request limits (AI and login endpoints).
- `schemas.py` – Pydantic validation rules (the real security gate).
- `db.py` – PostgreSQL tables via SQLAlchemy (created automatically on startup).
- `ai.py` – the only code that calls Groq; `call_ai_json` retries once if the model returns invalid JSON.
- `prompts.py` – prompts, the scoring signals, and `normalize_analysis` (validates AI output and adds up the score).

**Database tables**
- `teams` – name and unique invite (join) code.
- `users` – name, unique email, bcrypt password hash, `team_id`, `email_verified`, `password_changed_at` (tokens issued before it stop working).
- `auth_tokens` – one-time email links (purpose `verify` / `reset`), stored only as SHA-256 hashes, with expiry and used-at time.
- `leads` – `team_id`, `owner_id` (who added it), `claimed_by_id` / `claimed_at` (who is working it; empty = open), form fields including optional `phone` and `email`, `score` and `priority` (index on team + score for fast "team leads, best first"), and the full AI `analysis` as JSONB.
- `call_logs` – each logged call with previous and new score.
- `chat_messages` – the saved conversation per lead.
Deleting a lead cascades to its calls and messages. On startup the server creates missing tables and upgrades older databases (adds `owner_id`, `phone` and `email`; assigns ownerless leads to the demo account).

**API**

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/signup` | Create account + team (or join one); sends the confirmation email |
| POST | `/auth/verify-email`, `/auth/login`, `/auth/demo`, `/auth/reset-password` | Get a login token |
| POST | `/auth/resend-verification`, `/auth/forgot-password` | Email a new link (same answer whether or not the account exists) |
| GET | `/auth/me` | Who am I |
| GET | `/leads?limit=20&offset=0&view=open&priority=Hot&sort=score&q=pune` | Team leads, paginated; `view` = `all` / `open` / `mine`, filter by priority, sort by `score` / `urgent` / `newest`, search |
| POST | `/leads` | Validate, analyze with AI, save |
| GET | `/leads/{id}` | One lead with chat history |
| POST | `/leads/{id}/claim`, `/leads/{id}/release` | Claim an open lead (409 if a teammate got it first) / give it back |
| GET | `/events` | Live updates for the team (server-sent events stream) |
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
- **Authentication.** Passwords hashed with bcrypt; login returns a signed JWT (12-hour expiry). Every lead query filters by team in the backend. Another team's lead returns "not found" rather than "forbidden", so its existence isn't revealed. Login errors don't say whether the email or the password was wrong. Login endpoints are rate-limited against password guessing.
- **Email ownership is proven, not guessed.** A format check can't tell a real address from a made-up one, so new accounts stay locked until the link we email is clicked. Links are random 256-bit tokens, stored only as hashes, single-use (row-locked when used) and short-lived (24 h to verify, 30 min to reset); requesting a new link cancels the old one. "Forgot password" gives the same answer for every email, so it can't be used to discover accounts. A password reset logs out every device that still has a token from before. The confirmation page waits for a click, because some email apps open links automatically to scan them.
- **Brevo over SMTP for email.** Free hosts like Render block outgoing SMTP ports, but an HTTPS API call always works; Brevo's free tier sends 300 emails a day to any address.
- **The database decides who gets a lead.** Claiming is one statement, `UPDATE leads SET claimed_by_id = me WHERE id = … AND claimed_by_id IS NULL RETURNING id`. Postgres locks the row, so two simultaneous claims run one after the other and the second updates nothing. No "check, then write" gap for a race to slip through. Tested with two clients released at the same instant, five rounds: exactly one winner every time.
- **Live updates with server-sent events.** Each tab keeps one `GET /events` stream open; after any claim/release/add/change, the server pushes the updated lead to every tab in that team. SSE is one-way (server → browser), which is all we need, and works over plain HTTPS. The browser reads it with `fetch` (not `EventSource`) so the login token travels in a header, not the URL; it reconnects with back-off and reloads the list after a reconnect in case it missed something.
- **Login is per tab and checked with the server first.** The token lives in `sessionStorage`: refresh keeps you logged in, closing the tab logs you out, and a new tab starts at the login page. Before any app screen appears, the saved login is confirmed with `/auth/me`; while the free server wakes up, a "Waking up the server…" screen shows instead of an empty dashboard.
- **Real pages, real Back button.** Login, sign-up, forgot/reset password and email confirmation are separate URLs; dashboard filters live in the URL (`?view=open&priority=Hot`, updated with `replace` so typing doesn't flood the history); "Add lead" and "Delete" use `replace` so Back never lands on a submitted form or a deleted lead.
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
                                                            # (BREVO_API_KEY optional locally: emails print in this terminal)
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

- The login token is kept in the browser's sessionStorage. Simple and works across the two domains (Vercel and Render), but readable by scripts if the site ever had an XSS bug; with a shared domain, an httpOnly cookie would be safer.
- Live updates and the rate limit are kept in one server's memory. That's correct for our single Render instance; with several servers, events would need a shared channel (Postgres LISTEN/NOTIFY or Redis pub/sub).
- No manager role yet: anyone in a team can see all its leads, and a claim lasts until it's released (no automatic expiry or reassignment).
- Hiding a claimed lead's call/WhatsApp buttons from teammates is a screen rule; the backend still sends the contact details to everyone in the team.
- The demo team is shared by everyone who uses the demo buttons.
- Verification emails sent from a free mailbox address through Brevo may land in spam; a custom sending domain would fix that.
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
