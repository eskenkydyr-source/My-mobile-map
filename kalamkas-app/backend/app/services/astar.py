"""
A* алгоритм поиска маршрута по графу дорог месторождения.
Портирован из оригинального index.html (JavaScript → Python).
"""
import heapq
import math
from typing import List, Tuple, Optional
from dataclasses import dataclass, field


@dataclass
class Node:
    idx: int
    lat: float
    lon: float
    node_type: str = "road"


@dataclass
class Edge:
    from_idx: int
    to_idx: int
    distance_m: int


@dataclass(order=True)
class PQItem:
    f_score: float
    idx: int = field(compare=False)


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Расстояние между двумя точками в метрах (формула Haversine)."""
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_adj(nodes: List[Node], edges: List[Edge]) -> dict:
    """Строит список смежности из рёбер графа."""
    adj: dict = {n.idx: [] for n in nodes}
    for e in edges:
        adj[e.from_idx].append((e.to_idx, e.distance_m))
    return adj


def nearest_node(lat: float, lon: float, nodes: List[Node], max_dist_m: float = 5000) -> Optional[int]:
    """Находит ближайший узел к заданным координатам."""
    best_idx = None
    best_dist = float("inf")
    for n in nodes:
        d = haversine(lat, lon, n.lat, n.lon)
        if d < best_dist and d <= max_dist_m:
            best_dist = d
            best_idx = n.idx
    return best_idx


def astar(
    start_idx: int,
    goal_idx: int,
    nodes: List[Node],
    adj: dict,
) -> Optional[List[int]]:
    """
    A* поиск кратчайшего пути между двумя узлами графа.

    Returns:
        Список индексов узлов от start до goal, или None если путь не найден.
    """
    node_map = {n.idx: n for n in nodes}
    goal = node_map[goal_idx]

    open_set: List[PQItem] = [PQItem(0.0, start_idx)]
    came_from: dict = {}
    g_score: dict = {start_idx: 0.0}
    f_score: dict = {start_idx: haversine(
        node_map[start_idx].lat, node_map[start_idx].lon,
        goal.lat, goal.lon
    )}

    while open_set:
        current_item = heapq.heappop(open_set)
        current = current_item.idx

        if current == goal_idx:
            # Восстанавливаем путь
            path = []
            while current in came_from:
                path.append(current)
                current = came_from[current]
            path.append(start_idx)
            return list(reversed(path))

        for neighbor, dist in adj.get(current, []):
            tentative_g = g_score.get(current, float("inf")) + dist
            if tentative_g < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                h = haversine(
                    node_map[neighbor].lat, node_map[neighbor].lon,
                    goal.lat, goal.lon
                )
                f = tentative_g + h
                f_score[neighbor] = f
                heapq.heappush(open_set, PQItem(f, neighbor))

    return None  # Путь не найден


@dataclass
class RouteResult:
    path_coords: List[Tuple[float, float]]  # [(lat, lon), ...]
    node_indices: List[int]
    distance_m: float
    duration_min: float  # при скорости 30 км/ч
    found: bool


def build_route(
    from_lat: float, from_lon: float,
    to_lat: float, to_lon: float,
    nodes: List[Node],
    edges: List[Edge],
) -> RouteResult:
    """
    Строит маршрут от точки A до точки B через граф дорог.
    Находит ближайшие узлы к обеим точкам и запускает A*.
    """
    adj = build_adj(nodes, edges)

    start_idx = nearest_node(from_lat, from_lon, nodes)
    goal_idx = nearest_node(to_lat, to_lon, nodes)

    if start_idx is None or goal_idx is None:
        return RouteResult(
            path_coords=[(from_lat, from_lon), (to_lat, to_lon)],
            node_indices=[],
            distance_m=haversine(from_lat, from_lon, to_lat, to_lon),
            duration_min=0,
            found=False,
        )

    path = astar(start_idx, goal_idx, nodes, adj)

    if not path:
        return RouteResult(
            path_coords=[(from_lat, from_lon), (to_lat, to_lon)],
            node_indices=[],
            distance_m=haversine(from_lat, from_lon, to_lat, to_lon),
            duration_min=0,
            found=False,
        )

    node_map = {n.idx: n for n in nodes}
    coords = [(node_map[i].lat, node_map[i].lon) for i in path]

    # Считаем реальное расстояние по путевым точкам
    dist_m = 0.0
    for i in range(len(coords) - 1):
        dist_m += haversine(coords[i][0], coords[i][1], coords[i+1][0], coords[i+1][1])

    # Добавляем расстояние от исходных точек до ближайших узлов
    dist_m += haversine(from_lat, from_lon, coords[0][0], coords[0][1])
    dist_m += haversine(to_lat, to_lon, coords[-1][0], coords[-1][1])

    duration_min = (dist_m / 1000) / 30 * 60  # 30 км/ч

    return RouteResult(
        path_coords=coords,
        node_indices=path,
        distance_m=round(dist_m),
        duration_min=round(duration_min, 1),
        found=True,
    )
