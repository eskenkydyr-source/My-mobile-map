"""
Тесты для парсера index.html — GeoJSON формат.
Запуск: pytest tests/test_html_parser.py -v
"""
import json
import pytest
from pathlib import Path
from app.services.html_parser import (
    parse_html_file, ParseResult, ParsedWell, ParsedObject, ParsedGraph,
    _extract_wells, _extract_bkns, _extract_gu, _extract_graph, summary,
)


# ─── Хелперы — генераторы тестовых данных ────────────────────────────────────

def make_wells_geojson(features: list[dict]) -> dict:
    return {"type": "FeatureCollection", "features": features}


def make_well_feature(
    lon: float, lat: float, well_id: str = "1001",
    well_type: str = "dob.", name: str = "Скважина",
    **extra_props,
) -> dict:
    props = {
        "id": well_id, "name": name, "type": well_type,
        "type_ru": "добывающая", "well_num": well_id,
        "horizon": "M", "bkns": "БКНС-1", "comment": "",
        **extra_props,
    }
    return {
        "type": "Feature",
        "properties": props,
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
    }


def make_bkns_geojson(features: list[dict]) -> dict:
    return {"type": "FeatureCollection", "features": features}


def make_bkns_feature(
    name: str = "БКНС-1", centroid_lon: float = 51.83, centroid_lat: float = 45.38,
    objectid: int = 1,
) -> dict:
    ring = [
        [centroid_lon - 0.01, centroid_lat - 0.01],
        [centroid_lon + 0.01, centroid_lat - 0.01],
        [centroid_lon + 0.01, centroid_lat + 0.01],
        [centroid_lon - 0.01, centroid_lat + 0.01],
        [centroid_lon - 0.01, centroid_lat - 0.01],
    ]
    return {
        "type": "Feature",
        "properties": {
            "OBJECTID": objectid, "NAME": name,
            "BKNS_UCHAS": "1", "Shape_Leng": 100.0, "Shape_Area": 500.0,
            "layer_type": "bkns", "centroid": [centroid_lon, centroid_lat],
        },
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }


def make_gu_feature(
    name: str = "ГУ-1", lon: float = 51.90, lat: float = 45.37, objectid: int = 1,
) -> dict:
    ring = [
        [lon - 0.005, lat - 0.005],
        [lon + 0.005, lat - 0.005],
        [lon + 0.005, lat + 0.005],
        [lon - 0.005, lat + 0.005],
        [lon - 0.005, lat - 0.005],
    ]
    return {
        "type": "Feature",
        "properties": {
            "OBJECTID_1": objectid, "OBJECTID": objectid, "AREA": 1000.0,
            "PERIMETER": 200.0, "GU_": objectid, "GU_ID": objectid,
            "NAME": name, "FIND": "", "Shape_Leng": 200.0,
        },
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }


def make_graph() -> dict:
    return {
        "nodes": [
            [45.370, 51.920, "road"],
            [45.375, 51.925, "bkns"],
        ],
        "edges": [[0, 1, 400], [1, 0, 400]],
    }


# ─── Фикстуры ────────────────────────────────────────────────────────────────

@pytest.fixture
def minimal_html(tmp_path) -> Path:
    """HTML файл с минимальным набором данных в реальном GeoJSON формате."""
    wells = make_wells_geojson([
        make_well_feature(51.926, 45.374, well_id="1001", well_type="dob."),
        make_well_feature(51.927, 45.375, well_id="1002", well_type="dob."),
        make_well_feature(51.928, 45.376, well_id="2001", well_type="nagn."),
    ])
    bkns = make_bkns_geojson([
        make_bkns_feature("БКНС-1", centroid_lon=51.83, centroid_lat=45.38),
    ])
    gu = make_bkns_geojson([
        make_gu_feature("ГУ-1", lon=51.90, lat=45.37),
    ])
    graph = make_graph()

    html = f"""<html><body><script>
const WELLS={json.dumps(wells)};
const BKNS={json.dumps(bkns)};
const GU={json.dumps(gu)};
const GRAPH={json.dumps(graph)};
</script></body></html>"""

    f = tmp_path / "index.html"
    f.write_text(html, encoding="utf-8")
    return f


@pytest.fixture
def empty_html(tmp_path) -> Path:
    f = tmp_path / "empty.html"
    f.write_text("<html><body></body></html>", encoding="utf-8")
    return f


# ─── Тесты полного парсинга ──────────────────────────────────────────────────

class TestParseHtmlFile:
    def test_returns_parse_result(self, minimal_html):
        result = parse_html_file(minimal_html)
        assert isinstance(result, ParseResult)

    def test_wells_count(self, minimal_html):
        result = parse_html_file(minimal_html)
        assert len(result.wells) == 3

    def test_objects_count(self, minimal_html):
        result = parse_html_file(minimal_html)
        # 1 БКНС + 1 ГУ = 2 объекта
        assert len(result.objects) == 2

    def test_graph_nodes_count(self, minimal_html):
        result = parse_html_file(minimal_html)
        assert len(result.graph.nodes) == 2

    def test_graph_edges_count(self, minimal_html):
        result = parse_html_file(minimal_html)
        assert len(result.graph.edges) == 2

    def test_empty_html_no_crash(self, empty_html):
        result = parse_html_file(empty_html)
        assert result.wells == []
        assert result.graph.nodes == []
        assert len(result.errors) > 0

    def test_file_not_found_raises(self):
        with pytest.raises(FileNotFoundError):
            parse_html_file("/nonexistent/path/index.html")

    def test_no_errors_on_valid_html(self, minimal_html):
        result = parse_html_file(minimal_html)
        assert result.errors == []


# ─── Тесты парсера скважин ───────────────────────────────────────────────────

class TestExtractWells:
    def test_well_coordinates_swapped_from_geojson(self, minimal_html):
        """GeoJSON coords=[lon, lat] → должны стать lat/lon."""
        result = parse_html_file(minimal_html)
        well = next(w for w in result.wells if w.well_id == "1001")
        # В фикстуре: make_well_feature(lon=51.926, lat=45.374)
        assert well.lat == pytest.approx(45.374)
        assert well.lon == pytest.approx(51.926)

    def test_well_type_parsed(self, minimal_html):
        result = parse_html_file(minimal_html)
        well = next(w for w in result.wells if w.well_id == "1001")
        assert well.well_type == "dob."

    def test_multiple_well_types(self, minimal_html):
        result = parse_html_file(minimal_html)
        types = {w.well_type for w in result.wells}
        assert "dob." in types
        assert "nagn." in types

    def test_well_ids_are_strings(self, minimal_html):
        result = parse_html_file(minimal_html)
        for w in result.wells:
            assert isinstance(w.well_id, str)

    def test_well_properties_preserved(self, minimal_html):
        result = parse_html_file(minimal_html)
        well = next(w for w in result.wells if w.well_id == "1001")
        assert isinstance(well.properties, dict)
        assert well.properties.get("horizon") == "M"
        assert well.properties.get("bkns") == "БКНС-1"

    def test_empty_geojson_returns_empty_list(self, tmp_path):
        empty_wells = make_wells_geojson([])
        html = f"<script>const WELLS={json.dumps(empty_wells)};</script>"
        errors: list[str] = []
        result = _extract_wells(html, errors)
        assert result == []
        assert errors == []

    def test_feature_without_geometry_skipped(self, tmp_path):
        feat = {"type": "Feature", "properties": {"id": "999"}, "geometry": {"type": "Point", "coordinates": []}}
        wells_fc = make_wells_geojson([feat])
        html = f"<script>const WELLS={json.dumps(wells_fc)};</script>"
        errors: list[str] = []
        result = _extract_wells(html, errors)
        assert result == []


# ─── Тесты парсера БКНС ──────────────────────────────────────────────────────

class TestExtractBkns:
    def test_bkns_name_parsed(self, minimal_html):
        result = parse_html_file(minimal_html)
        bkns_list = [o for o in result.objects if o.obj_type == "bkns"]
        assert len(bkns_list) == 1
        assert bkns_list[0].name == "БКНС-1"

    def test_bkns_coordinates_from_centroid(self, minimal_html):
        result = parse_html_file(minimal_html)
        bkns = next(o for o in result.objects if o.obj_type == "bkns")
        # centroid=[51.83, 45.38] → lat=45.38, lon=51.83
        assert bkns.lat == pytest.approx(45.38)
        assert bkns.lon == pytest.approx(51.83)

    def test_bkns_geometry_preserved(self, minimal_html):
        result = parse_html_file(minimal_html)
        bkns = next(o for o in result.objects if o.obj_type == "bkns")
        assert isinstance(bkns.geometry, dict)
        assert bkns.geometry.get("type") == "Polygon"

    def test_bkns_properties_preserved(self, minimal_html):
        result = parse_html_file(minimal_html)
        bkns = next(o for o in result.objects if o.obj_type == "bkns")
        assert bkns.properties.get("BKNS_UCHAS") == "1"

    def test_bkns_centroid_fallback_from_polygon(self, tmp_path):
        """Если centroid отсутствует — вычисляем из полигона."""
        feat = make_bkns_feature("БКНС-X", centroid_lon=51.90, centroid_lat=45.37)
        # Убираем centroid из properties
        del feat["properties"]["centroid"]
        bkns_fc = make_bkns_geojson([feat])
        html = f"<script>const BKNS={json.dumps(bkns_fc)};</script>"
        errors: list[str] = []
        result = _extract_bkns(html, errors)
        assert len(result) == 1
        # Должен вычислить приблизительный центроид из полигона
        assert abs(result[0].lat - 45.37) < 0.02
        assert abs(result[0].lon - 51.90) < 0.02


# ─── Тесты парсера ГУ ────────────────────────────────────────────────────────

class TestExtractGu:
    def test_gu_name_parsed(self, minimal_html):
        result = parse_html_file(minimal_html)
        gu_list = [o for o in result.objects if o.obj_type == "gu"]
        assert len(gu_list) == 1
        assert gu_list[0].name == "ГУ-1"

    def test_gu_centroid_from_polygon(self, minimal_html):
        result = parse_html_file(minimal_html)
        gu = next(o for o in result.objects if o.obj_type == "gu")
        # Полигон построен вокруг lon=51.90, lat=45.37
        assert abs(gu.lat - 45.37) < 0.01
        assert abs(gu.lon - 51.90) < 0.01

    def test_gu_geometry_preserved(self, minimal_html):
        result = parse_html_file(minimal_html)
        gu = next(o for o in result.objects if o.obj_type == "gu")
        assert isinstance(gu.geometry, dict)
        assert gu.geometry.get("type") == "Polygon"


# ─── Тесты парсера графа ─────────────────────────────────────────────────────

class TestExtractGraph:
    def test_nodes_are_tuples_of_three(self, minimal_html):
        result = parse_html_file(minimal_html)
        for n in result.graph.nodes:
            assert len(n) == 3  # (lat, lon, type)

    def test_edges_are_tuples_of_three(self, minimal_html):
        result = parse_html_file(minimal_html)
        for e in result.graph.edges:
            assert len(e) == 3  # (from, to, dist_m)

    def test_node_lat_lon_order(self, minimal_html):
        """nodes[0] = [lat=45.370, lon=51.920, type='road'] — порядок lat/lon."""
        result = parse_html_file(minimal_html)
        lat, lon, node_type = result.graph.nodes[0]
        assert lat == pytest.approx(45.370)
        assert lon == pytest.approx(51.920)
        assert node_type == "road"

    def test_node_types_valid(self, minimal_html):
        result = parse_html_file(minimal_html)
        valid = {"road", "bkns", "gu", "custom"}
        for n in result.graph.nodes:
            assert n[2] in valid

    def test_edge_distances_positive(self, minimal_html):
        result = parse_html_file(minimal_html)
        for e in result.graph.edges:
            assert e[2] > 0

    def test_missing_graph_adds_error(self, empty_html):
        result = parse_html_file(empty_html)
        assert any("GRAPH" in e for e in result.errors)

    def test_graph_without_node_type_defaults_to_road(self, tmp_path):
        """Если у узла нет типа (len<3), используем 'road'."""
        graph = {"nodes": [[45.370, 51.920], [45.375, 51.925, "bkns"]], "edges": []}
        html = f"<script>const GRAPH={json.dumps(graph)};</script>"
        errors: list[str] = []
        result = _extract_graph(html, errors)
        assert result.nodes[0][2] == "road"
        assert result.nodes[1][2] == "bkns"


# ─── Тест summary ────────────────────────────────────────────────────────────

class TestSummary:
    def test_summary_contains_well_count(self, minimal_html):
        result = parse_html_file(minimal_html)
        s = summary(result)
        assert "3" in s  # 3 скважины

    def test_summary_contains_bkns_gu(self, minimal_html):
        result = parse_html_file(minimal_html)
        s = summary(result)
        assert "БКНС" in s or "bkns" in s.lower()
        assert "ГУ" in s or "gu" in s.lower()

    def test_summary_contains_graph_stats(self, minimal_html):
        result = parse_html_file(minimal_html)
        s = summary(result)
        # 2 узла и 2 ребра
        assert "2" in s

    def test_summary_shows_errors_when_present(self, empty_html):
        result = parse_html_file(empty_html)
        s = summary(result)
        assert "Ошибок" in s or "ошибок" in s.lower()

    def test_summary_no_errors_section_on_clean_parse(self, minimal_html):
        result = parse_html_file(minimal_html)
        s = summary(result)
        assert "Ошибок" not in s
