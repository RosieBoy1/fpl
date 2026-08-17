# FPL Companion

Fantasy Premier League companion app: data pipeline + dashboard + xP model + squad optimizer.
See [PROJECT_BRIEF.md](./PROJECT_BRIEF.md) and [MODEL_SPEC.md](./MODEL_SPEC.md) for full scope.

## Stack

- Backend: FastAPI + SQLAlchemy + Alembic (Python)
- Frontend: Next.js (React) — not yet built
- Database: Postgres in production (Render), SQLite for local dev (no setup required)

## Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # defaults to local SQLite, edit DATABASE_URL for Postgres
alembic upgrade head
python -m app.ingest   # pulls FPL bootstrap-static + fixtures, upserts into DB
uvicorn app.main:app --reload
```

Endpoints:
- `GET /health` — liveness check
- `GET /status` — row counts (teams/players/fixtures) currently in the DB
- `POST /refresh` — re-pull FPL data and upsert (idempotent — safe to call repeatedly)

## Data pipeline notes

- Source: public FPL API (`bootstrap-static` for teams/players, `fixtures` for the season's 380 fixtures). No API key required.
- Ingestion is an upsert keyed on FPL's own ids (team id, element id, fixture id), so re-running `/refresh` or `python -m app.ingest` updates existing rows rather than duplicating them.
- Local dev environment note: this machine has Python 3.9 (not 3.11+ as the brief suggests) and no Docker/local Postgres, so local dev defaults to SQLite via `DATABASE_URL`. The schema avoids Postgres-only types so the same models/migrations work against SQLite locally and Postgres in production — just point `DATABASE_URL` at the Render Postgres instance for deploys.
- `Player.defensive_contribution` / `defensive_contribution_per_90` are pulled directly from the FPL API, which already exposes the CBIT/CBIRT defensive-contribution stat MODEL_SPEC flagged as needing an external source — no Understat/FBref scraping needed for that term.

## Status

- [x] Data pipeline (teams, players, fixtures from FPL API → Postgres/SQLite, verified idempotent)
- [ ] Dashboard (player list + fixture difficulty)
- [ ] xP model v1
- [ ] Optimizer v1
