"""Elo-style attack/defense ratings and fixture difficulty, per MODEL_SPEC.md section 2.

Ratings are recomputed on demand by replaying all finished fixtures in
chronological order — cheap at this data volume (max 380 fixtures/season)
and avoids incremental-update bugs from persisting mutable rating state.
"""
from __future__ import annotations

import math
from typing import NamedTuple

from sqlalchemy.orm import Session

from app.models import Fixture, Team

START_ELO = 1500.0
K_FACTOR = 20.0
HOME_ADV_GOALS = 0.2
LEAGUE_AVG_GOALS = 1.35  # rough long-run PL average goals scored per team per match


class TeamRating(NamedTuple):
    attack: float
    defense: float


def expected_goals(attack: float, defense: float, is_home: bool) -> float:
    """Expected goals for a team with the given attack rating against an opponent
    with the given defense rating."""
    xg = LEAGUE_AVG_GOALS * (attack / START_ELO) * (START_ELO / defense)
    if is_home:
        xg += HOME_ADV_GOALS
    return max(xg, 0.05)


def clean_sheet_probability(expected_goals_against: float) -> float:
    """P(0 goals conceded) via Poisson: P(0) = e^-λ."""
    return math.exp(-expected_goals_against)


def compute_team_ratings(db: Session) -> dict[int, TeamRating]:
    ratings = {t.id: {"attack": START_ELO, "defense": START_ELO} for t in db.query(Team).all()}

    finished = (
        db.query(Fixture)
        .filter(Fixture.finished.is_(True))
        .filter(Fixture.team_h_score.is_not(None))
        .filter(Fixture.team_a_score.is_not(None))
        .order_by(Fixture.kickoff_time)
        .all()
    )

    for f in finished:
        if f.team_h_id not in ratings or f.team_a_id not in ratings:
            continue
        home, away = ratings[f.team_h_id], ratings[f.team_a_id]

        xg_home = expected_goals(home["attack"], away["defense"], is_home=True)
        xg_away = expected_goals(away["attack"], home["defense"], is_home=False)

        err_home = f.team_h_score - xg_home
        err_away = f.team_a_score - xg_away

        home["attack"] += K_FACTOR * err_home / 2
        away["defense"] -= K_FACTOR * err_home / 2
        away["attack"] += K_FACTOR * err_away / 2
        home["defense"] -= K_FACTOR * err_away / 2

    return {tid: TeamRating(**r) for tid, r in ratings.items()}


def difficulty_bucket(expected_goals_against: float) -> int:
    """1 (very easy fixture defensively) .. 5 (very hard), fixed thresholds per
    MODEL_SPEC's worked example (λ=0.8 easy ~45% CS, λ=2.0 hard ~13% CS)."""
    if expected_goals_against < 0.9:
        return 1
    if expected_goals_against < 1.2:
        return 2
    if expected_goals_against < 1.6:
        return 3
    if expected_goals_against < 2.0:
        return 4
    return 5


def upcoming_fixture_difficulty(
    db: Session, ratings: dict[int, TeamRating], team_id: int, n: int = 5
) -> list[dict]:
    fixtures = (
        db.query(Fixture)
        .filter(Fixture.finished.is_(False))
        .filter((Fixture.team_h_id == team_id) | (Fixture.team_a_id == team_id))
        .order_by(Fixture.kickoff_time)
        .limit(n)
        .all()
    )

    out = []
    for f in fixtures:
        is_home = f.team_h_id == team_id
        opponent_id = f.team_a_id if is_home else f.team_h_id
        own = ratings.get(team_id, TeamRating(START_ELO, START_ELO))
        opp = ratings.get(opponent_id, TeamRating(START_ELO, START_ELO))

        xg_for = expected_goals(own.attack, opp.defense, is_home=is_home)
        xg_against = expected_goals(opp.attack, own.defense, is_home=not is_home)

        out.append(
            {
                "event": f.event,
                "opponent_id": opponent_id,
                "is_home": is_home,
                "kickoff_time": f.kickoff_time,
                "expected_goals_for": round(xg_for, 2),
                "expected_goals_against": round(xg_against, 2),
                "clean_sheet_probability": round(clean_sheet_probability(xg_against), 3),
                "difficulty": difficulty_bucket(xg_against),
            }
        )
    return out
