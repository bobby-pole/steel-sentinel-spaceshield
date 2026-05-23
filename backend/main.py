import asyncio
import os
import re
import random
import math
import json
from pathlib import Path
from typing import TypedDict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, BackgroundTasks, File
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
