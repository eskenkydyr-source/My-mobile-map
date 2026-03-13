"""
Тесты для A* алгоритма маршрутизации.
Запуск: pytest tests/test_astar.py -v
"""
import pytest
from app.services.astar import (
    Node, Edge, haversine, build_adj, nearest_node, astar, build_route
)


# ─── Тестовый граф: маленькая сетка 3x3 ────────────────────────────────────
#
#  0──1──2
#  |  |  |
#  3──4──5
#  |  |  |
#  6──7──8
#
# Координаты: lat увеличивается вниз, lon вправо (упрощённо)

@pytest.fixture
def grid_nodes():
    return [
        Node(0, 45.370, 51.920), Node(1, 45.370, 51.925), Node(2, 45.370, 51.930),
        Node(3, 45.375, 51.920), Node(4, 45.375, 51.925), Node(5, 45.375, 51.930),
        Node(6, 45.380, 51.920), Node(7, 45.380, 51.925), Node(8, 45.380, 51.930),
    ]

@pytest.fixture
def grid_edges():
    pairs = [
        (0,1),(1,2),(3,4),(4,5),(6,7),(7,8),   # горизонтальные
        (0,3),(3,6),(1,4),(4,7),(2,5),(5,8),   # вертикальные
    ]
    edges = []
    dist = 400  # ~400м
    for a, b in pairs:
        edges.append(Edge(a, b, dist))
        edges.append(Edge(b, a, dist))
    return edges


class TestHaversine:
    def test_same_point_is_zero(self):
        assert haversine(45.374, 51.926, 45.374, 51.926) == 0.0

    def test_known_distance(self):
        # ~111км на 1 градус широты
        d = haversine(45.0, 51.0, 46.0, 51.0)
        assert 110_000 < d < 112_000

    def test_symmetrical(self):
        d1 = haversine(45.374, 51.926, 45.400, 51.950)
        d2 = haversine(45.400, 51.950, 45.374, 51.926)
        assert abs(d1 - d2) < 0.001


class TestBuildAdj:
    def test_adj_has_all_nodes(self, grid_nodes, grid_edges):
        adj = build_adj(grid_nodes, grid_edges)
        assert all(n.idx in adj for n in grid_nodes)

    def test_adj_counts_correct(self, grid_nodes, grid_edges):
        adj = build_adj(grid_nodes, grid_edges)
        # Угловые узлы (0,2,6,8) — 2 соседа; крайние (1,3,5,7) — 3; центр (4) — 4
        assert len(adj[0]) == 2
        assert len(adj[4]) == 4
        assert len(adj[2]) == 2

    def test_adj_empty_edges(self, grid_nodes):
        adj = build_adj(grid_nodes, [])
        assert all(len(v) == 0 for v in adj.values())


class TestNearestNode:
    def test_finds_exact_match(self, grid_nodes):
        idx = nearest_node(45.375, 51.925, grid_nodes)
        assert idx == 4  # центральный узел

    def test_finds_closest(self, grid_nodes):
        # Точка ближе к узлу 0 чем к остальным
        idx = nearest_node(45.3701, 51.9201, grid_nodes)
        assert idx == 0

    def test_returns_none_if_too_far(self, grid_nodes):
        idx = nearest_node(0.0, 0.0, grid_nodes, max_dist_m=100)
        assert idx is None

    def test_respects_max_dist(self, grid_nodes):
        # Узел 0 находится на ~400м от узла 1
        idx = nearest_node(45.370, 51.925, grid_nodes, max_dist_m=100)
        assert idx is None  # слишком далеко от любого узла


class TestAstar:
    def test_finds_direct_path(self, grid_nodes, grid_edges):
        adj = build_adj(grid_nodes, grid_edges)
        path = astar(0, 2, grid_nodes, adj)
        assert path is not None
        assert path[0] == 0
        assert path[-1] == 2

    def test_path_length_optimal(self, grid_nodes, grid_edges):
        adj = build_adj(grid_nodes, grid_edges)
        path = astar(0, 8, grid_nodes, adj)
        # Оптимальный путь 0→1→2→5→8 или 0→3→6→7→8 — 4 ребра
        assert path is not None
        assert len(path) == 5  # 5 узлов = 4 ребра

    def test_same_start_goal(self, grid_nodes, grid_edges):
        adj = build_adj(grid_nodes, grid_edges)
        path = astar(4, 4, grid_nodes, adj)
        assert path == [4]

    def test_returns_none_if_disconnected(self, grid_nodes):
        # Пустой граф — нет рёбер
        adj = build_adj(grid_nodes, [])
        path = astar(0, 8, grid_nodes, adj)
        assert path is None

    def test_path_is_connected(self, grid_nodes, grid_edges):
        """Каждый шаг пути должен быть смежным узлом."""
        adj = build_adj(grid_nodes, grid_edges)
        path = astar(0, 8, grid_nodes, adj)
        assert path is not None
        adj_set = {(a, b) for a, b, *_ in [(e, n) for e, neighbors in adj.items() for n, _ in neighbors]}
        for i in range(len(path) - 1):
            assert (path[i], path[i+1]) in adj_set


class TestBuildRoute:
    def test_route_found(self, grid_nodes, grid_edges):
        result = build_route(45.370, 51.920, 45.380, 51.930, grid_nodes, grid_edges)
        assert result.found is True
        assert result.distance_m > 0
        assert len(result.path_coords) >= 2

    def test_route_distance_reasonable(self, grid_nodes, grid_edges):
        result = build_route(45.370, 51.920, 45.380, 51.930, grid_nodes, grid_edges)
        # Прямое расстояние ~1.5км, маршрут не длиннее 3км
        assert result.distance_m < 3000

    def test_route_not_found_returns_fallback(self, grid_nodes):
        result = build_route(45.370, 51.920, 45.380, 51.930, grid_nodes, [])
        assert result.found is False
        assert len(result.path_coords) == 2  # прямая линия как фоллбэк

    def test_duration_calculated(self, grid_nodes, grid_edges):
        result = build_route(45.370, 51.920, 45.380, 51.930, grid_nodes, grid_edges)
        assert result.found is True
        # duration = distance_km / 30 * 60 минут
        expected = (result.distance_m / 1000) / 30 * 60
        assert abs(result.duration_min - round(expected, 1)) < 0.1
