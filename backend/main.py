import asyncio
import os
import re
import random
import math
import json
import time
from collections import deque
from pathlib import Path
from typing import TypedDict, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, BackgroundTasks, File
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

TILES_DIR = "map_tiles"
if os.path.isdir(TILES_DIR):
    app.mount("/tiles", StaticFiles(directory=TILES_DIR), name="tiles")

# Serwuj pliki danych bezpośrednio z backendu — nie trzeba ręcznie kopiować do frontend/public
from fastapi.responses import FileResponse, JSONResponse

@app.get("/dependencies.json")
async def get_dependencies():
    return FileResponse("dependencies.json", media_type="application/json")

@app.get("/infrastructure.json")
async def get_infrastructure():
    return FileResponse("infrastructure.json", media_type="application/json")

STALOWA_WOLA = (50.56211528577714, 22.066128447186205)

class Unit(TypedDict):
    id: str
    name: str
    lat: float
    lng: float
    status: str
    role: str

UNITS: list[Unit] = [
    {"id": "alpha",   "name": "Zespół Alpha",        "lat": STALOWA_WOLA[0] + 0.01,  "lng": STALOWA_WOLA[1] - 0.01,  "status": "active", "role": "recon"},
    {"id": "bravo",   "name": "Zespół Bravo",         "lat": STALOWA_WOLA[0] - 0.005, "lng": STALOWA_WOLA[1] + 0.015, "status": "active", "role": "medic"},
    {"id": "charlie", "name": "Zespół Charlie",       "lat": STALOWA_WOLA[0] + 0.008, "lng": STALOWA_WOLA[1] + 0.008, "status": "idle",   "role": "engineer"},
    {"id": "delta",   "name": "Dron Delta",           "lat": STALOWA_WOLA[0] + 0.02,  "lng": STALOWA_WOLA[1],         "status": "active", "role": "drone"},
    {"id": "command", "name": "Punkt Dowodzenia",     "lat": STALOWA_WOLA[0],         "lng": STALOWA_WOLA[1],         "status": "active", "role": "command"},
]

# ---------------------------------------------------------------------------
# Graf infrastruktury krytycznej Stalowej Woli
# ---------------------------------------------------------------------------
INFRASTRUCTURE: dict[str, dict] = {
    "elektrownia_poludnie": {
        "name": "Elektrociepłownia Południe",
        "type": "energy",
        "lat": 50.5742, "lng": 22.0412,
        "criticality": 5, "backup_power_hours": 0,
        "powers": ["szpital_powiatowy", "wodociagi_stacja", "hsw_zaklad", "urzad_miasta", "ratusz", "pompownia_centralna", "stacja_transf_polnoc"],
        "dependencies": [],
        "vulnerability": ["drone", "missile", "sabotage"],
        "defense": ["ochrona_fizyczna", "ogrodzenie_perymetryczne", "monitoring_cctv"],
    },
    "stacja_transf_polnoc": {
        "name": "GPZ Stalowa Wola Północ",
        "type": "energy",
        "lat": 50.5903, "lng": 22.0648,
        "criticality": 4, "backup_power_hours": 0,
        "powers": ["komenda_policji", "straz_pozarna", "centrum_zarzadzania", "dworzec_pkp", "linia_telekomunikacyjna"],
        "dependencies": ["elektrownia_poludnie"],
        "vulnerability": ["drone", "cyber", "sabotage"],
        "defense": ["ogrodzenie", "monitoring_cctv"],
    },
    "szpital_powiatowy": {
        "name": "Szpital Powiatowy im. S. Staszica",
        "type": "medical",
        "lat": 50.5830, "lng": 22.0523,
        "criticality": 5, "backup_power_hours": 8,
        "powers": [],
        "dependencies": ["elektrownia_poludnie", "wodociagi_stacja"],
        "vulnerability": ["drone", "cyber"],
        "defense": ["agregat_8h", "monitoring_cctv", "ochrona_fizyczna"],
    },
    "hsw_zaklad": {
        "name": "Huta Stalowa Wola S.A.",
        "type": "industrial",
        "lat": 50.5752, "lng": 22.0781,
        "criticality": 5, "backup_power_hours": 0,
        "powers": [],
        "dependencies": ["elektrownia_poludnie"],
        "vulnerability": ["missile", "drone", "sabotage"],
        "defense": ["ochrona_wojskowa", "ogrodzenie_perymetryczne", "monitoring_cctv", "brama_kontrolna"],
    },
    "wodociagi_stacja": {
        "name": "Stacja Uzdatniania Wody",
        "type": "water",
        "lat": 50.5698, "lng": 22.0620,
        "criticality": 5, "backup_power_hours": 4,
        "powers": ["szpital_powiatowy", "straz_pozarna", "pompownia_centralna"],
        "dependencies": ["elektrownia_poludnie"],
        "vulnerability": ["drone", "chemical", "sabotage"],
        "defense": ["ogrodzenie", "monitoring_chemiczny", "agregat_4h"],
    },
    "pompownia_centralna": {
        "name": "Przepompownia Wody Centralna",
        "type": "water",
        "lat": 50.5675, "lng": 22.0698,
        "criticality": 3, "backup_power_hours": 2,
        "powers": ["wiezyczka_cisnienia"],
        "dependencies": ["elektrownia_poludnie", "wodociagi_stacja"],
        "vulnerability": ["drone", "sabotage"],
        "defense": ["ogrodzenie", "monitoring_automatyczny"],
    },
    "most_san_glowny": {
        "name": "Most im. J. Piłsudskiego nad Sanem",
        "type": "transport",
        "lat": 50.5955, "lng": 22.1140,
        "criticality": 5, "backup_power_hours": 0,
        "powers": [],
        "dependencies": [],
        "vulnerability": ["missile", "drone"],
        "defense": ["patrol_wojskowy", "monitoring_cctv"],
    },
    "most_san_polnoc": {
        "name": "Most Północny nad Sanem",
        "type": "transport",
        "lat": 50.6085, "lng": 22.1026,
        "criticality": 4, "backup_power_hours": 0,
        "powers": [],
        "dependencies": [],
        "vulnerability": ["missile", "drone"],
        "defense": ["patrol_drogowy"],
    },
    "dworzec_pkp": {
        "name": "Stacja PKP Stalowa Wola-Centrum",
        "type": "transport",
        "lat": 50.5817, "lng": 22.0831,
        "criticality": 3, "backup_power_hours": 0,
        "powers": [],
        "dependencies": ["stacja_transf_polnoc"],
        "vulnerability": ["missile", "drone", "sabotage"],
        "defense": ["monitoring_cctv", "ochrona_fizyczna"],
    },
    "komenda_policji": {
        "name": "Komenda Powiatowa Policji",
        "type": "law_enforcement",
        "lat": 50.5782, "lng": 22.0543,
        "criticality": 3, "backup_power_hours": 4,
        "powers": [],
        "dependencies": ["stacja_transf_polnoc"],
        "vulnerability": ["drone", "cyber"],
        "defense": ["ochrona_fizyczna", "monitoring_cctv", "agregat_4h", "uzbrojona_ochrona"],
    },
    "straz_pozarna": {
        "name": "Komenda Powiatowa PSP",
        "type": "fire",
        "lat": 50.5720, "lng": 22.0592,
        "criticality": 4, "backup_power_hours": 8,
        "powers": [],
        "dependencies": ["stacja_transf_polnoc", "wodociagi_stacja"],
        "vulnerability": ["drone", "missile"],
        "defense": ["ochrona_fizyczna", "agregat_8h", "monitoring_cctv"],
    },
    "urzad_miasta": {
        "name": "Urząd Miasta Stalowej Woli",
        "type": "government",
        "lat": 50.5720, "lng": 22.0499,
        "criticality": 3, "backup_power_hours": 2,
        "powers": [],
        "dependencies": ["elektrownia_poludnie"],
        "vulnerability": ["cyber", "drone"],
        "defense": ["monitoring_cctv", "ochrona_fizyczna"],
    },
    "ratusz": {
        "name": "Ratusz — Siedziba Władz Powiatu",
        "type": "government",
        "lat": 50.5728, "lng": 22.0481,
        "criticality": 3, "backup_power_hours": 2,
        "powers": [],
        "dependencies": ["elektrownia_poludnie"],
        "vulnerability": ["cyber", "drone", "sabotage"],
        "defense": ["monitoring_cctv", "ochrona_fizyczna"],
    },
    "centrum_zarzadzania": {
        "name": "Centrum Zarządzania Kryzysowego",
        "type": "government",
        "lat": 50.5748, "lng": 22.0511,
        "criticality": 5, "backup_power_hours": 24,
        "powers": [],
        "dependencies": ["stacja_transf_polnoc"],
        "vulnerability": ["cyber", "drone", "sabotage"],
        "defense": ["ochrona_wojskowa", "system_antydron", "agregat_24h", "bunker", "szyfrowanie_sieci"],
    },
    "wiezyczka_cisnienia": {
        "name": "Wieżyczka Ciśnień (Zachód)",
        "type": "water",
        "lat": 50.5668, "lng": 22.0452,
        "criticality": 3, "backup_power_hours": 0,
        "powers": [],
        "dependencies": ["pompownia_centralna"],
        "vulnerability": ["drone", "sabotage"],
        "defense": ["ogrodzenie"],
    },
    "linia_telekomunikacyjna": {
        "name": "Węzeł Telekomunikacyjny TP",
        "type": "communications",
        "lat": 50.5764, "lng": 22.0622,
        "criticality": 4, "backup_power_hours": 4,
        "powers": [],
        "dependencies": ["stacja_transf_polnoc"],
        "vulnerability": ["cyber", "drone", "sabotage"],
        "defense": ["monitoring_cctv", "szyfrowanie_sieci", "ups_system"],
    },
}


def _severity(attacked_id: str, all_affected_ids: list[str]) -> str:
    """
    Ocena skali wg liczby obiektów o krytyczności == 5 (wg referencyj. algorytmu).
    Uwzględnia też sam zaatakowany obiekt.
    """
    attacked = INFRASTRUCTURE.get(attacked_id, {})
    crit5 = sum(
        1 for i in all_affected_ids
        if INFRASTRUCTURE.get(i, {}).get("criticality") == 5
    )
    if attacked.get("criticality") == 5:
        crit5 += 1
    if crit5 >= 3:
        return "KATASTROFALNY"
    if crit5 >= 2:
        return "KRYTYCZNY"
    if crit5 >= 1:
        return "POWAŻNY"
    return "UMIARKOWANY"


def analyze_impact(object_id: str, attack_time_minutes: int = 0) -> "dict | None":
    """
    Propagacja skutków ataku — BFS po grafie dependencies (reverse lookup).

    Zwraca:
      immediate    — backup_hours == 0
      cascade_4h   — 0 < backup <= 4h
      cascade_8h   — 4h < backup <= 8h
      cascade_t3   — backup > 8h (obiekty odporne, ale tracą źródło zasilania)
      critical_affected — liczba obiektów z criticality >= 4
      affected_details  — pełne dane per obiekt (name/type/criticality/backup/depth)
    """
    if object_id not in INFRASTRUCTURE:
        return None

    attacked = INFRASTRUCTURE[object_id]

    affected: dict[str, dict] = {}
    queue: deque[tuple[str, int]] = deque([(object_id, 0)])
    visited: set[str] = set()

    while queue:
        obj_id, depth = queue.popleft()
        if obj_id in visited:
            continue
        visited.add(obj_id)

        if obj_id != object_id:
            obj = INFRASTRUCTURE[obj_id]
            backup_h = obj.get("backup_power_hours", 0)
            affected[obj_id] = {
                "name":             obj["name"],
                "type":             obj["type"],
                "criticality":      obj["criticality"],
                "backup_hours":     backup_h,
                "fails_after_hours": backup_h,
                "depth":            depth,
            }

        # Znajdź obiekty zależne od bieżącego (reverse lookup przez dependencies)
        for other_id, other_obj in INFRASTRUCTURE.items():
            if obj_id in other_obj.get("dependencies", []) and other_id not in visited:
                queue.append((other_id, depth + 1))

    # Grupuj po czasie awarii (klucze zachowane dla kompatybilności z frontendem)
    immediate   = [k for k, v in affected.items() if v["backup_hours"] == 0]
    cascade_4h  = [k for k, v in affected.items() if 0 < v["backup_hours"] <= 4]
    cascade_8h  = [k for k, v in affected.items() if 4 < v["backup_hours"] <= 8]
    cascade_t3  = [k for k, v in affected.items() if v["backup_hours"] > 8]

    all_affected_ids = immediate + cascade_4h + cascade_8h + cascade_t3
    critical_count = sum(
        1 for i in all_affected_ids
        if INFRASTRUCTURE.get(i, {}).get("criticality", 0) >= 4
    )

    return {
        "attacked_id":       object_id,
        "attacked_name":     attacked["name"],
        "attacked_type":     attacked["type"],
        "total_affected":    len(affected),
        "critical_affected": critical_count,
        "immediate":         immediate,
        "cascade_4h":        cascade_4h,
        "cascade_8h":        cascade_8h,
        "cascade_t3":        cascade_t3,
        "affected_details":  affected,
        "severity":          _severity(object_id, all_affected_ids),
    }


CUSTOM_POINTS_FILE = "custom_points.json"

def load_custom_points():
    if os.path.exists(CUSTOM_POINTS_FILE):
        try:
            with open(CUSTOM_POINTS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_custom_points(points):
    with open(CUSTOM_POINTS_FILE, "w") as f:
        json.dump(points, f)

CUSTOM_POINTS = load_custom_points()

class CustomPointModel(BaseModel):
    id: str
    lat: float
    lng: float
    name: str
    description: str

# Persystentny stan ruchu dla jednostek pieszych (nagłówek + odcinki drogi)
_foot_state: dict[str, dict] = {}

def _is_drone(unit: Unit) -> bool:
    return unit["role"] == "drone"

def _foot_state_for(unit_id: str) -> dict:
    if unit_id not in _foot_state:
        _foot_state[unit_id] = {
            "heading":       random.uniform(0, 360),  # 0=N, 90=E, 180=S, 270=W
            "pause_left":    0,                       # ticki postoju
            "ticks_to_turn": random.randint(6, 20),   # ticki do następnego skrzyżowania
        }
    return _foot_state[unit_id]

def move_units():
    for unit in UNITS:
        if unit["role"] == "command":
            continue

        if _is_drone(unit):
            # Dron: szybki, losowy ruch omnikierunkowy — bez zmian
            speed = 0.0009
            unit["lat"] += random.uniform(-speed, speed)
            unit["lng"] += random.uniform(-speed, speed)
        else:
            # Jednostka piesza: ruch wzdłuż "drogi" z zatrzymaniami na skrzyżowaniach
            state = _foot_state_for(unit["id"])

            if state["pause_left"] > 0:
                # Postój — czekanie, sprawdzanie mapy, obserwacja
                state["pause_left"] -= 1
            else:
                state["ticks_to_turn"] -= 1
                if state["ticks_to_turn"] <= 0:
                    # Skrzyżowanie: skręt o 0° / ±45° / ±90° + lekki szum
                    turn = random.choice([-90, -45, 0, 0, 45, 90])
                    state["heading"] = (state["heading"] + turn + random.gauss(0, 8)) % 360
                    state["ticks_to_turn"] = random.randint(6, 20)
                    # Krótka pauza przy skrzyżowaniu
                    state["pause_left"] = random.randint(1, 3)
                else:
                    # Idzie prosto wzdłuż odcinka — minimalne odchylenie od kursu
                    state["heading"] = (state["heading"] + random.gauss(0, 4)) % 360
                    rad = math.radians(state["heading"])
                    speed = 0.00018  # ~20 m/tick — ok. 4× wolniej niż dron
                    unit["lat"] += math.cos(rad) * speed
                    unit["lng"] += math.sin(rad) * speed

                    # Sporadyczne zatrzymanie (6%) — patrol, obserwacja
                    if random.random() < 0.06:
                        state["pause_left"] = random.randint(3, 8)

        if random.random() < 0.015:
            unit["status"] = random.choices(["active", "idle", "sos"], weights=[6, 3, 1])[0]


@app.get("/api/units")
async def get_units():
    return UNITS


@app.post("/api/units/{unit_id}/status")
async def update_status(unit_id: str, status: str):
    for unit in UNITS:
        if unit["id"] == unit_id:
            unit["status"] = status
            return {"ok": True}
    return {"ok": False, "error": "not found"}


@app.websocket("/ws/map")
async def websocket_map(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            move_units()
            await websocket.send_json({
                "type": "positions",
                "units": UNITS,
                "timestamp": asyncio.get_event_loop().time(),
            })
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass


def distance_km(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@app.get("/api/alerts")
async def check_alerts():
    command = next(u for u in UNITS if u["role"] == "command")
    alerts = []
    for unit in UNITS:
        if unit["role"] == "command":
            continue
        dist = distance_km(command["lat"], command["lng"], unit["lat"], unit["lng"])
        if dist < 0.5:
            alerts.append({
                "unit": unit["name"],
                "distance_m": round(dist * 1000),
                "status": unit["status"],
            })
    return alerts

@app.get("/api/custom_points")
async def get_custom_points():
    return CUSTOM_POINTS

@app.post("/api/custom_points")
async def add_custom_point(point: CustomPointModel):
    CUSTOM_POINTS.append(point.model_dump())
    save_custom_points(CUSTOM_POINTS)
    return {"ok": True}

@app.delete("/api/custom_points/{point_id}")
async def delete_custom_point(point_id: str):
    global CUSTOM_POINTS
    CUSTOM_POINTS = [p for p in CUSTOM_POINTS if p["id"] != point_id]
    save_custom_points(CUSTOM_POINTS)
    return {"ok": True}


# ---------------------------------------------------------------------------
# RAG — ChromaDB + Ollama
# ---------------------------------------------------------------------------
RAG_CHROMA_DIR  = Path(__file__).parent / "chroma"
RAG_COLLECTION  = "steelsentinel"
RAG_OLLAMA_URL  = "http://localhost:11434"
RAG_EMBED_MODEL = "bge-m3"
RAG_GEN_MODEL   = "SpeakLeash/bielik-minitron-7B-v3.0-instruct:Q4_K_M"

_TECH_DOC_PATH = Path(__file__).parent.parent / "docs" / "technologie-obronne.md"
TECH_DOC = _TECH_DOC_PATH.read_text(encoding="utf-8") if _TECH_DOC_PATH.exists() else ""

_chroma_client = None
_chroma_lock   = asyncio.Lock()


async def _get_chroma_collection():
    global _chroma_client
    if _chroma_client is None:
        async with _chroma_lock:
            if _chroma_client is None:
                import chromadb
                _chroma_client = chromadb.PersistentClient(path=str(RAG_CHROMA_DIR))
    return _chroma_client.get_collection(RAG_COLLECTION)


class ThreatScenarioRequest(BaseModel):
    threat_type: str = "drone"   # drone | missile | sabotage | cyber | chemical


class RagQuery(BaseModel):
    question: str
    n_results: int = 8


@app.get("/api/rag/documents")
async def list_rag_documents():
    if not RAG_CHROMA_DIR.exists():
        return {"error": "RAG index not built yet. Run: uv run python build_rag.py", "documents": []}
    try:
        col     = await _get_chroma_collection()
        result  = col.get(include=["metadatas"])
        sources: dict[str, dict] = {}
        metadatas = result.get("metadatas") or []
        for meta in metadatas:
            if not meta:
                continue
            src = str(meta.get("source", "unknown"))
            if src not in sources:
                sources[src] = {
                    "source":      src,
                    "type":        meta.get("type", "unknown"),
                    "chunk_count": 0,
                }
            sources[src]["chunk_count"] += 1
        docs = sorted(sources.values(), key=lambda x: (x["type"] != "document", x["source"]))
        return {"documents": docs}
    except Exception as e:
        return {"error": str(e), "documents": []}


@app.post("/api/rag/query")
async def query_rag(req: RagQuery):
    if not RAG_CHROMA_DIR.exists():
        return {"error": "RAG index not built yet.", "answer": "", "chunks": []}
    try:
        async with httpx.AsyncClient() as http:
            embed_resp = await http.post(
                f"{RAG_OLLAMA_URL}/api/embed",
                json={"model": RAG_EMBED_MODEL, "input": req.question},
                timeout=30,
            )
            embed_resp.raise_for_status()
            embedding = embed_resp.json()["embeddings"][0]

        col     = await _get_chroma_collection()
        results = col.query(
            query_embeddings=[embedding],
            n_results=req.n_results,
            include=["documents", "metadatas", "distances"],
        )

        docs_list = results.get("documents") or []
        metas_list = results.get("metadatas") or []
        dists_list = results.get("distances") or []

        chunks = [
            {
                "text":     doc,
                "metadata": meta,
                "score":    round(1.0 - float(dist) / 2, 4) if dist is not None else 0.0,
            }
            for doc, meta, dist in zip(
                docs_list[0] if docs_list else [],
                metas_list[0] if metas_list else [],
                dists_list[0] if dists_list else [],
            )
        ]

        context = "\n\n---\n\n".join(
            f"[{c['metadata'].get('source','?')}]: {c['text']}" for c in chunks
        )
        prompt  = (
            "Jesteś oficerem zarządzania kryzysowego. Odpowiadaj zwięźle i precyzyjnie "
            "na podstawie dostarczonego kontekstu. Cytuj źródło gdy to możliwe.\n\n"
            f"KONTEKST:\n{context}\n\n"
            f"PYTANIE: {req.question}\n\n"
            "ODPOWIEDŹ:"
        )

        answer = ""
        try:
            async with httpx.AsyncClient() as http:
                gen_resp = await http.post(
                    f"{RAG_OLLAMA_URL}/api/generate",
                    json={"model": RAG_GEN_MODEL, "prompt": prompt, "stream": False},
                    timeout=120,
                )
                if gen_resp.status_code == 200:
                    answer = gen_resp.json().get("response", "")
        except Exception:
            pass  # Return chunks even if generation fails

        return {"answer": answer, "chunks": chunks}
    except Exception as e:
        return {"error": str(e), "answer": "", "chunks": []}


# ---------------------------------------------------------------------------
# RAG — upload i inkrementalne indeksowanie
# ---------------------------------------------------------------------------
DOCS_DIR          = Path(__file__).parent.parent / "docs"
_RAG_CHUNK_SIZE   = 800
_RAG_CHUNK_OVERLAP = 150

_indexing_state: dict = {
    "running": False, "filename": "", "done": 0, "total": 0, "error": ""
}


def _rag_clean(text: str) -> str:
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _rag_split(text: str) -> list[str]:
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + _RAG_CHUNK_SIZE
        if end >= len(text):
            chunk = text[start:]
        else:
            for sep in ("\n\n", ". ", "? ", "! ", "\n", " "):
                pos = text.rfind(sep, start + _RAG_CHUNK_SIZE // 2, end)
                if pos > start + _RAG_CHUNK_SIZE // 2:
                    end = pos + len(sep)
                    break
            chunk = text[start:end]
        chunk = chunk.strip()
        if len(chunk) >= 60:
            chunks.append(chunk)
        start = end - _RAG_CHUNK_OVERLAP
        if start >= len(text):
            break
    return chunks


def _rag_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def _parse_upload(filepath: Path) -> list[dict]:
    chunks: list[dict] = []
    slug = _rag_slug(filepath.stem)

    if filepath.suffix.lower() == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(str(filepath))
        chunk_idx = 0
        for page_num, page in enumerate(reader.pages, start=1):
            text = _rag_clean(page.extract_text() or "")
            if not text:
                continue
            for chunk in _rag_split(text):
                chunks.append({
                    "id": f"doc_{slug}_{page_num}_{chunk_idx}",
                    "text": chunk,
                    "metadata": {"source": filepath.name, "page": page_num,
                                 "chunk_idx": chunk_idx, "type": "document"},
                })
                chunk_idx += 1

    elif filepath.suffix.lower() == ".md":
        text = _rag_clean(filepath.read_text(encoding="utf-8"))
        for chunk_idx, chunk in enumerate(_rag_split(text)):
            chunks.append({
                "id": f"doc_{slug}_0_{chunk_idx}",
                "text": chunk,
                "metadata": {"source": filepath.name, "page": 0,
                             "chunk_idx": chunk_idx, "type": "document"},
            })

    return chunks


async def _index_document_bg(filepath: Path, filename: str) -> None:
    global _indexing_state
    try:
        chunks = _parse_upload(filepath)
        _indexing_state.update({"total": len(chunks), "done": 0})

        col = await _get_chroma_collection()
        async with httpx.AsyncClient() as http:
            for i, chunk in enumerate(chunks):
                resp = await http.post(
                    f"{RAG_OLLAMA_URL}/api/embed",
                    json={"model": RAG_EMBED_MODEL, "input": chunk["text"]},
                    timeout=60,
                )
                resp.raise_for_status()
                col.upsert(
                    ids=[chunk["id"]],
                    documents=[chunk["text"]],
                    embeddings=[resp.json()["embeddings"][0]],
                    metadatas=[chunk["metadata"]],
                )
                _indexing_state["done"] = i + 1

        _indexing_state["running"] = False
    except Exception as e:
        _indexing_state.update({"running": False, "error": str(e)})


@app.get("/api/rag/status")
async def rag_status():
    return _indexing_state


# ---------------------------------------------------------------------------
# Satelitarne kafelki — pobieranie offline i serwowanie
# ---------------------------------------------------------------------------

SATELLITE_TILES_DIR = Path(__file__).parent / "satellite_tiles" / "s2"

# Stalowa Wola + bufor ~8 km
_SAT_BBOX = {"lat_min": 50.49, "lat_max": 50.67, "lng_min": 21.91, "lng_max": 22.24}
_SAT_ZOOM_DEFAULT = (10, 17)

# ---------------------------------------------------------------------------
# Sentinel Hub (CDSE) — OAuth2 token cache + Process API
# ---------------------------------------------------------------------------
_SH_CLIENT_ID     = os.getenv("SH_CLIENT_ID", "")
_SH_CLIENT_SECRET = os.getenv("SH_CLIENT_SECRET", "")
_SH_TOKEN_URL     = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
_SH_PROCESS_URL   = "https://sh.dataspace.copernicus.eu/api/v1/process"

_sh_token: dict = {"access_token": "", "expires_at": 0.0}
_sh_token_lock = asyncio.Lock()

_SH_EVALSCRIPT = """
//VERSION=3
function setup() {
  return { input: ["B04","B03","B02"], output: { bands: 3 } };
}
function evaluatePixel(s) {
  return [3.5*s.B04, 3.5*s.B03, 3.5*s.B02];
}
"""


async def _sh_get_token() -> str:
    async with _sh_token_lock:
        if time.time() < _sh_token["expires_at"] - 30:
            return _sh_token["access_token"]
        async with httpx.AsyncClient(timeout=15) as http:
            r = await http.post(_SH_TOKEN_URL, data={
                "grant_type": "client_credentials",
                "client_id": _SH_CLIENT_ID,
                "client_secret": _SH_CLIENT_SECRET,
            })
            r.raise_for_status()
            data = r.json()
            _sh_token["access_token"] = data["access_token"]
            _sh_token["expires_at"] = time.time() + data.get("expires_in", 600)
            return _sh_token["access_token"]


def _tile_to_bbox(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """Returns (lng_min, lat_min, lng_max, lat_max) in WGS84."""
    n = 2 ** z
    lng_min = x / n * 360.0 - 180.0
    lng_max = (x + 1) / n * 360.0 - 180.0
    lat_max = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    lat_min = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return lng_min, lat_min, lng_max, lat_max


async def _fetch_sentinel_tile(z: int, x: int, y: int) -> bytes | None:
    if not _SH_CLIENT_ID or not _SH_CLIENT_SECRET:
        return None
    try:
        token = await _sh_get_token()
        lng_min, lat_min, lng_max, lat_max = _tile_to_bbox(z, x, y)
        payload = {
            "input": {
                "bounds": {
                    "bbox": [lng_min, lat_min, lng_max, lat_max],
                    "properties": {"crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"},
                },
                "data": [{
                    "type": "sentinel-2-l2a",
                    "dataFilter": {"mosaickingOrder": "leastCC"},
                }],
            },
            "output": {
                "width": 256, "height": 256,
                "responses": [{"identifier": "default", "format": {"type": "image/jpeg", "quality": 85}}],
            },
            "evalscript": _SH_EVALSCRIPT,
        }
        async with httpx.AsyncClient(timeout=20) as http:
            r = await http.post(
                _SH_PROCESS_URL,
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
            )
            if r.status_code == 200:
                return r.content
    except Exception:
        pass
    return None

_satellite_state: dict = {"running": False, "total": 0, "done": 0, "errors": 0}


def _deg2tile(lat: float, lon: float, zoom: int) -> tuple[int, int]:
    n = 2 ** zoom
    x = int((lon + 180) / 360 * n)
    lat_r = math.radians(lat)
    y = int((1 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2 * n)
    return x, max(0, min(n - 1, y))


async def _download_satellite_bg(zoom_min: int, zoom_max: int, force: bool) -> None:
    global _satellite_state
    SATELLITE_TILES_DIR.mkdir(parents=True, exist_ok=True)

    tiles: list[tuple[int, int, int]] = []
    bb = _SAT_BBOX
    for z in range(zoom_min, zoom_max + 1):
        n = 2 ** z
        x_min, y_north = _deg2tile(bb["lat_max"], bb["lng_min"], z)
        x_max, y_south = _deg2tile(bb["lat_min"], bb["lng_max"], z)
        x_min = max(0, x_min); x_max = min(n - 1, x_max)
        for x in range(x_min, x_max + 1):
            for y in range(y_north, y_south + 1):
                tiles.append((z, x, y))

    _satellite_state.update({"total": len(tiles), "done": 0, "errors": 0})
    sem = asyncio.Semaphore(6)

    async def fetch_one(z: int, x: int, y: int) -> None:
        path = SATELLITE_TILES_DIR / str(z) / str(x) / f"{y}.jpg"
        if not force and path.exists():
            _satellite_state["done"] += 1
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        async with sem:
            try:
                data = await _fetch_sentinel_tile(z, x, y)
                if data:
                    path.write_bytes(data)
                else:
                    _satellite_state["errors"] += 1
            except Exception:
                _satellite_state["errors"] += 1
        _satellite_state["done"] += 1

    await asyncio.gather(*[fetch_one(z, x, y) for z, x, y in tiles])

    _satellite_state["running"] = False


@app.get("/api/tiles/satellite/status")
async def satellite_status():
    tile_count = sum(1 for _ in SATELLITE_TILES_DIR.rglob("*.jpg")) if SATELLITE_TILES_DIR.exists() else 0
    return {
        **_satellite_state,
        "tile_count": tile_count,
        "available": tile_count > 0,
        "sentinel_configured": bool(_SH_CLIENT_ID and _SH_CLIENT_SECRET),
    }


@app.post("/api/tiles/satellite/start")
async def satellite_start(
    background_tasks: BackgroundTasks,
    zoom_min: int = _SAT_ZOOM_DEFAULT[0],
    zoom_max: int = _SAT_ZOOM_DEFAULT[1],
    force: bool = False,
):
    if _satellite_state["running"]:
        return {"error": "Pobieranie już trwa"}
    _satellite_state.update({"running": True, "total": 0, "done": 0, "errors": 0})
    background_tasks.add_task(_download_satellite_bg, zoom_min, zoom_max, force)
    return {"ok": True}


async def _serve_tile(path: Path, data: bytes) -> FileResponse:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return FileResponse(str(path), media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=86400"})


@app.get("/satellite/{z}/{x}/{y}.jpg")
async def get_satellite_tile(z: int, x: int, y: int):
    path = SATELLITE_TILES_DIR / str(z) / str(x) / f"{y}.jpg"

    if path.exists():
        return FileResponse(str(path), media_type="image/jpeg",
                            headers={"Cache-Control": "public, max-age=86400"})

    data = await _fetch_sentinel_tile(z, x, y)
    if data:
        return await _serve_tile(path, data)

    return JSONResponse(status_code=404, content={"error": "Tile not available"})


# ---------------------------------------------------------------------------
# Infrastruktura krytyczna — endpointy
# ---------------------------------------------------------------------------

@app.get("/api/critical-infrastructure")
async def get_critical_infrastructure():
    return INFRASTRUCTURE


@app.post("/api/impact/{object_id}")
async def impact_analysis(object_id: str):
    result = analyze_impact(object_id)
    if result is None:
        return JSONResponse(status_code=404, content={"error": f"Obiekt '{object_id}' nie istnieje w grafie"})
    return result


@app.post("/api/threat-scenario/{object_id}")
async def threat_scenario(object_id: str, body: Optional[ThreatScenarioRequest] = None):
    if object_id not in INFRASTRUCTURE:
        return JSONResponse(status_code=404, content={"error": f"Obiekt '{object_id}' nie istnieje w grafie"})

    obj = INFRASTRUCTURE[object_id]
    # Typ zagrożenia — z body lub fallback na pierwszą podatność obiektu
    threat_type = (body.threat_type if body else None) or obj.get("vulnerability", ["drone"])[0]

    impact = analyze_impact(object_id)
    assert impact is not None

    # RAG — zapytanie uwzględnia typ zagrożenia (zgodnie z referencją)
    rag_query = (
        f"procedury ochrony infrastruktury krytycznej {threat_type} atak "
        f"{obj['name']} Stalowa Wola"
    )

    context_chunks: list[str] = []
    rag_sources: list[str] = []
    try:
        if RAG_CHROMA_DIR.exists():
            async with httpx.AsyncClient() as http:
                embed_resp = await http.post(
                    f"{RAG_OLLAMA_URL}/api/embed",
                    json={"model": RAG_EMBED_MODEL, "input": rag_query},
                    timeout=30,
                )
                if embed_resp.status_code == 200:
                    embedding = embed_resp.json()["embeddings"][0]
                    col = await _get_chroma_collection()
                    results = col.query(
                        query_embeddings=[embedding],
                        n_results=5,
                        include=["documents", "metadatas"],
                    )
                    context_chunks = (results.get("documents") or [[]])[0]
                    metas = (results.get("metadatas") or [[]])[0]
                    rag_sources = [
                        str(m.get("source", "?")) for m in metas[:3] if m
                    ]
    except Exception:
        pass

    # Buduj opis kaskady z backup_hours i depth per obiekt
    details = impact.get("affected_details", {})

    def _obj_detail(ids: list[str]) -> str:
        parts = []
        for i in ids:
            info = details.get(i, {})
            name = str(INFRASTRUCTURE.get(i, {}).get("name", i))
            backup = info.get("backup_hours", 0)
            depth = info.get("depth", 1)
            dep_label = "bezpośrednia" if depth == 1 else f"kaskada (głęb.{depth})"
            parts.append(f"{name} [rezerwa: {backup}h, zależność: {dep_label}]")
        return "\n  ".join(parts) if parts else "brak"

    cascade_txt = ""
    if impact["immediate"]:
        cascade_txt += f"\nNATYCHMIASTOWA AWARIA (0h):\n  {_obj_detail(impact['immediate'])}"
    if impact["cascade_4h"]:
        cascade_txt += f"\nAWARIA W CIĄGU 4H:\n  {_obj_detail(impact['cascade_4h'])}"
    if impact["cascade_8h"]:
        cascade_txt += f"\nAWARIA W CIĄGU 8H:\n  {_obj_detail(impact['cascade_8h'])}"
    if impact["cascade_t3"]:
        cascade_txt += f"\nODPORNE >8H (tracą źródło zasilania):\n  {_obj_detail(impact['cascade_t3'])}"
    if not cascade_txt:
        cascade_txt = "\nBrak kaskady zależności."

    vuln_txt    = ", ".join(obj.get("vulnerability", []))
    defense_txt = ", ".join(obj.get("defense", [])) or "brak danych"
    context_text = (
        "\n\n---\n\n".join(context_chunks[:5])
        if context_chunks
        else "Brak kontekstu z bazy wiedzy."
    )

    # Zasoby ochrony dotkniętych obiektów
    def _defense_summary(ids: list[str]) -> str:
        lines = []
        for i in ids:
            o = INFRASTRUCTURE.get(i)
            if o and o.get("defense"):
                d = ", ".join(o["defense"])
                lines.append(f"  - {o['name']}: {d}")
        return "\n".join(lines) if lines else "  brak danych"

    all_affected = impact["immediate"] + impact["cascade_4h"] + impact["cascade_8h"] + impact["cascade_t3"]
    affected_defense = _defense_summary(all_affected)

    nearest_unit = min(
        (u for u in UNITS if u["role"] != "command"),
        key=lambda u: (u["lat"] - obj["lat"]) ** 2 + (u["lng"] - obj["lng"]) ** 2,
    )

    system_prompt = (
        "Jesteś systemem analizy zagrożeń infrastruktury krytycznej. "
        "Łączysz dane techniczne z procedurami operacyjnymi. "
        "Odpowiadaj zwięźle i operacyjnie."
    )

    prompt = f"""Analizujesz skutki ataku na infrastrukturę krytyczną Stalowej Woli. Odpowiadaj WYŁĄCZNIE po polsku.

KONTEKST Z BAZY WIEDZY:
{context_text}

ZAATAKOWANY OBIEKT:
Nazwa: {obj['name']}
Typ: {obj['type']}
Krytyczność: {obj['criticality']}/5
Typ zagrożenia: {threat_type}
Podatności: {vuln_txt}
Aktualna ochrona: {defense_txt}
Współrzędne: {obj['lat']:.4f}°N, {obj['lng']:.4f}°E

ANALIZA KASKADY AWARII (ocena: {impact['severity']}):
{cascade_txt}
Łącznie dotkniętych: {impact['total_affected']} obiektów
Obiekty krytyczne (kryt.≥4) dotknięte atakiem: {impact['critical_affected']}

OCHRONA DOTKNIĘTYCH OBIEKTÓW:
{affected_defense}

NAJBLIŻSZA JEDNOSTKA: {nearest_unit['name']} (rola: {nearest_unit['role']})

Odpowiedz WYŁĄCZNIE w trzech sekcjach:

## SCENARIUSZ ZAGROŻENIA
Opisz realistyczny przebieg ataku typu {threat_type} i bezpośrednie skutki dla mieszkańców (3-5 zdań). Uwzględnij istniejącą ochronę i czas działania rezerw.

## REKOMENDACJE
Odpowiedz na pytania operacyjne (każde działanie zaczynając od "- "):
- Jakie są natychmiastowe priorytety działania?
- Które obiekty wymagają ewakuacji lub wsparcia?
- Jakie zasoby uruchomić w pierwszej kolejności?
- Jak długo system może działać bez interwencji?

## ROZKAZ OPERACYJNY
Sformułuj krótki rozkaz (2-3 zdania) dla jednostki {nearest_unit['name']}.

## TECHNOLOGIE OCHRONNE
Na podstawie dokumentu poniżej wymień 2-3 konkretne systemy które zmniejszyłyby zagrożenie {threat_type} dla {obj['name']}.
Format każdego systemu w osobnej linii zaczynającej się od "- ": nazwa i krótkie uzasadnienie (1 zdanie).

DOKUMENT TECH-OBR-2026:
{TECH_DOC}

ODPOWIEDŹ:"""

    answer = ""
    try:
        async with httpx.AsyncClient() as http:
            gen_resp = await http.post(
                f"{RAG_OLLAMA_URL}/api/generate",
                json={
                    "model":  RAG_GEN_MODEL,
                    "prompt": prompt,
                    "system": system_prompt,
                    "stream": False,
                },
                timeout=120,
            )
            if gen_resp.status_code == 200:
                answer = gen_resp.json().get("response", "")
    except Exception as e:
        answer = f"[Błąd generowania odpowiedzi: {e}]"

    # Parsuj sekcje z odpowiedzi
    scenario = ""
    recommendations: list[str] = []
    order = ""
    protection_recommended: list[str] = []

    if "## SCENARIUSZ" in answer or "## REKO" in answer or "## ROZKAZ" in answer:
        for part in answer.split("##"):
            part = part.strip()
            if part.upper().startswith("SCENARIUSZ"):
                scenario = part.split("\n", 1)[-1].strip()
            elif part.upper().startswith("REKOMENDACJE"):
                rec_block = part.split("\n", 1)[-1].strip()
                recommendations = [
                    r.lstrip("- ").strip()
                    for r in rec_block.splitlines()
                    if r.strip().startswith("-")
                ]
            elif part.upper().startswith("ROZKAZ"):
                order = part.split("\n", 1)[-1].strip()
            elif part.upper().startswith("TECHNOLOGIE"):
                tech_block = part.split("\n", 1)[-1].strip()
                protection_recommended = [
                    r.lstrip("- ").strip()
                    for r in tech_block.splitlines()
                    if r.strip().startswith("-")
                ]

    if not scenario:
        scenario = answer  # fallback

    # Zapisz rekomendowane technologie w grafie (persist na czas sesji)
    if protection_recommended:
        INFRASTRUCTURE[object_id]["protection_recommended"] = protection_recommended

    return {
        "object_id":              object_id,
        "object_name":            obj["name"],
        "threat_type":            threat_type,
        "impact":                 impact,
        "scenario":               scenario,
        "recommendations":        recommendations,
        "order":                  order,
        "raw_response":           answer,
        "rag_chunks_used":        len(context_chunks),
        "rag_sources":            rag_sources,
        "protection_recommended": protection_recommended,
    }


@app.post("/api/rag/upload")
async def upload_document(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if _indexing_state["running"]:
        return {"error": "Indeksowanie w toku, poczekaj na zakończenie"}

    safe_filename = file.filename or "upload"
    suffix = Path(safe_filename).suffix.lower()
    if suffix not in (".pdf", ".md"):
        return {"error": "Obsługiwane formaty: PDF i Markdown (.md)"}

    DOCS_DIR.mkdir(exist_ok=True)
    filepath = DOCS_DIR / safe_filename
    filepath.write_bytes(await file.read())

    _indexing_state.update({
        "running": True, "filename": safe_filename,
        "done": 0, "total": 0, "error": "",
    })
    background_tasks.add_task(_index_document_bg, filepath, safe_filename)
    return {"ok": True, "filename": safe_filename}
