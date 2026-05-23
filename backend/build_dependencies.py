"""
build_dependencies.py
=====================
Analizuje infrastructure.json i buduje graf zależności między liniami
energetycznymi, stacjami transformatorowymi i odbiorcami krytycznymi.

Krok 1: batch-fetch współrzędnych węzłów linii energetycznych z Overpass
Krok 2: analiza przestrzenna (linia → stacja → odbiorca)
Krok 3: nałożenie manual_overrides.json
Krok 4: zapis dependencies.json
"""

import json
import math
import os
import time
from pathlib import Path

import httpx

# ---------------------------------------------------------------------------
# Konfiguracja
# ---------------------------------------------------------------------------
INFRA_FILE          = Path(__file__).parent / "infrastructure.json"
OVERRIDES_FILE      = Path(__file__).parent / "manual_overrides.json"
OUTPUT_FILE         = Path(__file__).parent / "dependencies.json"

# Progi przestrzenne (metry)
LINE_TO_SUBSTATION_THRESHOLD_M  = 400   # maks. odległość linii od stacji
SUBSTATION_TO_FACILITY_M        = 2500  # zasięg zasilania stacji

# Kategorie odbiorców krytycznych
CRITICAL_TAGS = {
    ("amenity", "hospital"),
    ("amenity", "fire_station"),
    ("amenity", "police"),
    ("landuse", "industrial"),
}

OVERPASS_ENDPOINTS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]
BATCH_SIZE = 1500   # węzłów na jedno zapytanie Overpass


# ---------------------------------------------------------------------------
# Pomocnicze funkcje geometryczne
# ---------------------------------------------------------------------------
def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Odległość w metrach między dwoma punktami."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi  = math.radians(lat2 - lat1)
    dlam  = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def point_to_segment_distance(
    px: float, py: float,
    ax: float, ay: float,
    bx: float, by: float,
) -> float:
    """
    Odległość (m) między punktem (px,py) a odcinkiem (ax,ay)-(bx,by).
    Współrzędne w stopniach, wynik w metrach.
    Używa lokalnego przybliżenia płaskiego (błąd < 0.1% dla obszarów < 100 km).
    """
    # Przybliżamy stopnie na metry lokalnie
    lat_m = 111_320.0
    lon_m = 111_320.0 * math.cos(math.radians((ay + by) / 2))

    dx = (bx - ax) * lon_m
    dy = (by - ay) * lat_m
    seg_len2 = dx * dx + dy * dy

    if seg_len2 == 0:
        # Odcinek zdegenerowany do punktu
        return haversine(py, px, ay, ax)

    t = max(0.0, min(1.0, (
        (px - ax) * lon_m * dx + (py - ay) * lat_m * dy
    ) / seg_len2))

    proj_x = ax + t * (bx - ax)
    proj_y = ay + t * (by - ay)
    return haversine(py, px, proj_y, proj_x)


def min_distance_point_to_polyline(
    lat: float, lon: float, polyline: list[list[float]]
) -> float:
    """Minimalna odległość punktu do polilinii (listy [lat, lon])."""
    if len(polyline) < 2:
        if polyline:
            return haversine(lat, lon, polyline[0][0], polyline[0][1])
        return float("inf")

    return min(
        point_to_segment_distance(
            lon, lat,
            polyline[i][1], polyline[i][0],
            polyline[i + 1][1], polyline[i + 1][0],
        )
        for i in range(len(polyline) - 1)
    )


# ---------------------------------------------------------------------------
# Overpass — batch fetch współrzędnych węzłów
# ---------------------------------------------------------------------------
def overpass_query(query: str) -> dict:
    headers = {
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    for url in OVERPASS_ENDPOINTS:
        try:
            resp = httpx.post(url, data={"data": query}, headers=headers, timeout=90)
            if resp.status_code == 200:
                return resp.json()
            print(f"  {url} → HTTP {resp.status_code}")
        except Exception as e:
            print(f"  {url} → błąd: {e}")
    raise RuntimeError("Wszystkie endpointy Overpass niedostępne")


def fetch_node_coords(node_ids: list[int]) -> dict[int, tuple[float, float]]:
    """Pobiera współrzędne węzłów OSM w partiach. Zwraca {node_id: (lat, lon)}."""
    coords: dict[int, tuple[float, float]] = {}
    total_batches = math.ceil(len(node_ids) / BATCH_SIZE)

    for batch_idx in range(total_batches):
        batch = node_ids[batch_idx * BATCH_SIZE : (batch_idx + 1) * BATCH_SIZE]
        ids_str = ",".join(map(str, batch))
        query = f"[out:json][timeout:60]; node(id:{ids_str}); out;"
        print(f"  Batch {batch_idx + 1}/{total_batches}: {len(batch)} węzłów…", end=" ", flush=True)
        data = overpass_query(query)
        for el in data.get("elements", []):
            coords[el["id"]] = (el["lat"], el["lon"])
        print(f"✓ ({len(coords)} łącznie)")
        if batch_idx < total_batches - 1:
            time.sleep(2)   # grzeczny wobec Overpass

    return coords


# ---------------------------------------------------------------------------
# Ładowanie danych
# ---------------------------------------------------------------------------
def load_infra() -> dict:
    with open(INFRA_FILE, encoding="utf-8") as f:
        return json.load(f)


def get_coords(el: dict) -> tuple[float, float] | None:
    if "lat" in el and "lon" in el:
        return el["lat"], el["lon"]
    if "center" in el:
        return el["center"]["lat"], el["center"]["lon"]
    return None


def load_overrides() -> dict:
    if OVERRIDES_FILE.exists():
        with open(OVERRIDES_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


# ---------------------------------------------------------------------------
# Główna analiza
# ---------------------------------------------------------------------------
def build_dependencies() -> None:
    print("=== Budowanie grafu zależności infrastruktury ===\n")

    data = load_infra()
    elements = data["elements"]

    # Grupuj elementy według kategorii
    power_lines  = [e for e in elements if e.get("tags", {}).get("power") == "line"]
    substations  = [e for e in elements if e.get("tags", {}).get("power") == "substation"]
    power_plants = [e for e in elements if e.get("tags", {}).get("power") == "plant"]
    facilities   = [
        e for e in elements
        if any(e.get("tags", {}).get(k) == v for k, v in CRITICAL_TAGS)
    ]

    print(f"Załadowano: {len(power_lines)} linii, {len(substations)} stacji, "
          f"{len(power_plants)} elektrowni, {len(facilities)} obiektów krytycznych\n")

    # -----------------------------------------------------------------------
    # Krok 1: Zbierz wszystkie node IDs z linii energetycznych
    # -----------------------------------------------------------------------
    all_node_ids: list[int] = []
    for line in power_lines:
        all_node_ids.extend(line.get("nodes", []))
    all_node_ids = list(dict.fromkeys(all_node_ids))   # deduplikacja

    print(f"Krok 1: Pobieranie współrzędnych {len(all_node_ids)} węzłów…")
    node_coords = fetch_node_coords(all_node_ids)
    print(f"  Pobrano {len(node_coords)}/{len(all_node_ids)} węzłów\n")

    # -----------------------------------------------------------------------
    # Krok 2: Zbuduj geometrie linii
    # -----------------------------------------------------------------------
    print("Krok 2: Budowanie geometrii linii…")
    line_geometries: dict[int, list[list[float]]] = {}
    for line in power_lines:
        geom = []
        for nid in line.get("nodes", []):
            if nid in node_coords:
                lat, lon = node_coords[nid]
                geom.append([lat, lon])
        line_geometries[line["id"]] = geom
    print(f"  Zbudowano geometrię dla {len(line_geometries)} linii\n")

    # -----------------------------------------------------------------------
    # Krok 3: Analiza przestrzenna — linia → stacja
    # -----------------------------------------------------------------------
    print("Krok 3: Analiza przestrzenna linia → stacja…")
    # {line_id: [substation_id, ...]}
    line_to_subs: dict[int, list[int]] = {l["id"]: [] for l in power_lines}
    # {substation_id: [line_id, ...]}
    sub_to_lines: dict[int, list[int]] = {s["id"]: [] for s in substations}

    for sub in substations:
        sub_coords = get_coords(sub)
        if not sub_coords:
            continue
        s_lat, s_lon = sub_coords

        for line in power_lines:
            geom = line_geometries.get(line["id"], [])
            if len(geom) < 2:
                continue
            dist = min_distance_point_to_polyline(s_lat, s_lon, geom)
            if dist <= LINE_TO_SUBSTATION_THRESHOLD_M:
                line_to_subs[line["id"]].append(sub["id"])
                sub_to_lines[sub["id"]].append(line["id"])

    connected_lines = sum(1 for v in line_to_subs.values() if v)
    print(f"  {connected_lines} linii połączonych ze stacjami\n")

    # -----------------------------------------------------------------------
    # Krok 4: Analiza przestrzenna — stacja → odbiorcy krytyczni
    # -----------------------------------------------------------------------
    print("Krok 4: Analiza przestrzenna stacja → odbiorcy…")
    # {substation_id: [facility_id, ...]}
    sub_to_facilities: dict[int, list[int]] = {s["id"]: [] for s in substations}
    # {facility_id: [substation_id, ...]}
    facility_to_subs: dict[int, list[int]] = {f["id"]: [] for f in facilities}

    for sub in substations:
        sub_coords = get_coords(sub)
        if not sub_coords:
            continue
        s_lat, s_lon = sub_coords

        for fac in facilities:
            fac_coords = get_coords(fac)
            if not fac_coords:
                continue
            f_lat, f_lon = fac_coords
            dist = haversine(s_lat, s_lon, f_lat, f_lon)
            if dist <= SUBSTATION_TO_FACILITY_M:
                sub_to_facilities[sub["id"]].append(fac["id"])
                facility_to_subs[fac["id"]].append(sub["id"])

    connected_subs = sum(1 for v in sub_to_facilities.values() if v)
    print(f"  {connected_subs} stacji z odbiorcami krytycznymi\n")

    # -----------------------------------------------------------------------
    # Krok 5: Nałóż manual_overrides.json
    # -----------------------------------------------------------------------
    overrides = load_overrides()

    for conn in overrides.get("add_line_substation", []):
        lid, sid = conn["line_id"], conn["substation_id"]
        if sid not in line_to_subs.get(lid, []):
            line_to_subs.setdefault(lid, []).append(sid)
        if lid not in sub_to_lines.get(sid, []):
            sub_to_lines.setdefault(sid, []).append(lid)
        print(f"  [OVERRIDE +] Linia {lid} → Stacja {sid}  ({conn.get('reason','')})")

    for conn in overrides.get("remove_line_substation", []):
        lid, sid = conn["line_id"], conn["substation_id"]
        if sid in line_to_subs.get(lid, []):
            line_to_subs[lid].remove(sid)
        if lid in sub_to_lines.get(sid, []):
            sub_to_lines[sid].remove(lid)
        print(f"  [OVERRIDE -] Linia {lid} → Stacja {sid}  ({conn.get('reason','')})")

    for conn in overrides.get("add_substation_facility", []):
        sid, fid = conn["substation_id"], conn["facility_id"]
        if fid not in sub_to_facilities.get(sid, []):
            sub_to_facilities.setdefault(sid, []).append(fid)
        if sid not in facility_to_subs.get(fid, []):
            facility_to_subs.setdefault(fid, []).append(sid)
        print(f"  [OVERRIDE +] Stacja {sid} → Obiekt {fid}  ({conn.get('reason','')})")

    for conn in overrides.get("remove_substation_facility", []):
        sid, fid = conn["substation_id"], conn["facility_id"]
        if fid in sub_to_facilities.get(sid, []):
            sub_to_facilities[sid].remove(fid)
        if sid in facility_to_subs.get(fid, []):
            facility_to_subs[fid].remove(sid)
        print(f"  [OVERRIDE -] Stacja {sid} → Obiekt {fid}  ({conn.get('reason','')})")

    # -----------------------------------------------------------------------
    # Krok 6: Złóż wynikowy graf
    # -----------------------------------------------------------------------
    def el_by_id(eid: int) -> dict:
        for e in elements:
            if e["id"] == eid:
                return e
        return {}

    def voltage_label(tags: dict) -> str:
        v = tags.get("voltage", "")
        if v == "220000": return "220 kV"
        if v == "110000": return "110 kV"
        if v:            return f"{int(v)//1000} kV"
        return "?"

    power_chains = []
    for line in power_lines:
        geom = line_geometries.get(line["id"], [])
        if not geom:
            continue
        tags = line.get("tags", {})
        fed_subs = line_to_subs.get(line["id"], [])
        # Wyznacz pośrednio zasilane obiekty przez stacje
        fed_facilities = list({
            fid
            for sid in fed_subs
            for fid in sub_to_facilities.get(sid, [])
        })

        power_chains.append({
            "line_id":          line["id"],
            "voltage":          int(tags.get("voltage", 0) or 0),
            "voltage_label":    voltage_label(tags),
            "name":             tags.get("name", ""),
            "operator":         tags.get("operator", ""),
            "geometry":         geom,
            "feeds_substations": fed_subs,
            "feeds_facilities":  fed_facilities,
        })

    substation_zones = []
    for sub in substations:
        sub_coords = get_coords(sub)
        if not sub_coords:
            continue
        s_lat, s_lon = sub_coords
        tags = sub.get("tags", {})
        powered_lines = sub_to_lines.get(sub["id"], [])
        powered_facs  = sub_to_facilities.get(sub["id"], [])

        substation_zones.append({
            "substation_id":   sub["id"],
            "name":            tags.get("name", f"Stacja #{sub['id']}"),
            "lat":             s_lat,
            "lon":             s_lon,
            "voltage":         tags.get("voltage", ""),
            "powered_by_lines": powered_lines,
            "powers_facilities": powered_facs,
        })

    facility_deps = []
    for fac in facilities:
        fac_coords = get_coords(fac)
        if not fac_coords:
            continue
        f_lat, f_lon = fac_coords
        tags = fac.get("tags", {})
        powered_by = facility_to_subs.get(fac["id"], [])
        # Kategoria
        cat = "other"
        for k, v in CRITICAL_TAGS:
            if tags.get(k) == v:
                cat = v
                break

        facility_deps.append({
            "facility_id":      fac["id"],
            "name":             tags.get("name", f"Obiekt #{fac['id']}"),
            "lat":              f_lat,
            "lon":              f_lon,
            "category":         cat,
            "powered_by_substations": powered_by,
        })

    result = {
        "generated_at":    __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "thresholds": {
            "line_to_substation_m":  LINE_TO_SUBSTATION_THRESHOLD_M,
            "substation_to_facility_m": SUBSTATION_TO_FACILITY_M,
        },
        "power_chains":     power_chains,
        "substation_zones": substation_zones,
        "facility_deps":    facility_deps,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Zapisano {OUTPUT_FILE}")
    print(f"  {len(power_chains)} linii energetycznych z geometrią")
    print(f"  {len(substation_zones)} stref zasilania")
    print(f"  {len(facility_deps)} obiektów krytycznych z zależnościami")

    # Podsumowanie pokrycia
    covered = sum(1 for f in facility_deps if f["powered_by_substations"])
    print(f"  {covered}/{len(facility_deps)} obiektów ma przypisaną stację zasilającą")


if __name__ == "__main__":
    build_dependencies()
