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
- `GET /optimize` — best possible 15-man squad, starting XI, and captain for the upcoming gameweek (PuLP linear program, from scratch, v1 scope)
- `POST /optimize/transfers` — given an existing squad (`{squad_ids: [...], free_transfers, max_transfers}`), suggest the highest-value transfers (v2 scope)
- `POST /squads`, `GET /squads`, `GET /squads/{id}`, `DELETE /squads/{id}` — save/list/load/delete a 15-man squad (single-user, no auth)
- `GET /optimize/horizon?weeks=5` — one static squad/XI held across the next `weeks` gameweeks, captain re-optimized per gameweek (v3, partial — see below)

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

## Optimizer v1

`backend/app/optimizer.py` builds the optimal 15-man squad from scratch via a PuLP linear
program: maximize starting-XI xP + captain's xP (doubled), subject to £100.0m budget, exactly
2 GKP/5 DEF/5 MID/3 FWD in the squad, max 3 players per real team, 11 starters in a valid
formation (1 GKP, 3-5 DEF, 2-5 MID, 1-3 FWD), and exactly 1 captain drawn from the starters.
v1 scope is single-gameweek (uses each player's next-fixture xP, not the 5-GW horizon) — squad
transfer suggestions and multi-gameweek horizon are v2/v3, per MODEL_SPEC.

**Solver note:** PuLP's bundled CBC binary is x86_64-only for macOS; this dev machine is Apple
Silicon with no Rosetta installed, so CBC failed with "Bad CPU type in executable". Fixed by
preferring HiGHS (via the `highspy` Python bindings — a native compiled extension, no external
subprocess) when available, falling back to CBC otherwise (e.g. on Render's Linux hosts, where
the bundled CBC binary works fine). See `_pick_solver()` in `optimizer.py`.

`GET /optimize` returns the squad/starting XI/bench/captain/total cost/total xP. The frontend's
`/optimize` page (linked from the dashboard) renders it as a pitch layout with a captain badge.

## Optimizer v2 (transfer suggestions)

`POST /optimize/transfers` (MODEL_SPEC v2 scope) takes an existing 15-man squad and finds the
highest-value 1-2 transfers: budget is capped at the existing squad's own value (not the full
£100m — no persisted "money in the bank" concept yet, a documented simplification), transfer
count is capped at `max_transfers`, and each transfer beyond `free_transfers` costs a -4pt hit
that the solver weighs against the xP gained (declines the transfer if the hit isn't worth it —
verified this directly: a ~3.9xP upgrade was accepted at 1 free transfer but correctly declined
at 0 free transfers, since -4 hit > 3.9 gain).

There's no saved-squad/auth system yet (that's brief section 3 step 6, "Polish"), so the
frontend's transfer UI treats whatever the "Build optimal squad" button just produced as the
"current squad" to suggest transfers from — a reasonable stand-in until squads are persisted.

**Bug caught and fixed during testing:** HiGHS returns binary variable values like
`0.9999999999999997` rather than exact `1.0`, so an exact `value() == 1` filter (used to read
out which players the solver selected) was silently dropping valid squad members — a squad
sometimes came back with 11 players instead of 15. Fixed with a `> 0.5` tolerance check
(`optimizer.py`). This affected both v1 and v2 silently; v1 happened not to trigger it in
earlier testing, but the same fix applies to both.

## Saved squads

Brief section 3 step 6 ("Polish") lists auth (optional) and saved squads. Auth is skipped for
now (single-user, matches "optional"), but saved squads are implemented since the transfer
suggester is only actually useful if you can reuse a squad across sessions instead of always
suggesting transfers for whatever you just built from scratch. `SavedSquad` (`models.py`) stores
a name + 15 FPL player ids; `/squads` CRUD endpoints validate the id count and that all ids
exist. The `/optimize` page's "Suggest transfers" section operates on an "active squad" that's
either the just-built optimal squad or a loaded saved squad — save one, then later load it back
and ask for transfer suggestions against it.

## Optimizer v3 (multi-gameweek horizon — partial)

MODEL_SPEC flags v3 as "meaningfully harder" than v1/v2 for two separate reasons: a
multi-gameweek horizon, and chip usage (wildcard, bench boost, triple captain, free hit).
`GET /optimize/horizon?weeks=N` implements the horizon half: one static squad/XI held across
the next N gameweeks (still £100.0m budget, from scratch — not combined with v2's existing-squad
transfer constraints), with the captain re-optimized independently *per gameweek* via a separate
binary variable per (player, gameweek) pair — matches how managers actually play: the squad
doesn't change week to week, but the armband does. This is how "fixture swings" get accounted
for: each player's real per-gameweek xP (already computed by the fixture-difficulty + xP model)
feeds the objective, so a team with a rough patch mid-horizon is naturally worth less over that
window. Verified the per-week captain re-optimization actually works (not just picking the same
player by luck) with a synthetic test: two equal-cost "star" players, one strong in week 1 and
weak in week 2, the other the reverse — the solver correctly captained each one in their strong
week.

**Chip usage is not implemented.** Each chip changes the scoring/squad rules for a single
gameweek in a materially different way (free hit temporarily swaps the whole squad then reverts;
wildcard removes the transfer-hit constraint for one week; bench boost counts the bench;
triple captain triples instead of doubles) — genuinely separate logic per chip, not a small
extension of the horizon optimizer above. Left for a future pass.

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
- [x] Optimizer v1 (PuLP: optimal 15-man squad + XI + captain, single gameweek)
- [x] Optimizer v2 (transfer suggestions from an existing squad, budget/hit-aware)
- [x] Saved squads (single-user persistence so transfer suggestions work across sessions)
- [x] Optimizer v3 — multi-gameweek horizon, per-week captain (chip usage not implemented)
