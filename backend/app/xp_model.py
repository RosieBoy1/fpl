"""xP model v1, per MODEL_SPEC.md section 1.

Data-reality notes (2026/27 preseason, 0 gameweeks played yet):
- "last 5 gameweeks" minutes and "rolling 6-GW xG90/xA90" don't exist yet for the
  current season. v1 falls back to last season's aggregates (still populated in
  bootstrap-static pre-season) for the minutes-reliability and xG/xA signals.
  Once gameweeks accumulate, ingest.py should start pulling per-GW history via
  the FPL element-summary endpoint and this module should switch to true
  rolling windows — p_plays_60_plus and the xG90/xA90 inputs are the two spots
  to update; the rest of the formula is unaffected.
- xG90/xA90 come straight from the FPL API's own expected_goals_per_90 /
  expected_assists_per_90 fields rather than scraping Understat — FPL already
  publishes the same underlying stat officially, so v1 skips the unofficial
  scrape. Understat's rolling-6-GW recency weighting is a fair v1.1 upgrade
  once there's an in-season rolling window to weight against.
- defensive_contribution_per_90 is FPL's own CBIT/CBIRT stat (added 2025/26),
  which resolves MODEL_SPEC's "flag as a data-sourcing task" note — no FBref
  scraping needed either.
- FPL's per-90 fields carry no minimum-minutes floor, so tiny-sample players
  (a few minutes, one deflected shot) can show absurd per-90 rates. v1 shrinks
  all per-90-derived inputs toward 0 by minutes sample size (see
  _sample_weight) to stop that from dominating the ranking.
"""
from __future__ import annotations

import math

from app.models import Player

GOAL_PTS = {"GKP": 6, "DEF": 6, "MID": 5, "FWD": 4}
CS_PTS = {"GKP": 4, "DEF": 4, "MID": 1, "FWD": 0}
DEFCON_THRESHOLD = {"GKP": None, "DEF": 10, "MID": 12, "FWD": 12}

APPEARANCE_PTS_60_PLUS = 2
APPEARANCE_PTS_UNDER_60 = 1
ASSIST_PTS = 3
DEFCON_PTS = 2

UNAVAILABLE_STATUSES = {"i", "s", "u", "n"}  # injured / suspended / unavailable / not in squad

LAST_SEASON_GAMEWEEKS = 38

# FPL's per-90 fields (expected_goals_per_90, defensive_contribution_per_90, ...) apply no
# minimum-minutes floor, so a player with e.g. 2 minutes and one deflected shot can show
# xg90=3.6 — nonsense extrapolated from a tiny sample. Shrink per-90 rates toward 0 in
# proportion to how far below a "reliable" sample (~3 full matches) the player's minutes are.
RELIABLE_MINUTES = 270


def _sample_weight(minutes: int) -> float:
    return min(minutes / RELIABLE_MINUTES, 1.0)


def p_plays_60_plus(player: Player) -> float:
    """Heuristic probability of playing 60+ minutes. v1 proxy: last season's
    starts rate, scaled down by current injury-doubt status. See module
    docstring — swap for true last-5-GW minutes once in-season data exists."""
    if player.status in UNAVAILABLE_STATUSES:
        return 0.0

    if player.minutes <= 0:
        base = 0.25  # no minutes on record (e.g. new signing) — conservative default
    else:
        starts_rate = min(player.starts / LAST_SEASON_GAMEWEEKS, 1.0)
        if starts_rate >= 0.8:
            base = 0.85
        elif starts_rate >= 0.5:
            base = 0.65
        elif starts_rate >= 0.2:
            base = 0.40
        else:
            base = 0.20

    if player.status == "d" and player.chance_of_playing_next_round is not None:
        base *= player.chance_of_playing_next_round / 100.0

    return base


def p_plays_1_to_59(p60: float, player: Player) -> float:
    """Small flat chance of a substitute cameo, capped by remaining probability mass."""
    if player.status in UNAVAILABLE_STATUSES:
        return 0.0
    return min(0.15, 1 - p60)


def _poisson_pmf(k: int, lam: float) -> float:
    return math.exp(-lam) * lam**k / math.factorial(k)


def p_defcon_met(per_90_rate: float, threshold: int | None) -> float:
    """P(defensive actions in a match >= threshold), approximated via Poisson
    with λ = the player's per-90 defensive-contribution rate."""
    if threshold is None or per_90_rate <= 0:
        return 0.0
    cdf_below_threshold = sum(_poisson_pmf(k, per_90_rate) for k in range(threshold))
    return max(0.0, 1 - cdf_below_threshold)


def _per_90(total: float, minutes: int) -> float:
    if minutes <= 0:
        return 0.0
    return total / (minutes / 90.0)


def expected_points_for_fixture(player: Player, fixture_difficulty: dict) -> float:
    pos = player.position
    p60 = p_plays_60_plus(player)
    p_sub = p_plays_1_to_59(p60, player)
    weight = _sample_weight(player.minutes)

    cs_prob = fixture_difficulty["clean_sheet_probability"]
    defcon_threshold = DEFCON_THRESHOLD.get(pos)
    defcon_rate = player.defensive_contribution_per_90 * weight
    p_defcon = p_defcon_met(defcon_rate, defcon_threshold)
    expected_bonus = _per_90(player.bonus, player.minutes) * weight

    bracket = (
        APPEARANCE_PTS_60_PLUS
        + player.expected_goals_per_90 * weight * GOAL_PTS[pos]
        + player.expected_assists_per_90 * weight * ASSIST_PTS
        + cs_prob * CS_PTS[pos]
        + p_defcon * DEFCON_PTS
        + expected_bonus
    )

    xp = p60 * bracket + p_sub * APPEARANCE_PTS_UNDER_60

    yellow_per_90 = _per_90(player.yellow_cards, player.minutes) * weight
    red_per_90 = _per_90(player.red_cards, player.minutes) * weight
    expected_card_penalty = yellow_per_90 * -1 + red_per_90 * -3
    xp += (p60 + p_sub) * expected_card_penalty

    if pos in ("GKP", "DEF"):
        xg_against = fixture_difficulty["expected_goals_against"]
        expected_goals_conceded_penalty = -(xg_against / 2.0)  # "-1 pt per 2 conceded", continuous approx
        xp += p60 * expected_goals_conceded_penalty

    return round(xp, 2)


def expected_points_over_horizon(player: Player, next_fixtures: list[dict]) -> float:
    return round(sum(expected_points_for_fixture(player, f) for f in next_fixtures), 2)
