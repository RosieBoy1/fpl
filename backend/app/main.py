from fastapi import Depends, FastAPI
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.ingest import refresh_all
from app.models import Fixture, Player, Team

app = FastAPI(title="FPL Companion API")


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
