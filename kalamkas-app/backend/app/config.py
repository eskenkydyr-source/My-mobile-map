"""
Настройки приложения через pydantic-settings.
Переменные читаются из окружения или .env файла.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    database_url: str = Field(
        default="postgresql+asyncpg://kalamkas:password@localhost:5432/kalamkas_db",
        description="Async PostgreSQL connection URL",
    )

    # Redis
    redis_url: str = Field(
        default="redis://localhost:6379",
        description="Redis connection URL",
    )

    # API
    secret_key: str = Field(default="change-me-in-production")
    api_prefix: str = Field(default="/api")
    cors_origins: list[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000"]
    )

    # Import limits
    max_import_file_size_mb: int = Field(default=50)
    allowed_import_extensions: list[str] = Field(default=[".xlsx", ".xls", ".csv"])

    # Map defaults (месторождение Қаламқас)
    default_map_center_lat: float = Field(default=45.374)
    default_map_center_lon: float = Field(default=51.926)
    default_map_zoom: int = Field(default=12)


# Синглтон настроек
settings = Settings()
