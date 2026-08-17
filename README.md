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
uvicorn app.main:app --reload --port 8000
```

Endpoints:
- `GET /health` — liveness check
- `GET /status` — row counts (teams/players/fixtures) currently in the DB
- `POST /refresh` — re-pull FPL data and upsert (idempotent — safe to call repeatedly)
- `GET /teams` — team list
- `GET /players?next_n=5` — player list with price/form/ownership and next N fixtures, each annotated with our own Elo-based difficulty (1-5) and clean-sheet probability

## Frontend setup

```bash
cd frontend
npm install
cp .env.local.example .env.local   # if present; otherwise NEXT_PUBLIC_API_URL defaults to http://localhost:8000
npm run dev
```

Dashboard at `http://localhost:3000`: player table with search, position filter, sort, and
next-5-fixture chips color-coded by difficulty.

## xP model v1

`backend/app/xp_model.py` implements MODEL_SPEC section 1. Notable v1 calls (documented in the
module docstring):
- No current-season gameweek history exists yet (preseason), so "last 5 GW minutes" and rolling
  xG/xA fall back to last season's aggregates until real in-season data accumulates.
- xG90/xA90 come from FPL's own `expected_goals_per_90` / `expected_assists_per_90` fields
  instead of scraping Understat — same underlying stat, official source, no scrape fragility.
- `defensive_contribution_per_90` (FPL's own CBIT/CBIRT stat) resolves the DefCon data-sourcing
  gap MODEL_SPEC flagged — no FBref scraping needed.
- FPL's per-90 fields have no minimum-minutes floor, so a player with e.g. 2 minutes and one
  shot could show `xg90=3.6`. Fixed by shrinking all per-90-derived inputs toward 0 in
  proportion to minutes sample size (`_sample_weight`, floor at ~270 minutes / 3 full matches).

`GET /players` now returns `xp_next_n` (summed expected points over the next N fixtures) and
per-fixture `xp`, and is sorted by `xp_next_n` by default. The dashboard has an "xP (5)" column
and defaults to sorting by it, surfacing the most attractive players per the brief.

## Fixture difficulty model

`backend/app/fixture_difficulty.py` implements MODEL_SPEC section 2 instead of FPL's static 1-5
FDR: rolling Elo-style attack/defense ratings per team (start 1500, K=20), expected goals via
rating ratios + home advantage, clean-sheet probability via Poisson. Ratings are recomputed from
all finished fixtures each request rather than persisted — cheap at this data volume and avoids
incremental-update bugs. Pre-season (no finished fixtures yet) ratings are flat at 1500 for every
team, so difficulty differs only by home/away until real results come in — expected behavior.

## Data pipeline notes

- Source: public FPL API (`bootstrap-static` for teams/players, `fixtures` for the season's 380 fixtures). No API key required.
- Ingestion is an upsert keyed on FPL's own ids (team id, element id, fixture id), so re-running `/refresh` or `python -m app.ingest` updates existing rows rather than duplicating them.
- Local dev environment note: this machine has Python 3.9 (not 3.11+ as the brief suggests) and no Docker/local Postgres, so local dev defaults to SQLite via `DATABASE_URL`. The schema avoids Postgres-only types so the same models/migrations work against SQLite locally and Postgres in production — just point `DATABASE_URL` at the Render Postgres instance for deploys.
- `Player.defensive_contribution` / `defensive_contribution_per_90` are pulled directly from the FPL API, which already exposes the CBIT/CBIRT defensive-contribution stat MODEL_SPEC flagged as needing an external source — no Understat/FBref scraping needed for that term.

## Status

- [x] Data pipeline (teams, players, fixtures from FPL API → Postgres/SQLite, verified idempotent)
- [x] Dashboard (player list + Elo-based fixture difficulty color-coding)
- [x] xP model v1 (form + fixture difficulty, ranks players by expected points)
- [ ] Optimizer v1
