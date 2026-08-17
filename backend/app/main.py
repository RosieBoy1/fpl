from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.accuracy import get_accuracy, snapshot_predictions
from app.config import settings
from app.db import get_db
from app.fixture_difficulty import compute_team_ratings, fixtures_by_team_map
from app.ingest import refresh_all
from app.models import Fixture, Player, SavedSquad, Team
from app.optimizer import HorizonPlayerInput, OptimizerInput, optimize_squad, optimize_squad_horizon
from app.xp_model import expected_points_for_fixture, expected_points_over_horizon

app = FastAPI(title="FPL Companion API")

app.add_middleware(
    CORSMiddleware,
    # Always allow local dev regardless of FRONTEND_URL, so a deployed
    # FRONTEND_URL doesn't accidentally lock out `npm run dev`.
    allow_origins=list({settings.frontend_url, "http://localhost:3000"}),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/refresh")
def refresh(db: Session = Depends(get_db)):
    return refresh_all(db)


@app.get("/status")
def status(db: Session = Depends(get_db)):
    return {
        "teams": db.scalar(func.count(Team.id)),
        "players": db.scalar(func.count(Player.id)),
        "fixtures": db.scalar(func.count(Fixture.id)),
    }


@app.get("/teams")
def list_teams(db: Session = Depends(get_db)):
    teams = db.query(Team).order_by(Team.name).all()
    return [{"id": t.id, "name": t.name, "short_name": t.short_name} for t in teams]


@app.get("/players")
def list_players(db: Session = Depends(get_db), next_n: int = 5):
    players = db.query(Player).all()
    teams = {t.id: t for t in db.query(Team).all()}
    ratings = compute_team_ratings(db)
    fixtures_by_team = fixtures_by_team_map(db, ratings, {p.team_id for p in players}, n=next_n)

    out = []
    for p in players:
        team = teams.get(p.team_id)
        next_fixtures = [
            {
                **f,
                "opponent_short_name": teams[f["opponent_id"]].short_name
                if f["opponent_id"] in teams
                else "?",
                "xp": expected_points_for_fixture(p, f),
            }
            for f in fixtures_by_team[p.team_id]
        ]

        out.append(
            {
                "id": p.id,
                "web_name": p.web_name,
                "first_name": p.first_name,
                "second_name": p.second_name,
                "team_id": p.team_id,
                "team_short_name": team.short_name if team else "?",
                "position": p.position,
                "now_cost_m": p.now_cost / 10,
                "form": p.form,
                "total_points": p.total_points,
                "points_per_game": p.points_per_game,
                "selected_by_percent": p.selected_by_percent,
                "status": p.status,
                "news": p.news,
                "xp_next_n": expected_points_over_horizon(p, fixtures_by_team[p.team_id]),
                "next_fixtures": next_fixtures,
            }
        )

    out.sort(key=lambda r: r["xp_next_n"], reverse=True)
    return out


def _build_optimizer_pool(db: Session) -> tuple[list[OptimizerInput], dict[int, Team]]:
    players = db.query(Player).all()
    teams = {t.id: t for t in db.query(Team).all()}
    ratings = compute_team_ratings(db)
    fixtures_by_team = fixtures_by_team_map(db, ratings, {p.team_id for p in players}, n=1)

    pool = []
    for p in players:
        next_fixture = fixtures_by_team[p.team_id][0] if fixtures_by_team[p.team_id] else None
        xp = expected_points_for_fixture(p, next_fixture) if next_fixture else 0.0
        pool.append(
            OptimizerInput(
                id=p.id,
                web_name=p.web_name,
                team_id=p.team_id,
                position=p.position,
                cost_m=p.now_cost / 10,
                xp=xp,
            )
        )
    return pool, teams


def _attach_team_names(result: dict, teams: dict[int, Team]) -> dict:
    groups = ["squad", "starting_xi", "bench"]
    for group in groups:
        for row in result.get(group, []):
            row["team_short_name"] = teams[row["team_id"]].short_name
    result["captain"]["team_short_name"] = teams[result["captain"]["team_id"]].short_name
    for pair in result.get("transfers", []):
        pair["out"]["team_short_name"] = teams[pair["out"]["team_id"]].short_name
        pair["in"]["team_short_name"] = teams[pair["in"]["team_id"]].short_name
    return result


@app.get("/optimize")
def optimize(
    db: Session = Depends(get_db),
    triple_captain: bool = False,
    bench_boost: bool = False,
):
    """Best possible 15-man squad + starting XI + captain for the upcoming
    gameweek from scratch (MODEL_SPEC v1 scope — single gameweek, no existing
    squad / transfer constraints). triple_captain/bench_boost model those
    chips for this gameweek — see optimizer.py module docstring. Wildcard and
    free hit aren't meaningful "from scratch" (they reshape an existing
    squad); use /optimize/transfers with chip=wildcard|free_hit instead."""
    if triple_captain and bench_boost:
        raise HTTPException(400, "Only one chip can be active in a gameweek")

    pool, teams = _build_optimizer_pool(db)
    result = optimize_squad(
        pool,
        captain_multiplier=3 if triple_captain else 2,
        bench_boost=bench_boost,
    )
    result["chip"] = "triple_captain" if triple_captain else ("bench_boost" if bench_boost else None)
    return _attach_team_names(result, teams)


class TransferRequest(BaseModel):
    squad_ids: list[int]
    free_transfers: int = 1
    max_transfers: int = 2
    chip: Optional[Literal["wildcard", "free_hit", "triple_captain", "bench_boost"]] = None


@app.post("/optimize/transfers")
def optimize_transfers(req: TransferRequest, db: Session = Depends(get_db)):
    """Given an existing 15-man squad, suggest the highest-value transfers
    (MODEL_SPEC v2 scope): budget is capped at the existing squad's own value,
    transfer count is capped at max_transfers, and each transfer beyond
    free_transfers costs a -4pt hit weighed against the xP gain.

    chip applies a v3 chip for this gameweek: wildcard/free_hit remove the
    transfer cap and hit entirely (mathematically identical to each other —
    they differ only in whether the resulting squad persists afterward,
    which is up to the caller to track, not this stateless computation);
    triple_captain triples the captain instead of doubling; bench_boost
    scores all 15 squad players instead of just the starting XI."""
    if len(req.squad_ids) != 15:
        raise HTTPException(400, f"squad_ids must have exactly 15 players, got {len(req.squad_ids)}")

    pool, teams = _build_optimizer_pool(db)
    known_ids = {p.id for p in pool}
    unknown = set(req.squad_ids) - known_ids
    if unknown:
        raise HTTPException(400, f"Unknown player id(s): {sorted(unknown)}")

    free_transfers, max_transfers = req.free_transfers, req.max_transfers
    captain_multiplier, bench_boost = 2, False
    if req.chip in ("wildcard", "free_hit"):
        free_transfers = max_transfers = 15  # a 15-man squad can't have more transfers — "unlimited"
    elif req.chip == "triple_captain":
        captain_multiplier = 3
    elif req.chip == "bench_boost":
        bench_boost = True

    result = optimize_squad(
        pool,
        existing_squad_ids=set(req.squad_ids),
        free_transfers=free_transfers,
        max_transfers=max_transfers,
        captain_multiplier=captain_multiplier,
        bench_boost=bench_boost,
    )
    result["chip"] = req.chip
    return _attach_team_names(result, teams)


@app.get("/optimize/horizon")
def optimize_horizon(db: Session = Depends(get_db), weeks: int = 5):
    """v3 (partial): one static squad/XI held across the next `weeks`
    gameweeks, captain re-optimized per gameweek. No chip logic — see
    optimizer.py module docstring."""
    if not 1 <= weeks <= 10:
        raise HTTPException(400, "weeks must be between 1 and 10")

    players = db.query(Player).all()
    teams = {t.id: t for t in db.query(Team).all()}
    ratings = compute_team_ratings(db)
    fixtures_by_team = fixtures_by_team_map(db, ratings, {p.team_id for p in players}, n=weeks)

    pool = []
    all_events: set[int] = set()
    for p in players:
        xp_by_event = {}
        for f in fixtures_by_team[p.team_id]:
            if f["event"] is None:
                continue
            xp_by_event[f["event"]] = expected_points_for_fixture(p, f)
            all_events.add(f["event"])
        pool.append(
            HorizonPlayerInput(
                id=p.id,
                web_name=p.web_name,
                team_id=p.team_id,
                position=p.position,
                cost_m=p.now_cost / 10,
                xp_by_event=xp_by_event,
            )
        )

    events = sorted(all_events)
    if not events:
        raise HTTPException(400, "No upcoming fixtures found for the requested horizon")

    result = optimize_squad_horizon(pool, events)
    for group in ("squad", "starting_xi", "bench"):
        for row in result[group]:
            row["team_short_name"] = teams[row["team_id"]].short_name
    for wc in result["weekly_captains"]:
        wc["team_short_name"] = teams[
            next(p.team_id for p in pool if p.id == wc["captain_id"])
        ].short_name
    return result


class SaveSquadRequest(BaseModel):
    name: str
    player_ids: list[int]


def _squad_summary(s: SavedSquad) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "player_ids": s.player_ids,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }


@app.post("/squads")
def save_squad(req: SaveSquadRequest, db: Session = Depends(get_db)):
    if len(req.player_ids) != 15:
        raise HTTPException(400, f"player_ids must have exactly 15 players, got {len(req.player_ids)}")
    known_ids = {pid for (pid,) in db.query(Player.id).all()}
    unknown = set(req.player_ids) - known_ids
    if unknown:
        raise HTTPException(400, f"Unknown player id(s): {sorted(unknown)}")

    squad = SavedSquad(name=req.name, player_ids=req.player_ids)
    db.add(squad)
    db.commit()
    db.refresh(squad)
    return _squad_summary(squad)


@app.get("/squads")
def list_squads(db: Session = Depends(get_db)):
    squads = db.query(SavedSquad).order_by(SavedSquad.updated_at.desc()).all()
    return [_squad_summary(s) for s in squads]


@app.get("/squads/{squad_id}")
def get_squad(squad_id: int, db: Session = Depends(get_db)):
    squad = db.get(SavedSquad, squad_id)
    if squad is None:
        raise HTTPException(404, "Squad not found")

    players = db.query(Player).filter(Player.id.in_(squad.player_ids)).all()
    teams = {t.id: t for t in db.query(Team).all()}
    players_out = [
        {
            "id": p.id,
            "web_name": p.web_name,
            "team_id": p.team_id,
            "team_short_name": teams[p.team_id].short_name,
            "position": p.position,
            "cost_m": p.now_cost / 10,
        }
        for p in players
    ]
    return {**_squad_summary(squad), "players": players_out}


@app.delete("/squads/{squad_id}")
def delete_squad(squad_id: int, db: Session = Depends(get_db)):
    squad = db.get(SavedSquad, squad_id)
    if squad is None:
        raise HTTPException(404, "Squad not found")
    db.delete(squad)
    db.commit()
    return {"deleted": squad_id}


@app.post("/predictions/snapshot")
def snapshot_predictions_endpoint(event: int, db: Session = Depends(get_db)):
    """Record each player's current predicted xP for `event`. Idempotent — call
    again before the gameweek locks to refresh with the latest data. Historical
    model accuracy tracking (brief step 6) only works for gameweeks snapshotted
    before they finished, so this needs to run pre-deadline, not after."""
    ratings = compute_team_ratings(db)
    n = snapshot_predictions(db, event, ratings)
    return {"event": event, "players_snapshotted": n}


@app.get("/predictions/accuracy")
def prediction_accuracy(event: int, db: Session = Depends(get_db)):
    """Compare snapshotted predictions for `event` against actual FPL points,
    once that gameweek has finished. Returns finished=False with an
    explanatory message if the gameweek hasn't finished or wasn't snapshotted."""
    return get_accuracy(db, event)
