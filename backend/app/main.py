from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.fixture_difficulty import compute_team_ratings, upcoming_fixture_difficulty
from app.ingest import refresh_all
from app.models import Fixture, Player, Team
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

    fixtures_by_team: dict[int, list[dict]] = {}

    out = []
    for p in players:
        if p.team_id not in fixtures_by_team:
            fixtures_by_team[p.team_id] = upcoming_fixture_difficulty(
                db, ratings, p.team_id, n=next_n
            )
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
