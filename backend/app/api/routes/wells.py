"""
API эндпоинты для скважин.
GET /api/wells      — список с фильтрацией по типу и bbox
GET /api/wells/{id} — данные одной скважины
"""
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_session
from app.models.well import Well

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/wells", tags=["wells"])


# ─── Pydantic схемы ──────────────────────────────────────────────────────────

class WellOut(BaseModel):
    """Схема ответа для скважины."""
    id: int
    well_id: str
    well_type: str | None
    lat: float
    lon: float
    properties: dict[str, Any] | None

    model_config = {"from_attributes": True}


class WellsResponse(BaseModel):
    total: int
    items: list[WellOut]


# ─── Эндпоинты ───────────────────────────────────────────────────────────────

@router.get("", response_model=WellsResponse)
async def list_wells(
    well_type: str | None = Query(default=None, description="Тип скважины: dob., nagn., likv., water, gaz, kontr., razv."),
    # bbox: minLat,minLon,maxLat,maxLon
    bbox: str | None = Query(default=None, description="Ограничивающий прямоугольник: minLat,minLon,maxLat,maxLon"),
    limit: int = Query(default=1000, ge=1, le=10000),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> WellsResponse:
    """Список скважин с опциональной фильтрацией."""
    stmt = select(Well)

    if well_type:
        stmt = stmt.where(Well.well_type == well_type)

    if bbox:
        try:
            parts = [float(x) for x in bbox.split(",")]
            if len(parts) != 4:
                raise ValueError("bbox должен содержать 4 значения")
            min_lat, min_lon, max_lat, max_lon = parts
            stmt = stmt.where(
                Well.lat >= min_lat,
                Well.lat <= max_lat,
                Well.lon >= min_lon,
                Well.lon <= max_lon,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Неверный bbox: {exc}") from exc

    # Подсчёт total
    count_result = await session.execute(stmt.with_only_columns(Well.id))
    total = len(count_result.scalars().all())

    # Данные с пагинацией
    stmt = stmt.offset(offset).limit(limit).order_by(Well.id)
    result = await session.execute(stmt)
    wells = result.scalars().all()

    logger.info("wells_listed", count=len(wells), well_type=well_type)
    return WellsResponse(total=total, items=[WellOut.model_validate(w) for w in wells])


@router.get("/{well_id}", response_model=WellOut)
async def get_well(
    well_id: str,
    session: AsyncSession = Depends(get_session),
) -> WellOut:
    """Данные одной скважины по её well_id (строковый идентификатор)."""
    result = await session.execute(
        select(Well).where(Well.well_id == well_id)
    )
    well = result.scalar_one_or_none()

    if not well:
        raise HTTPException(status_code=404, detail=f"Скважина '{well_id}' не найдена")

    return WellOut.model_validate(well)
