from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./fpl.db"
    fpl_api_base: str = "https://fantasy.premierleague.com/api"


settings = Settings()
