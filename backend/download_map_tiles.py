"""
Pobieranie kafelków OSM dla Stalowej Woli — zoom 10-18.

Skala zoom:
  10 → dzielnice/powiaty (~40 km/kafelek)
  13 → ulice, dzielnice  (~5 km/kafelek)
  14 → ulice, budynki    (~2.5 km/kafelek)
  15 → pojedyncze budynki (~1.2 km/kafelek)
  16 → bardzo szczegółowo (~600 m/kafelek)
  17 → domy, chodniki     (~300 m/kafelek)

OSM tile policy: max 2 req/s z jednego IP.
Skrypt throttluje do 0.5 req/s żeby nie dostać bana.
Szacowany czas pobierania ~28 500 kafelków: ok. 4 godziny.
"""

import math
import os
import time

import httpx

# Stalowa Wola ± ~15 km
LAT_MIN = 50.45
LAT_MAX = 50.70
LNG_MIN = 21.85
LNG_MAX = 22.25

ZOOM_MIN = 10
ZOOM_MAX = 17

TILES_DIR = "map_tiles"
DELAY = 0.5  # sekundy między requestami (OSM policy: max 2/s)
HEADERS = {"User-Agent": "SteelSentinel/1.0 (hackathon; non-commercial)"}


def lat_lng_to_tile(lat: float, lng: float, zoom: int) -> tuple[int, int]:
    n = 2**zoom
    x = int((lng + 180) / 360 * n)
    y = int(
        (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi)
        / 2
        * n
    )
    return x, y


def count_tiles() -> int:
    total = 0
    for zoom in range(ZOOM_MIN, ZOOM_MAX + 1):
        x_min, y_max = lat_lng_to_tile(LAT_MIN, LNG_MIN, zoom)
        x_max, y_min = lat_lng_to_tile(LAT_MAX, LNG_MAX, zoom)
        total += (x_max - x_min + 1) * (y_max - y_min + 1)
    return total


def download_tiles() -> None:
    total = count_tiles()
    print(f"Kafelki do pobrania: {total} (~{total * 12 // 1024} MB)")
    print(f"Szacowany czas: ~{total * DELAY / 3600:.1f} h\n")

    downloaded = 0
    skipped = 0
    errors = 0

    with httpx.Client(headers=HEADERS, timeout=10) as client:
        for zoom in range(ZOOM_MIN, ZOOM_MAX + 1):
            x_min, y_max = lat_lng_to_tile(LAT_MIN, LNG_MIN, zoom)
            x_max, y_min = lat_lng_to_tile(LAT_MAX, LNG_MAX, zoom)

            zoom_total = (x_max - x_min + 1) * (y_max - y_min + 1)
            zoom_done = 0

            for x in range(x_min, x_max + 1):
                tile_dir = os.path.join(TILES_DIR, str(zoom), str(x))
                os.makedirs(tile_dir, exist_ok=True)

                for y in range(y_min, y_max + 1):
                    filepath = os.path.join(tile_dir, f"{y}.png")
                    zoom_done += 1

                    if os.path.exists(filepath):
                        skipped += 1
                        continue

                    url = f"https://tile.openstreetmap.org/{zoom}/{x}/{y}.png"
                    try:
                        r = client.get(url)
                        if r.status_code == 200:
                            with open(filepath, "wb") as f:
                                f.write(r.content)
                            downloaded += 1
                        else:
                            print(f"  HTTP {r.status_code}: {zoom}/{x}/{y}")
                            errors += 1
                    except Exception as e:
                        print(f"  ERR {zoom}/{x}/{y}: {e}")
                        errors += 1

                    time.sleep(DELAY)

            print(f"zoom {zoom}: {zoom_done}/{zoom_total} kafelków  [pobrane={downloaded} pominięte={skipped} błędy={errors}]")

    print(f"\nGotowe. Pobrane: {downloaded}, pominięte: {skipped}, błędy: {errors}")


if __name__ == "__main__":
    download_tiles()
