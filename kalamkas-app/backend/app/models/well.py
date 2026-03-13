"""
SQLAlchemy модель скважины.
Соответствует таблице wells в PostgreSQL.
"""
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Double, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Well(Base):
    """
    Скважина месторождения Қаламқас.
    Типы: dob, nagn, likv, water, gaz, kontr, razv
    """
    __tablename__ = "wells"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    well_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    well_type: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    lat: Mapped[float] = mapped_column(Double, nullable=False)
    lon: Mapped[float] = mapped_column(Double, nullable=False)
    # Все остальные поля из GeoJSON properties: name, horizon, bkns, comment, well_num, etc.
    properties: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<Well id={self.id} well_id={self.well_id!r} type={self.well_type!r}>"
