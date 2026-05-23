import asyncio
import os
import random
import math
import json
from pathlib import Path
from typing import TypedDict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import httpx

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
from fastapi.responses import FileResponse

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

        if random.random() < 0.05:
            unit["status"] = random.choice(["active", "idle", "sos"])


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
RAG_GEN_MODEL   = "bielik"

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


class RagQuery(BaseModel):
    question: str
    n_results: int = 6


@app.get("/api/rag/documents")
async def list_rag_documents():
    if not RAG_CHROMA_DIR.exists():
        return {"error": "RAG index not built yet. Run: uv run python build_rag.py", "documents": []}
    try:
        col     = await _get_chroma_collection()
        result  = col.get(include=["metadatas"])
        sources: dict[str, dict] = {}
        for meta in result["metadatas"]:
            src = meta.get("source", "unknown")
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

        chunks = [
            {
                "text":     doc,
                "metadata": meta,
                "score":    round(1.0 - float(dist) / 2, 4),  # cosine dist ∈ [0,2]
            }
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            )
        ]

        context = "\n\n---\n\n".join(c["text"] for c in chunks)
        prompt  = (
            "Na podstawie poniższego kontekstu odpowiedz zwięźle i precyzyjnie na pytanie operatora.\n\n"
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
