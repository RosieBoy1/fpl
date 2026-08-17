from __future__ import annotations

import datetime
import logging

from sqlalchemy.orm import Session

from app.fpl_client import fetch_bootstrap_static, fetch_fixtures
from app.models import Fixture, Player, Team

logger = logging.getLogger(__name__)


def _to_float(value, default=0.0) -> float:
    if value is None or value == "":
        return default
    return float(value)


def _parse_kickoff(value: str | None) -> datetime.datetime | None:
    if not value:
        return None
    return datetime.datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")


def upsert_teams(db: Session, teams_json: list[dict]) -> int:
    count = 0
    for t in teams_json:
        team = db.get(Team, t["id"])
        if team is None:
            team = Team(id=t["id"])
            db.add(team)
        team.name = t["name"]
        team.short_name = t["short_name"]
        team.strength_overall_home = t.get("strength_overall_home") or 0
        team.strength_overall_away = t.get("strength_overall_away") or 0
        team.strength_attack_home = t.get("strength_attack_home") or 0
        team.strength_attack_away = t.get("strength_attack_away") or 0
        team.strength_defence_home = t.get("strength_defence_home") or 0
        team.strength_defence_away = t.get("strength_defence_away") or 0
        team.updated_at = datetime.datetime.utcnow()
        count += 1
    return count


def upsert_players(db: Session, elements_json: list[dict]) -> int:
    count = 0
    for e in elements_json:
        player = db.get(Player, e["id"])
        if player is None:
            player = Player(id=e["id"])
            db.add(player)
        player.team_id = e["team"]
        player.element_type = e["element_type"]
        player.first_name = e["first_name"]
        player.second_name = e["second_name"]
        player.web_name = e["web_name"]
        player.now_cost = e["now_cost"]
        player.status = e.get("status", "a")
        player.news = e.get("news", "") or ""
        player.chance_of_playing_next_round = e.get("chance_of_playing_next_round")

        player.total_points = e.get("total_points") or 0
        player.form = _to_float(e.get("form"))
        player.points_per_game = _to_float(e.get("points_per_game"))
        player.selected_by_percent = _to_float(e.get("selected_by_percent"))

        player.minutes = e.get("minutes") or 0
        player.starts = e.get("starts") or 0
        player.goals_scored = e.get("goals_scored") or 0
        player.assists = e.get("assists") or 0
        player.clean_sheets = e.get("clean_sheets") or 0
        player.goals_conceded = e.get("goals_conceded") or 0
        player.yellow_cards = e.get("yellow_cards") or 0
        player.red_cards = e.get("red_cards") or 0
        player.bonus = e.get("bonus") or 0
        player.bps = e.get("bps") or 0
        player.saves = e.get("saves") or 0

        player.ict_index = _to_float(e.get("ict_index"))
        player.expected_goals = _to_float(e.get("expected_goals"))
        player.expected_assists = _to_float(e.get("expected_assists"))
        player.expected_goal_involvements = _to_float(e.get("expected_goal_involvements"))
        player.expected_goals_conceded = _to_float(e.get("expected_goals_conceded"))
        player.expected_goals_per_90 = _to_float(e.get("expected_goals_per_90"))
        player.expected_assists_per_90 = _to_float(e.get("expected_assists_per_90"))
        player.expected_goals_conceded_per_90 = _to_float(e.get("expected_goals_conceded_per_90"))

        player.defensive_contribution = e.get("defensive_contribution") or 0
        player.defensive_contribution_per_90 = _to_float(e.get("defensive_contribution_per_90"))

        player.updated_at = datetime.datetime.utcnow()
        count += 1
    return count


def upsert_fixtures(db: Session, fixtures_json: list[dict]) -> int:
    count = 0
    for f in fixtures_json:
        fixture = db.get(Fixture, f["id"])
        if fixture is None:
            fixture = Fixture(id=f["id"])
            db.add(fixture)
        fixture.event = f.get("event")
        fixture.team_h_id = f["team_h"]
        fixture.team_a_id = f["team_a"]
        fixture.team_h_score = f.get("team_h_score")
        fixture.team_a_score = f.get("team_a_score")
        fixture.kickoff_time = _parse_kickoff(f.get("kickoff_time"))
        fixture.finished = bool(f.get("finished"))
        fixture.started = bool(f.get("started"))
        fixture.team_h_difficulty = f.get("team_h_difficulty")
        fixture.team_a_difficulty = f.get("team_a_difficulty")
        fixture.updated_at = datetime.datetime.utcnow()
        count += 1
    return count


def refresh_all(db: Session) -> dict:
    bootstrap = fetch_bootstrap_static()
    fixtures_json = fetch_fixtures()

    n_teams = upsert_teams(db, bootstrap["teams"])
    db.commit()

    n_players = upsert_players(db, bootstrap["elements"])
    db.commit()

    n_fixtures = upsert_fixtures(db, fixtures_json)
    db.commit()

    result = {"teams": n_teams, "players": n_players, "fixtures": n_fixtures}
    logger.info("FPL data refresh complete: %s", result)
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    from app.db import SessionLocal

    session = SessionLocal()
    try:
        print(refresh_all(session))
    finally:
        session.close()
