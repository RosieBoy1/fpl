from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.fixture_difficulty import compute_team_ratings, fixtures_by_team_map
from app.ingest import refresh_all
from app.models import Fixture, Player, Team
from app.optimizer import OptimizerInput, optimize_squad
from app.xp_model import expected_points_for_fixture, expected_points_over_horizon

app = FastAPI(title="FPL Companion API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
def optimize(db: Session = Depends(get_db)):
    """Best possible 15-man squad + starting XI + captain for the upcoming
    gameweek from scratch (MODEL_SPEC v1 scope — single gameweek, no existing
    squad / transfer constraints)."""
    pool, teams = _build_optimizer_pool(db)
    result = optimize_squad(pool)
    return _attach_team_names(result, teams)


class TransferRequest(BaseModel):
    squad_ids: list[int]
    free_transfers: int = 1
    max_transfers: int = 2


@app.post("/optimize/transfers")
def optimize_transfers(req: TransferRequest, db: Session = Depends(get_db)):
    """Given an existing 15-man squad, suggest the highest-value transfers
    (MODEL_SPEC v2 scope): budget is capped at the existing squad's own value,
    transfer count is capped at max_transfers, and each transfer beyond
    free_transfers costs a -4pt hit weighed against the xP gain."""
    if len(req.squad_ids) != 15:
        raise HTTPException(400, f"squad_ids must have exactly 15 players, got {len(req.squad_ids)}")

    pool, teams = _build_optimizer_pool(db)
    known_ids = {p.id for p in pool}
    unknown = set(req.squad_ids) - known_ids
    if unknown:
        raise HTTPException(400, f"Unknown player id(s): {sorted(unknown)}")

    result = optimize_squad(
        pool,
        existing_squad_ids=set(req.squad_ids),
        free_transfers=req.free_transfers,
        max_transfers=req.max_transfers,
    )
    return _attach_team_names(result, teams)
