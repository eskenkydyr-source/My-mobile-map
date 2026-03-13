"""
Async SQLAlchemy engine и фабрика сессий.
"""
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


# Движок с пулом соединений
engine = create_async_engine(
    settings.database_url,
    echo=False,          # поставь True для отладки SQL
    pool_pre_ping=True,  # проверяет соединение перед использованием
    pool_size=10,
    max_overflow=20,
)

# Фабрика сессий
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


class Base(DeclarativeBase):
    """Базовый класс для всех SQLAlchemy моделей."""
    pass


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency для FastAPI — предоставляет async сессию БД.
    Использование:
        async def my_handler(session: AsyncSession = Depends(get_session)):
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def create_tables() -> None:
    """Создаёт все таблицы (для разработки; в продакшене — alembic)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
