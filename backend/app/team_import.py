"""Import a real FPL manager's squad by team (entry) ID, for feeding into the
transfer optimizer (/optimize/transfers).

Timing caveat, confirmed live against the actual API while building this:
FPL does not publish a gameweek's picks until its transfer deadline passes —
before the 2026/27 season's GW1 deadline, /entry/{id}/event/1/picks/ 404s for
every entry (current_event is null and entered_events is empty for everyone).
import_entry_squad() surfaces that as a clear ValueError rather than a
confusing generic error, since it's the expected state right now, not a bug.
"""
from __future__ import annotations

import httpx

from app.fpl_client import fetch_entry, fetch_entry_picks


def import_entry_squad(entry_id: int) -> dict:
    try:
        entry = fetch_entry(entry_id)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise ValueError(f"No FPL team found with ID {entry_id}.")
        raise

    # Prefer the manager's current_event; fall back to GW1 (their initial
    # squad) if that's not set yet, e.g. pre-season.
    candidate_events = []
    if entry.get("current_event"):
        candidate_events.append(entry["current_event"])
    if 1 not in candidate_events:
        candidate_events.append(1)

    picks_data = None
    used_event = None
    for event in candidate_events:
        try:
            picks_data = fetch_entry_picks(entry_id, event)
            used_event = event
            break
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                continue
            raise

    if picks_data is None:
        raise ValueError(
            f"No picks published yet for team {entry_id}. FPL only publishes a gameweek's "
            "picks after its transfer deadline passes — expected before the season starts "
            "or before GW1's deadline."
        )

    picks = picks_data["picks"]
    squad_ids = [p["element"] for p in picks]
    captain_id = next((p["element"] for p in picks if p.get("is_captain")), None)

    history = picks_data.get("entry_history") or {}
    bank_m = (history.get("bank") or 0) / 10
    squad_value_m = (history.get("value") or 0) / 10

    return {
        "entry_id": entry_id,
        "entry_name": entry.get("name"),
        "manager_name": f"{entry.get('player_first_name', '')} {entry.get('player_last_name', '')}".strip(),
        "event": used_event,
        "squad_ids": squad_ids,
        "captain_id": captain_id,
        "bank_m": round(bank_m, 1),
        "squad_value_m": round(squad_value_m, 1),
        "total_budget_m": round(bank_m + squad_value_m, 1),
    }
