"""
SQLAlchemy модель БКНС (блочная кустовая насосная станция).
"""
from typing import Any

from sqlalchemy import Double, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Bkns(Base):
    """
    БКНС — блочная кустовая насосная станция.
    Перекачивает воду для поддержания пластового давления.
    На месторождении Қаламқас: 11 объектов.
    """
    __tablename__ = "bkns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Центроид полигона
    lat: Mapped[float | None] = mapped_column(Double, nullable=True)
    lon: Mapped[float | None] = mapped_column(Double, nullable=True)
    # Все поля из GeoJSON properties: OBJECTID, BKNS_UCHAS, Shape_Leng, Shape_Area, etc.
    properties: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # GeoJSON Polygon geometry
    geometry: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    def __repr__(self) -> str:
        return f"<Bkns id={self.id} name={self.name!r}>"
