"""
API эндпоинт для построения маршрута A*.
POST /api/route — запускает алгоритм A* между двумя точками
"""
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_session
from app.services.astar import RouteResult, build_route
from app.services.graph_service import load_graph

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/route", tags=["routing"])


# ─── Pydantic схемы ──────────────────────────────────────────────────────────

class RouteRequest(BaseModel):
    """Запрос на построение маршрута."""
    from_lat: float = Field(..., description="Широта начальной точки")
    from_lon: float = Field(..., description="Долгота начальной точки")
    to_lat: float = Field(..., description="Широта конечной точки")
    to_lon: float = Field(..., description="Долгота конечной точки")


class RouteResponse(BaseModel):
    """Результат маршрута."""
    found: bool
    path_coords: list[tuple[float, float]]  # [(lat, lon), ...]
    node_indices: list[int]
    distance_m: float
    duration_min: float


# ─── Эндпоинт ────────────────────────────────────────────────────────────────

@router.post("", response_model=RouteResponse)
async def build_route_endpoint(
    request: RouteRequest,
    session: AsyncSession = Depends(get_session),
) -> RouteResponse:
    """
    Строит маршрут от точки A до точки B через граф дорог месторождения.

    Алгоритм:
    1. Загружает граф из БД
    2. Находит ближайшие узлы к точкам A и B
    3. Запускает A* для поиска кратчайшего пути
    4. Возвращает координаты пути, расстояние и время в пути

    Если путь не найден — возвращает прямую линию между точками (found=False).
    """
    logger.info(
        "route_requested",
        from_lat=request.from_lat, from_lon=request.from_lon,
        to_lat=request.to_lat, to_lon=request.to_lon,
    )

    nodes, edges = await load_graph(session)

    if not nodes:
        raise HTTPException(
            status_code=503,
            detail="Граф дорог не загружен. Запустите seed_db.py для заполнения БД.",
        )

    result: RouteResult = build_route(
        from_lat=request.from_lat,
        from_lon=request.from_lon,
        to_lat=request.to_lat,
        to_lon=request.to_lon,
        nodes=nodes,
        edges=edges,
    )

    logger.info(
        "route_built",
        found=result.found,
        distance_m=result.distance_m,
        duration_min=result.duration_min,
        path_len=len(result.path_coords),
    )

    return RouteResponse(
        found=result.found,
        path_coords=result.path_coords,
        node_indices=result.node_indices,
        distance_m=result.distance_m,
        duration_min=result.duration_min,
    )
