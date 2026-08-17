# FPL Companion — Project Brief & Setup Checklist

## 1. Manual setup (do this yourself, before Claude Code touches anything)

**GitHub**
- [ ] Create an empty repo (e.g. `fpl-companion`), public or private — either works with Render.
- [ ] Clone it locally, or let Claude Code init it (`git init`, add remote) on first run.
- [ ] Decide branch strategy: `main` = production, work directly or via PRs. Keep it simple solo — commits to `main` triggering auto-deploy is fine.

**Render**
- [ ] Create a Render account, connect your GitHub account (Render asks for repo access on first "New +" → "Web Service").
- [ ] Don't create services manually yet — once the repo has code and a `render.yaml` (Claude Code can generate this), use "New + → Blueprint" to spin up all services (web service, worker/cron, Postgres) from that one file.
- [ ] You'll need: 1 web service (backend API), 1 web service or static site (frontend, unless you go full-stack Next.js and merge these), 1 Postgres instance, optionally 1 cron job for gameweek data refresh.

**Data source accounts**
- [ ] None needed for the official FPL API — it's public, no key.
- [ ] Understat has no official API; scraping it (via the `understat` PyPI package or by parsing their embedded JSON) is the norm. No account needed, just be aware it's unofficial and can break.
- [ ] Optional: if you want an LLM-generated "why this player" narrative in the dashboard, you'd need an Anthropic or OpenAI API key. Skip for MVP.

**Local machine**
- [ ] Node.js (LTS) and Python 3.11+ installed.
- [ ] Docker Desktop (optional but recommended) for a local Postgres instance so Claude Code isn't developing against your production DB.

## 2. Decisions to lock in (so Claude Code isn't guessing)

| Area | Decision |
|---|---|
| Backend | Python + FastAPI (needed for PuLP solver; avoid mixing runtimes) |
| Frontend | Next.js (React) — pairs cleanly with Render, good for dashboard + charts |
| Database | Postgres (Render managed) |
| ORM | SQLAlchemy + Alembic for migrations |
| Data refresh | Scheduled job (Render cron) pulling FPL API + Understat after each gameweek |
| Optimizer | PuLP (linear programming), constraints: £100m budget, 2/5/5/3 squad, max 3 per real team, valid XI formation |
| xP model v1 | Simple weighted formula (form + fixture difficulty + xG/xA per 90), not ML — upgrade later if needed |
| Hosting | Render web services + managed Postgres, deploys on push to `main` |

## 3. MVP scope (build in this order)

1. **Data pipeline**: pull FPL bootstrap-static + fixtures, store players/teams/fixtures in Postgres. Verify it refreshes correctly.
2. **Dashboard**: player list with price, form, ownership, next 5 fixtures with difficulty color-coding.
3. **xP model v1**: rank players by expected points over next N gameweeks using form + fixture difficulty. Surface "most attractive" players.
4. **Optimizer v1**: given budget + current squad (or blank), output the optimal 15-man squad and best XI via PuLP.
5. **Optimizer v2**: transfer suggestions (given current squad, suggest 1-2 transfers that improve xP within budget/hit constraints).
6. **Polish**: auth (optional), saved squads, historical model accuracy tracking.

Ship 1-3 before touching the optimizer — you need trustworthy player data before optimizing against it.

## 4. Data sources reference

- FPL API (public, no key): `https://fantasy.premierleague.com/api/bootstrap-static/`, `/fixtures/`, `/entry/{id}/`, `/leagues-classic/{id}/standings/`
- Historical player data + Understat xG/xA merge: [vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League) — useful for seeding/backtesting the model
- Current-season enriched dataset (Elo ratings, merged stats): [olbauday/FPL-Core-Insights](https://github.com/olbauday/FPL-Core-Insights)
- Reference optimizer implementations: [dbozbay/FPL-Optimization](https://github.com/dbozbay/FPL-Optimization), [Torvaney/fpl-optimiser](https://github.com/Torvaney/fpl-optimiser)

## 5. Environment variables (fill in once Render services exist)

```
DATABASE_URL=            # from Render Postgres
FPL_API_BASE=https://fantasy.premierleague.com/api
FRONTEND_URL=            # for CORS config
NEXT_PUBLIC_API_URL=     # backend URL, for frontend to call
```

## 6. Suggested repo structure

```
fpl-companion/
├── backend/          # FastAPI app
│   ├── app/
│   ├── alembic/
│   └── requirements.txt
├── frontend/         # Next.js app
│   └── ...
├── render.yaml        # Render Blueprint (defines all services)
└── README.md
```

## 7. First prompt to give Claude Code

Once the above is decided, a good opening prompt is something like:

> Build an FPL (Fantasy Premier League) companion app. Backend: FastAPI + Postgres (SQLAlchemy/Alembic), pulling data from the public FPL API and Understat for xG/xA. Frontend: Next.js. Start with the data pipeline (fetch + store players, teams, fixtures) and a dashboard showing players ranked by expected points over their next 5 fixtures. Include a `render.yaml` for deployment. Reference: [paste this brief]. Build the MVP scope in the order listed under section 3 — data pipeline first, confirm it works, then move to the next step.

Point Claude Code at this file (or paste its contents) as the first message so it has full context instead of inferring scope from a one-line request.
