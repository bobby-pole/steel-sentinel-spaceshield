import httpx
import json

def fetch_critical_infrastructure():
    """
    Overpass API — pobiera obiekty infrastruktury krytycznej
    z OpenStreetMap dla obszaru Stalowej Woli.
    """

    # Bounding box dla Stalowej Woli (south,west,north,east)
    bbox = "50.45,21.85,50.70,22.25"

    # Zapytanie Overpass QL
    # node+way+relation (nwr) żeby nie pominąć dużych obiektów mapowanych jako obszary
    query = f"""
    [out:json][timeout:90];
    (
      nwr["power"="plant"]({bbox});
      nwr["power"="substation"]({bbox});
      nwr["man_made"="water_works"]({bbox});
      nwr["man_made"="pumping_station"]({bbox});
      nwr["man_made"="water_tower"]({bbox});
      nwr["man_made"="reservoir_covered"]({bbox});
      nwr["landuse"="reservoir"]({bbox});
      nwr["amenity"="hospital"]({bbox});
      nwr["amenity"="fire_station"]({bbox});
      nwr["amenity"="police"]({bbox});
      nwr["landuse"="industrial"]({bbox});
      nwr["railway"="station"]({bbox});
      nwr["name"~"HSW|Huta|Stalowa",i]({bbox});
      way["power"="line"]({bbox});
      way["waterway"="river"]({bbox});
      way["waterway"="canal"]({bbox});
      way["man_made"="pipeline"]["substance"="water"]({bbox});
      way["railway"="rail"]({bbox});
      way["highway"="primary"]({bbox});
      nwr["amenity"="school"]({bbox});
      nwr["amenity"="university"]({bbox});
      nwr["amenity"="college"]({bbox});
      nwr["amenity"="town_hall"]({bbox});
      nwr["office"="government"]({bbox});
      nwr["building"="government"]({bbox});
      nwr["building"="civic"]({bbox});
      way["bridge"="yes"]["highway"]({bbox});
      way["bridge"="yes"]["railway"]({bbox});
      nwr["man_made"="bridge"]({bbox});
    );
    out center;
    """

    endpoints = [
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass-api.de/api/interpreter",
    ]

    headers = {
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    resp = None
    for url in endpoints:
        try:
            resp = httpx.post(url, data={"data": query}, headers=headers, timeout=65)
            if resp.status_code == 200:
                break
            print(f"  {url} → HTTP {resp.status_code}, error: {resp.text[:200]}, próba następnego...")
        except Exception as e:
            print(f"  {url} → błąd: {e}, próba następnego...")
            resp = None

    if resp is None or resp.status_code != 200:
        status = resp.status_code if resp is not None else "brak odpowiedzi"
        raise RuntimeError(f"Wszystkie endpointy Overpass niedostępne (ostatni status: {status})")

    data = resp.json()

    if "elements" not in data:
        remark = data.get("remark", "brak odpowiedzi")
        raise RuntimeError(f"Overpass zwróciło błąd: {remark}")

    # Zapisz do pliku — będzie dostępne offline
    with open("infrastructure.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Pobrano {len(data['elements'])} elementów")
    return data

fetch_critical_infrastructure()