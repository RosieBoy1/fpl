from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./fpl.db"
    fpl_api_base: str = "https://fantasy.premierleague.com/api"
    frontend_url: str = "http://localhost:3000"

    @field_validator("database_url")
    @classmethod
    def _normalize_postgres_scheme(cls, v: str) -> str:
        # Some Postgres providers (Heroku-style, and historically Render) hand
        # back "postgres://" URLs, which SQLAlchemy 1.4+ rejects — it wants
        # "postgresql://". No-op if already postgresql:// or sqlite://.
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql://", 1)
        return v


settings = Settings()
