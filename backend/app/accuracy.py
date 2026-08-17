"""Historical model accuracy tracking — brief step 6.

Snapshot xP predictions for a gameweek before it locks, then compare against
actual FPL points once that gameweek finishes. As of writing the 2026/27
season hasn't started yet (GW1 kicks off 2026-08-21), so there is no finished
gameweek to validate against in practice yet — get_accuracy() below detects
that and returns a "not finished" response rather than pretending there's
data. The math (MAE/RMSE/correlation) is covered by direct unit-style checks
against known values instead, since real end-to-end validation has to wait
for a gameweek to actually finish.
"""
from __future__ import annotations

import math

from sqlalchemy.orm import Session

from app.fixture_difficulty import TeamRating, clean_sheet_probability, expected_goals
from app.fpl_client import fetch_event_live
from app.models import Fixture, Player, PredictionSnapshot
from app.xp_model import expected_points_for_fixture


def _fixture_difficulty_for_event(
    db: Session, ratings: dict[int, TeamRating], team_id: int, event: int
) -> dict | None:
    """Same fixture-info shape as fixture_difficulty.upcoming_fixture_difficulty,
    but for one specific gameweek rather than 'the next N unplayed'."""
    fixture = (
        db.query(Fixture)
        .filter(Fixture.event == event)
        .filter((Fixture.team_h_id == team_id) | (Fixture.team_a_id == team_id))
        .first()
    )
    if fixture is None:
        return None

    is_home = fixture.team_h_id == team_id
    opponent_id = fixture.team_a_id if is_home else fixture.team_h_id
    own = ratings.get(team_id, TeamRating(1500.0, 1500.0))
    opp = ratings.get(opponent_id, TeamRating(1500.0, 1500.0))

    xg_for = expected_goals(own.attack, opp.defense, is_home=is_home)
    xg_against = expected_goals(opp.attack, own.defense, is_home=not is_home)

    return {
        "event": fixture.event,
        "opponent_id": opponent_id,
        "is_home": is_home,
        "kickoff_time": fixture.kickoff_time,
        "expected_goals_for": round(xg_for, 2),
        "expected_goals_against": round(xg_against, 2),
        "clean_sheet_probability": round(clean_sheet_probability(xg_against), 3),
    }


def snapshot_predictions(db: Session, event: int, ratings: dict[int, TeamRating]) -> int:
    """Record (or update) each player's predicted xP for `event`. Idempotent —
    safe to re-run before the gameweek locks to refresh predictions with the
    latest form/fixture data."""
    players = db.query(Player).all()
    existing = {
        (s.player_id, s.event): s
        for s in db.query(PredictionSnapshot).filter(PredictionSnapshot.event == event).all()
    }

    count = 0
    for p in players:
        fixture_info = _fixture_difficulty_for_event(db, ratings, p.team_id, event)
        if fixture_info is None:
            continue  # no fixture that gameweek (blank gameweek) — nothing to predict
        xp = expected_points_for_fixture(p, fixture_info)

        snap = existing.get((p.id, event))
        if snap is None:
            snap = PredictionSnapshot(player_id=p.id, event=event, predicted_xp=xp)
            db.add(snap)
        else:
            snap.predicted_xp = xp
        count += 1

    db.commit()
    return count


def _mean(values: list[float]) -> float:
    return sum(values) / len(values)


def _pearson_correlation(xs: list[float], ys: list[float]) -> float | None:
    """Manual Pearson correlation — statistics.correlation() needs Python 3.10+
    and this runs on 3.9."""
    n = len(xs)
    if n < 2:
        return None
    mean_x, mean_y = _mean(xs), _mean(ys)
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    var_x = sum((x - mean_x) ** 2 for x in xs)
    var_y = sum((y - mean_y) ** 2 for y in ys)
    denom = math.sqrt(var_x * var_y)
    if denom == 0:
        return None
    return cov / denom


def compute_accuracy(predicted: list[float], actual: list[float]) -> dict:
    """Pure function so the math can be verified directly against known values,
    independent of the DB/API plumbing around it."""
    n = len(predicted)
    errors = [p - a for p, a in zip(predicted, actual)]
    return {
        "n_players": n,
        "mae": round(_mean([abs(e) for e in errors]), 3),
        "rmse": round(math.sqrt(_mean([e * e for e in errors])), 3),
        "bias": round(_mean(errors), 3),  # positive = model overpredicts on average
        "correlation": (
            round(r, 3) if (r := _pearson_correlation(predicted, actual)) is not None else None
        ),
    }


def get_accuracy(db: Session, event: int) -> dict:
    fixtures = db.query(Fixture).filter(Fixture.event == event).all()
    if not fixtures:
        return {"event": event, "finished": False, "message": f"No fixtures found for gameweek {event}."}
    if not all(f.finished for f in fixtures):
        return {
            "event": event,
            "finished": False,
            "message": f"Gameweek {event} hasn't finished yet ({sum(f.finished for f in fixtures)}/{len(fixtures)} fixtures finished).",
        }

    snapshots = db.query(PredictionSnapshot).filter(PredictionSnapshot.event == event).all()
    if not snapshots:
        return {
            "event": event,
            "finished": True,
            "message": f"Gameweek {event} is finished, but no predictions were snapshotted for it before it started.",
        }

    live = fetch_event_live(event)
    actual_by_player = {el["id"]: el["stats"]["total_points"] for el in live.get("elements", [])}

    players = {p.id: p for p in db.query(Player).filter(Player.id.in_([s.player_id for s in snapshots])).all()}

    rows = []
    predicted_vals, actual_vals = [], []
    for s in snapshots:
        if s.player_id not in actual_by_player:
            continue
        actual = actual_by_player[s.player_id]
        player = players.get(s.player_id)
        rows.append(
            {
                "player_id": s.player_id,
                "web_name": player.web_name if player else "?",
                "predicted_xp": round(s.predicted_xp, 2),
                "actual_points": actual,
                "error": round(s.predicted_xp - actual, 2),
            }
        )
        predicted_vals.append(s.predicted_xp)
        actual_vals.append(float(actual))

    if not rows:
        return {
            "event": event,
            "finished": True,
            "message": "Gameweek finished but no snapshotted players had matching live results.",
        }

    summary = compute_accuracy(predicted_vals, actual_vals)
    rows.sort(key=lambda r: abs(r["error"]), reverse=True)

    return {"event": event, "finished": True, **summary, "predictions": rows}
