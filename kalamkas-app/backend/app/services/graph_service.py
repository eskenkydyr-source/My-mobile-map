"""
Сервис для работы с графом дорог.
Загружает данные из БД и строит структуры для A* алгоритма.
"""
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.graph_edge import GraphEdge
from app.models.graph_node import GraphNode
from app.services.astar import Edge, Node

logger = structlog.get_logger(__name__)


async def load_nodes(session: AsyncSession) -> list[Node]:
    """Загружает все узлы графа из БД и конвертирует в astar.Node."""
    result = await session.execute(select(GraphNode).order_by(GraphNode.node_idx))
    db_nodes = result.scalars().all()

    nodes = [
        Node(idx=n.node_idx, lat=n.lat, lon=n.lon, node_type=n.node_type)
        for n in db_nodes
    ]
    logger.info("graph_nodes_loaded", count=len(nodes))
    return nodes


async def load_edges(session: AsyncSession) -> list[Edge]:
    """Загружает все рёбра графа из БД и конвертирует в astar.Edge."""
    result = await session.execute(select(GraphEdge))
    db_edges = result.scalars().all()

    edges = [
        Edge(from_idx=e.from_node, to_idx=e.to_node, distance_m=e.distance_m)
        for e in db_edges
    ]
    logger.info("graph_edges_loaded", count=len(edges))
    return edges


async def load_graph(session: AsyncSession) -> tuple[list[Node], list[Edge]]:
    """Загружает граф целиком — узлы и рёбра."""
    nodes = await load_nodes(session)
    edges = await load_edges(session)
    return nodes, edges


def nodes_to_geojson(nodes: list[Node]) -> dict[str, Any]:
    """Конвертирует список узлов в GeoJSON FeatureCollection."""
    features = [
        {
            "type": "Feature",
            "properties": {"node_idx": n.idx, "node_type": n.node_type},
            "geometry": {"type": "Point", "coordinates": [n.lon, n.lat]},
        }
        for n in nodes
    ]
    return {"type": "FeatureCollection", "features": features}


def edges_to_list(edges: list[Edge]) -> list[dict[str, Any]]:
    """Конвертирует список рёбер в JSON-сериализуемый формат."""
    return [
        {"from": e.from_idx, "to": e.to_idx, "distance_m": e.distance_m}
        for e in edges
    ]
