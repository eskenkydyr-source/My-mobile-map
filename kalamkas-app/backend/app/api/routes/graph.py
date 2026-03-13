"""
API эндпоинты для графа дорог.
GET /api/graph/nodes — все узлы
GET /api/graph/edges — все рёбра
"""
from typing import Any

import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_session
from app.services.graph_service import load_edges, load_nodes, edges_to_list, nodes_to_geojson

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/graph", tags=["graph"])


# ─── Pydantic схемы ──────────────────────────────────────────────────────────

class NodeOut(BaseModel):
    node_idx: int
    lat: float
    lon: float
    node_type: str


class EdgeOut(BaseModel):
    from_node: int
    to_node: int
    distance_m: int


class NodesResponse(BaseModel):
    total: int
    items: list[NodeOut]


class EdgesResponse(BaseModel):
    total: int
    items: list[EdgeOut]


# ─── Эндпоинты ───────────────────────────────────────────────────────────────

@router.get("/nodes", response_model=NodesResponse)
async def list_nodes(
    session: AsyncSession = Depends(get_session),
) -> NodesResponse:
    """Все узлы графа дорог."""
    nodes = await load_nodes(session)
    items = [NodeOut(node_idx=n.idx, lat=n.lat, lon=n.lon, node_type=n.node_type) for n in nodes]
    logger.info("graph_nodes_served", count=len(items))
    return NodesResponse(total=len(items), items=items)


@router.get("/edges", response_model=EdgesResponse)
async def list_edges(
    session: AsyncSession = Depends(get_session),
) -> EdgesResponse:
    """Все рёбра графа дорог."""
    edges = await load_edges(session)
    items = [EdgeOut(from_node=e.from_idx, to_node=e.to_idx, distance_m=e.distance_m) for e in edges]
    logger.info("graph_edges_served", count=len(items))
    return EdgesResponse(total=len(items), items=items)


@router.get("/nodes/geojson", response_model=dict[str, Any])
async def nodes_geojson(
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Узлы графа в формате GeoJSON FeatureCollection."""
    nodes = await load_nodes(session)
    return nodes_to_geojson(nodes)
