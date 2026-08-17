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
