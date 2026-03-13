"""
SQLAlchemy модель ГУ (групповая установка).
"""
from typing import Any

from sqlalchemy import Double, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Gu(Base):
    """
    ГУ — групповая установка.
    Сборный пункт нефти со скважин куста.
    На месторождении Қаламқас: 73 объекта.
    """
    __tablename__ = "gu"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Центроид полигона
    lat: Mapped[float | None] = mapped_column(Double, nullable=True)
    lon: Mapped[float | None] = mapped_column(Double, nullable=True)
    # Все поля из GeoJSON properties: OBJECTID, AREA, PERIMETER, GU_, GU_ID, etc.
    properties: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # GeoJSON Polygon geometry
    geometry: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    def __repr__(self) -> str:
        return f"<Gu id={self.id} name={self.name!r}>"
