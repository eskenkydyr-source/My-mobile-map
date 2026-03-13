"""
Парсер оригинального index.html — извлекает данные скважин, БКНС, ГУ и графа дорог.

Реальный формат данных в index.html:
  - WELLS: GeoJSON FeatureCollection (const WELLS={...})
  - BKNS:  GeoJSON FeatureCollection с полигонами (const BKNS={...})
  - GU:    GeoJSON FeatureCollection с полигонами (const GU={...})
  - GRAPH: {nodes:[[lat,lon,type],...], edges:[[from,to,dist_m],...]} (const GRAPH={...})

ВАЖНО по координатам:
  - WELLS GeoJSON: geometry.coordinates = [lon, lat] → при парсинге переставляем в (lat, lon)
  - GRAPH nodes: [lat, lon, type] — уже в правильном порядке
"""
import re
import json
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ParsedWell:
    well_id: str
    lat: float
    lon: float
    well_type: str        # dob., nagn., likv., water, gaz, kontr., razv.
    properties: dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedObject:
    """БКНС или ГУ с полигоном."""
    obj_type: str         # bkns, gu
    name: str
    lat: float
    lon: float
    properties: dict[str, Any] = field(default_factory=dict)
    geometry: dict[str, Any] = field(default_factory=dict)  # GeoJSON geometry


@dataclass
class ParsedGraph:
    nodes: list[tuple[float, float, str]]  # (lat, lon, type)
    edges: list[tuple[int, int, int]]      # (from, to, dist_m)


@dataclass
class ParseResult:
    wells: list[ParsedWell]
    objects: list[ParsedObject]
    graph: ParsedGraph
    errors: list[str]


def parse_html_file(filepath: str | Path) -> ParseResult:
    """Главная функция — читает index.html и возвращает все данные."""
    text = Path(filepath).read_text(encoding="utf-8")
    errors: list[str] = []

    wells = _extract_wells(text, errors)
    objects = _extract_bkns(text, errors) + _extract_gu(text, errors)
    graph = _extract_graph(text, errors)

    return ParseResult(wells=wells, objects=objects, graph=graph, errors=errors)


def _extract_json_var(text: str, var_name: str) -> dict | None:
    """
    Находит `const VAR_NAME={...}` в тексте и возвращает распарсенный dict.
    Использует подсчёт скобок для извлечения полного JSON объекта.
    """
    pattern = rf'const\s+{re.escape(var_name)}\s*=\s*(\{{)'
    match = re.search(pattern, text)
    if not match:
        return None

    start = match.start(1)
    depth = 0
    i = start
    while i < len(text):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                json_str = text[start : i + 1]
                return json.loads(json_str)
        i += 1
    return None


def _extract_wells(text: str, errors: list[str]) -> list[ParsedWell]:
    """
    Извлекает скважины из const WELLS={...} — GeoJSON FeatureCollection.

    Каждый feature:
      {
        "type": "Feature",
        "properties": {"id": "...", "name": "...", "type": "dob.", "type_ru": "...",
                       "well_num": ..., "horizon": "...", "bkns": "...", "comment": "..."},
        "geometry": {"type": "Point", "coordinates": [lon, lat]}
      }

    GeoJSON координаты: [lon, lat] → переставляем в (lat, lon).
    """
    try:
        data = _extract_json_var(text, "WELLS")
    except (json.JSONDecodeError, Exception) as e:
        errors.append(f"Ошибка парсинга WELLS: {e}")
        return []

    if data is None:
        errors.append("WELLS не найден в файле")
        return []

    wells: list[ParsedWell] = []
    features = data.get("features", [])
    for feat in features:
        try:
            props = feat.get("properties", {}) or {}
            coords = feat.get("geometry", {}).get("coordinates", [])
            if len(coords) < 2:
                continue

            # GeoJSON порядок: [lon, lat]
            lon = float(coords[0])
            lat = float(coords[1])

            well_id = str(props.get("id", props.get("well_num", "")))
            well_type = str(props.get("type", ""))

            wells.append(ParsedWell(
                well_id=well_id,
                lat=lat,
                lon=lon,
                well_type=well_type,
                properties=dict(props),
            ))
        except (ValueError, TypeError, KeyError) as e:
            errors.append(f"Ошибка парсинга скважины: {e}")

    return wells


def _extract_bkns(text: str, errors: list[str]) -> list[ParsedObject]:
    """
    Извлекает БКНС из const BKNS={...} — GeoJSON FeatureCollection.

    properties: OBJECTID, NAME, BKNS_UCHAS, Shape_Leng, Shape_Area, layer_type,
                centroid:[lon, lat]
    geometry.type: "Polygon"
    """
    try:
        data = _extract_json_var(text, "BKNS")
    except (json.JSONDecodeError, Exception) as e:
        errors.append(f"Ошибка парсинга BKNS: {e}")
        return []

    if data is None:
        errors.append("BKNS не найден в файле")
        return []

    objects: list[ParsedObject] = []
    features = data.get("features", [])
    for feat in features:
        try:
            props = feat.get("properties", {}) or {}
            geometry = feat.get("geometry", {}) or {}

            name = str(props.get("NAME", props.get("name", f"БКНС-{props.get('OBJECTID', '?')}")))

            # Центроид: в properties.centroid = [lon, lat]
            centroid = props.get("centroid", [])
            if centroid and len(centroid) >= 2:
                lat = float(centroid[1])
                lon = float(centroid[0])
            else:
                # Вычисляем центроид из полигона (первое кольцо)
                coords = geometry.get("coordinates", [[]])
                ring = coords[0] if coords else []
                if ring:
                    lon = sum(c[0] for c in ring) / len(ring)
                    lat = sum(c[1] for c in ring) / len(ring)
                else:
                    lat, lon = 0.0, 0.0

            objects.append(ParsedObject(
                obj_type="bkns",
                name=name,
                lat=lat,
                lon=lon,
                properties=dict(props),
                geometry=dict(geometry),
            ))
        except (ValueError, TypeError, KeyError) as e:
            errors.append(f"Ошибка парсинга BKNS feature: {e}")

    return objects


def _extract_gu(text: str, errors: list[str]) -> list[ParsedObject]:
    """
    Извлекает ГУ из const GU={...} — GeoJSON FeatureCollection.

    properties: OBJECTID_1, OBJECTID, AREA, PERIMETER, GU_, GU_ID, NAME, FIND, Shape_Leng
    geometry.type: "Polygon"
    """
    try:
        data = _extract_json_var(text, "GU")
    except (json.JSONDecodeError, Exception) as e:
        errors.append(f"Ошибка парсинга GU: {e}")
        return []

    if data is None:
        errors.append("GU не найден в файле")
        return []

    objects: list[ParsedObject] = []
    features = data.get("features", [])
    for feat in features:
        try:
            props = feat.get("properties", {}) or {}
            geometry = feat.get("geometry", {}) or {}

            name = str(props.get("NAME", props.get("name", f"ГУ-{props.get('OBJECTID', '?')}")))

            # Вычисляем центроид из полигона
            coords = geometry.get("coordinates", [[]])
            ring = coords[0] if coords else []
            if ring:
                lon = sum(c[0] for c in ring) / len(ring)
                lat = sum(c[1] for c in ring) / len(ring)
            else:
                lat, lon = 0.0, 0.0

            objects.append(ParsedObject(
                obj_type="gu",
                name=name,
                lat=lat,
                lon=lon,
                properties=dict(props),
                geometry=dict(geometry),
            ))
        except (ValueError, TypeError, KeyError) as e:
            errors.append(f"Ошибка парсинга GU feature: {e}")

    return objects


def _extract_graph(text: str, errors: list[str]) -> ParsedGraph:
    """
    Извлекает const GRAPH={nodes:[[lat,lon,type],...], edges:[[from,to,dist_m],...]}

    Узлы: nodes[i] = [lat, lon, node_type] — порядок lat, lon (не GeoJSON!)
    Рёбра: edges[i] = [from_idx, to_idx, dist_m]
    """
    try:
        data = _extract_json_var(text, "GRAPH")
    except (json.JSONDecodeError, Exception) as e:
        errors.append(f"Ошибка парсинга GRAPH: {e}")
        return ParsedGraph([], [])

    if data is None:
        errors.append("GRAPH не найден в файле")
        return ParsedGraph([], [])

    try:
        raw_nodes = data.get("nodes", [])
        raw_edges = data.get("edges", [])

        nodes: list[tuple[float, float, str]] = []
        for n in raw_nodes:
            if len(n) >= 3:
                nodes.append((float(n[0]), float(n[1]), str(n[2])))
            elif len(n) == 2:
                nodes.append((float(n[0]), float(n[1]), "road"))

        edges: list[tuple[int, int, int]] = []
        for e in raw_edges:
            if len(e) >= 3:
                edges.append((int(e[0]), int(e[1]), int(e[2])))

        return ParsedGraph(nodes=nodes, edges=edges)
    except (KeyError, ValueError, TypeError) as e:
        errors.append(f"Ошибка структуры GRAPH: {e}")
        return ParsedGraph([], [])


def summary(result: ParseResult) -> str:
    """Текстовый итог парсинга для логов."""
    well_counts: dict[str, int] = {}
    for w in result.wells:
        well_counts[w.well_type] = well_counts.get(w.well_type, 0) + 1

    bkns_count = sum(1 for o in result.objects if o.obj_type == "bkns")
    gu_count   = sum(1 for o in result.objects if o.obj_type == "gu")

    lines = [
        "Парсинг завершён",
        f"   Скважины: {len(result.wells)} шт -> {well_counts}",
        f"   БКНС: {bkns_count} шт",
        f"   ГУ:   {gu_count} шт",
        f"   Граф: {len(result.graph.nodes)} узлов, {len(result.graph.edges)} рёбер",
    ]
    if result.errors:
        lines.append(f"Ошибок: {len(result.errors)}")
        for e in result.errors:
            lines.append(f"   - {e}")
    return "\n".join(lines)
