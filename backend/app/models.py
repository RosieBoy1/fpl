from __future__ import annotations

import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

POSITIONS = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # FPL team id
    name: Mapped[str] = mapped_column(String, nullable=False)
    short_name: Mapped[str] = mapped_column(String, nullable=False)
    strength_overall_home: Mapped[int] = mapped_column(Integer, default=0)
    strength_overall_away: Mapped[int] = mapped_column(Integer, default=0)
    strength_attack_home: Mapped[int] = mapped_column(Integer, default=0)
    strength_attack_away: Mapped[int] = mapped_column(Integer, default=0)
    strength_defence_home: Mapped[int] = mapped_column(Integer, default=0)
    strength_defence_away: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )

    players: Mapped[list["Player"]] = relationship(back_populates="team")


class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # FPL element id
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False)
    element_type: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-4, see POSITIONS
    first_name: Mapped[str] = mapped_column(String, nullable=False)
    second_name: Mapped[str] = mapped_column(String, nullable=False)
    web_name: Mapped[str] = mapped_column(String, nullable=False)
    now_cost: Mapped[int] = mapped_column(Integer, nullable=False)  # tenths of £m
    status: Mapped[str] = mapped_column(String, default="a")  # a/d/i/s/u
    news: Mapped[str] = mapped_column(String, default="")
    chance_of_playing_next_round: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    total_points: Mapped[int] = mapped_column(Integer, default=0)
    form: Mapped[float] = mapped_column(Float, default=0.0)
    points_per_game: Mapped[float] = mapped_column(Float, default=0.0)
    selected_by_percent: Mapped[float] = mapped_column(Float, default=0.0)

    minutes: Mapped[int] = mapped_column(Integer, default=0)
    starts: Mapped[int] = mapped_column(Integer, default=0)
    goals_scored: Mapped[int] = mapped_column(Integer, default=0)
    assists: Mapped[int] = mapped_column(Integer, default=0)
    clean_sheets: Mapped[int] = mapped_column(Integer, default=0)
    goals_conceded: Mapped[int] = mapped_column(Integer, default=0)
    yellow_cards: Mapped[int] = mapped_column(Integer, default=0)
    red_cards: Mapped[int] = mapped_column(Integer, default=0)
    bonus: Mapped[int] = mapped_column(Integer, default=0)
    bps: Mapped[int] = mapped_column(Integer, default=0)
    saves: Mapped[int] = mapped_column(Integer, default=0)

    ict_index: Mapped[float] = mapped_column(Float, default=0.0)
    expected_goals: Mapped[float] = mapped_column(Float, default=0.0)
    expected_assists: Mapped[float] = mapped_column(Float, default=0.0)
    expected_goal_involvements: Mapped[float] = mapped_column(Float, default=0.0)
    expected_goals_conceded: Mapped[float] = mapped_column(Float, default=0.0)
    expected_goals_per_90: Mapped[float] = mapped_column(Float, default=0.0)
    expected_assists_per_90: Mapped[float] = mapped_column(Float, default=0.0)
    expected_goals_conceded_per_90: Mapped[float] = mapped_column(Float, default=0.0)

    # FPL's own defensive-contribution stat (CBIT/CBIRT actions) — MODEL_SPEC's DefCon term
    defensive_contribution: Mapped[int] = mapped_column(Integer, default=0)
    defensive_contribution_per_90: Mapped[float] = mapped_column(Float, default=0.0)

    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )

    team: Mapped["Team"] = relationship(back_populates="players")

    @property
    def position(self) -> str:
        return POSITIONS.get(self.element_type, "UNK")


class Fixture(Base):
    __tablename__ = "fixtures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # FPL fixture id
    event: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # gameweek number
    team_h_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False)
    team_a_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), nullable=False)
    team_h_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    team_a_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    kickoff_time: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)
    finished: Mapped[bool] = mapped_column(Boolean, default=False)
    started: Mapped[bool] = mapped_column(Boolean, default=False)
    # FPL's built-in 1-5 FDR, stored for reference only — the app's own fixture
    # difficulty model (MODEL_SPEC section 2) supersedes this for ranking.
    team_h_difficulty: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    team_a_difficulty: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )

    team_h: Mapped["Team"] = relationship(foreign_keys=[team_h_id])
    team_a: Mapped["Team"] = relationship(foreign_keys=[team_a_id])
