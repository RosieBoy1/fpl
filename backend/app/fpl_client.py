import httpx

from app.config import settings


def fetch_bootstrap_static() -> dict:
    resp = httpx.get(f"{settings.fpl_api_base}/bootstrap-static/", timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_fixtures() -> list[dict]:
    resp = httpx.get(f"{settings.fpl_api_base}/fixtures/", timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_event_live(event: int) -> dict:
    """Actual per-player stats (including total_points scored) for one finished
    or in-progress gameweek. Used to compare our xP predictions against reality."""
    resp = httpx.get(f"{settings.fpl_api_base}/event/{event}/live/", timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_entry(entry_id: int) -> dict:
    """A manager's team summary (name, current_event, bank/value as of their
    last locked deadline). Raises httpx.HTTPStatusError (404) for an invalid
    entry_id."""
    resp = httpx.get(f"{settings.fpl_api_base}/entry/{entry_id}/", timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_entry_picks(entry_id: int, event: int) -> dict:
    """A manager's 15-player squad for a specific gameweek, plus bank/value at
    that point. FPL only publishes a gameweek's picks after its transfer
    deadline passes — raises httpx.HTTPStatusError (404) before that."""
    resp = httpx.get(f"{settings.fpl_api_base}/entry/{entry_id}/event/{event}/picks/", timeout=30)
    resp.raise_for_status()
    return resp.json()
