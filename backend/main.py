import asyncio
import os
import random
import math
from typing import TypedDict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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
    {"id": "delta",   "name": "Dron Delta",           "lat": STALOWA_WOLA[0] + 0.02,  "lng": STALOWA_WOLA[1],         "status": "active", "role": "recon"},
    {"id": "command", "name": "Punkt Dowodzenia",     "lat": STALOWA_WOLA[0],         "lng": STALOWA_WOLA[1],         "status": "active", "role": "command"},
]


def move_units():
    for unit in UNITS:
        if unit["role"] == "command":
            continue
        speed = 0.0003 if unit["role"] != "recon" else 0.0009
        unit["lat"] += random.uniform(-speed, speed)
        unit["lng"] += random.uniform(-speed, speed)
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
