import re
import json
from pathlib import Path

text = Path("index.html").read_text(encoding="utf-8")

def extract_json_var(text, varname):
    pattern = rf'const {varname}\s*=\s*'
    match = re.search(pattern, text)
    if not match:
        print(f"  [!] Variable {varname} not found")
        return None
    start = match.end()
    first_char = text[start]
    open_char = first_char
    close_char = '}' if open_char == '{' else ']'
    depth = 0
    i = start
    while i < len(text):
        if text[i] == open_char:
            depth += 1
        elif text[i] == close_char:
            depth -= 1
            if depth == 0:
                raw = text[start:i+1]
                return json.loads(raw)
        i += 1
    return None

print("Parsing index.html...")

wells = extract_json_var(text, "WELLS")
bkns  = extract_json_var(text, "BKNS")
gu    = extract_json_var(text, "GU")
graph = extract_json_var(text, "GRAPH")

out_dir = Path("frontend/public/data")
out_dir.mkdir(parents=True, exist_ok=True)

if wells:
    n = len(wells.get("features", []))
    print(f"  WELLS: {n} features")
    (out_dir / "wells.geojson").write_text(json.dumps(wells, ensure_ascii=False), encoding="utf-8")
else:
    print("  WELLS: not found, creating empty")
    (out_dir / "wells.geojson").write_text(json.dumps({"type":"FeatureCollection","features":[]}), encoding="utf-8")

if bkns:
    n = len(bkns.get("features", []))
    print(f"  BKNS: {n} features")
    (out_dir / "bkns.geojson").write_text(json.dumps(bkns, ensure_ascii=False), encoding="utf-8")
else:
    print("  BKNS: not found, creating empty")
    (out_dir / "bkns.geojson").write_text(json.dumps({"type":"FeatureCollection","features":[]}), encoding="utf-8")

if gu:
    n = len(gu.get("features", []))
    print(f"  GU: {n} features")
    (out_dir / "gu.geojson").write_text(json.dumps(gu, ensure_ascii=False), encoding="utf-8")
else:
    print("  GU: not found, creating empty")
    (out_dir / "gu.geojson").write_text(json.dumps({"type":"FeatureCollection","features":[]}), encoding="utf-8")

if graph:
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    print(f"  GRAPH: {len(nodes)} nodes, {len(edges)} edges")
    (out_dir / "graph.json").write_text(json.dumps(graph, ensure_ascii=False), encoding="utf-8")
else:
    print("  GRAPH: not found, creating empty")
    (out_dir / "graph.json").write_text(json.dumps({"nodes":[],"edges":[]}), encoding="utf-8")

print("Done! Files saved to frontend/public/data/")
