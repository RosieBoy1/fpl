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
