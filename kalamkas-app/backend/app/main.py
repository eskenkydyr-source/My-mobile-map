"""
FastAPI приложение — точка входа.
"""
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import graph, routing, wells
from app.config import settings

logger = structlog.get_logger(__name__)


def create_app() -> FastAPI:
    """Фабрика приложения — создаёт и конфигурирует FastAPI instance."""
    app = FastAPI(
        title="Қаламқас Field Map API",
        description="REST API для карты нефтяного месторождения Қаламқас",
        version="0.1.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    # CORS — разрешаем запросы от фронтенда
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Подключаем роуты
    api_prefix = settings.api_prefix
    app.include_router(wells.router, prefix=api_prefix)
    app.include_router(graph.router, prefix=api_prefix)
    app.include_router(routing.router, prefix=api_prefix)

    @app.get("/health")
    async def health_check() -> dict[str, str]:
        """Проверка работоспособности сервиса."""
        return {"status": "ok", "service": "kalamkas-api"}

    logger.info(
        "app_created",
        api_prefix=api_prefix,
        cors_origins=settings.cors_origins,
    )
    return app


app = create_app()
