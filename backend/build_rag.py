"""
build_rag.py
============
Buduje indeks RAG (ChromaDB) na podstawie:
  - infrastructure.json  — obiekty infrastruktury krytycznej z OSM
  - dependencies.json    — graf zależności (linie energetyczne, stacje, wodociągi)
  - ../docs/             — dokumenty PDF i MD (przepisy, plany kryzysowe, NATO)

Wymaga działającego Ollama z modelem nomic-embed-text:
  ollama pull nomic-embed-text

Wynik: ./chroma/  — ChromaDB z kolekcją "steelsentinel"
"""

import json
import re
import time
from pathlib import Path

import httpx
import chromadb
from pypdf import PdfReader

# ---------------------------------------------------------------------------
# Konfiguracja
# ---------------------------------------------------------------------------
OLLAMA_URL      = "http://localhost:11434"
EMBED_MODEL     = "bge-m3"
CHROMA_DIR      = Path(__file__).parent / "chroma"
COLLECTION_NAME = "steelsentinel"
INFRA_FILE      = Path(__file__).parent / "infrastructure.json"
DEPS_FILE       = Path(__file__).parent / "dependencies.json"
DOCS_DIR        = Path(__file__).parent.parent / "docs"
BATCH_SIZE      = 32    # ilość chunków na jeden upsert do ChromaDB
CHUNK_SIZE      = 800   # znaki na chunk (bge-m3 ma 8192 tokenów kontekstu)
CHUNK_OVERLAP   = 150   # znaki nakładania między chunkami

CATEGORY_LABELS: dict[str, str] = {
    "power_plant":     "Elektrownia",
    "substation":      "Stacja transformatorowa",
    "power_line":      "Linia energetyczna",
    "water_works":     "Ujęcie wody / SUW",
    "pumping_station": "Przepompownia wody",
    "water_tower":     "Wieżyczka ciśnień",
    "reservoir":       "Zbiornik wody",
    "water_pipe":      "Rurociąg ciśnieniowy",
    "hospital":        "Szpital",
    "fire_station":    "Straż pożarna",
    "police":          "Policja",
    "industrial":      "Strefa przemysłowa",
    "railway":         "Kolej",
    "waterway":        "Droga wodna",
    "highway":         "Droga",
    "building":        "Budynek publiczny",
    "bridge":          "Most / wiadukt",
    "other":           "Obiekt",
}

# Kategorie pomijane — reprezentowane przez linie/polilinie, nie punkty
_SKIP_CATEGORIES = {"highway", "railway", "power_line", "waterway", "water_pipe"}

# Typy dróg bez znaczenia strategicznego — kładki, ścieżki, szlaki
_SKIP_BRIDGE_HW = {"footway", "path", "cycleway", "track", "steps", "proposed", "construction", "pedestrian"}

def _bridge_importance(tags: dict) -> str:
    """Zwraca opis strategicznego znaczenia mostu na podstawie klasy drogi."""
    hw  = tags.get("highway", "")
    ref = tags.get("ref", "")

    if hw in ("motorway", "motorway_link", "trunk", "trunk_link"):
        cls = "Autostrada / droga ekspresowa"
        lvl = "NAJWYŻSZE znaczenie strategiczne"
    elif hw == "primary":
        ref_txt = f"drogi krajowej {ref}" if ref else "drogi krajowej"
        cls = f"Droga krajowa ({ref_txt})"
        lvl = "KLUCZOWA przeprawa — jedyna lub główna trasa przelotowa przez tę przeszkodę"
    elif hw == "secondary":
        ref_txt = f" {ref}" if ref else ""
        cls = f"Droga wojewódzka{ref_txt}"
        lvl = "Ważna przeprawa regionalna"
    elif hw in ("tertiary", "unclassified", "residential", "service"):
        cls = "Droga lokalna"
        lvl = "Przeprawa lokalna — ograniczone znaczenie strategiczne"
    elif hw == "":
        cls = "Przeprawa drogowa"
        lvl = "Znaczenie strategiczne nieznane (brak klasyfikacji drogi)"
    else:
        cls = f"Droga ({hw})"
        lvl = "Przeprawa o niskim znaczeniu strategicznym"

    sentence = f"Klasyfikacja: {cls}. {lvl}."
    if ref and hw == "primary":
        sentence += f" Zniszczenie odcina ruch na trasie {ref}."
    return sentence


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _classify(tags: dict) -> str:
    if tags.get("power") == "plant":                    return "power_plant"
    if tags.get("power") == "substation":               return "substation"
    if tags.get("power") == "line":                     return "power_line"
    if tags.get("man_made") == "water_works":           return "water_works"
    if tags.get("man_made") == "pumping_station":       return "pumping_station"
    if tags.get("man_made") == "water_tower":           return "water_tower"
    if tags.get("man_made") in ("reservoir_covered",):  return "reservoir"
    if tags.get("man_made") == "bridge":                return "bridge"
    if tags.get("landuse") == "reservoir":              return "reservoir"
    if tags.get("amenity") == "hospital":               return "hospital"
    if tags.get("amenity") == "fire_station":           return "fire_station"
    if tags.get("amenity") == "police":                 return "police"
    if tags.get("amenity") in ("school", "university", "college", "town_hall"): return "building"
    if tags.get("office") == "government":              return "building"
    if tags.get("building") in ("government", "civic"): return "building"
    if tags.get("landuse") == "industrial":             return "industrial"
    if tags.get("bridge") == "yes" and (tags.get("highway") or tags.get("railway")): return "bridge"
    if tags.get("railway"):                             return "railway"
    if tags.get("man_made") == "pipeline":              return "water_pipe"
    if tags.get("waterway"):                            return "waterway"
    if tags.get("highway"):                             return "highway"
    return "other"


def _coords(el: dict) -> tuple[float, float] | None:
    if "lat" in el and "lon" in el:
        return el["lat"], el["lon"]
    if "center" in el:
        return el["center"]["lat"], el["center"]["lon"]
    return None


def _embed(texts: list[str], client: httpx.Client) -> list[list[float]]:
    # bge-m3: /api/embed z batch input, 8192 tokenów kontekstu
    resp = client.post(
        f"{OLLAMA_URL}/api/embed",
        json={"model": EMBED_MODEL, "input": texts},
        timeout=120,
    )
    if not resp.is_success:
        print(f"\n  Embed error {resp.status_code}: {resp.text[:200]}")
    resp.raise_for_status()
    return resp.json()["embeddings"]


# ---------------------------------------------------------------------------
# Budowanie chunków
# ---------------------------------------------------------------------------
def _infra_chunks(elements: list[dict]) -> list[dict]:
    """Jeden chunk per obiekt infrastruktury (punkt na mapie)."""
    chunks = []
    relevant_keys = [
        "name", "amenity", "power", "man_made", "operator",
        "addr:street", "addr:city", "phone", "emergency",
        "capacity", "beds", "voltage", "frequency", "landuse",
        "highway", "ref", "waterway", "water", "bridge",
    ]

    for el in elements:
        tags  = el.get("tags", {})
        coords = _coords(el)
        if not coords:
            continue

        category = _classify(tags)
        if category in _SKIP_CATEGORIES:
            continue

        # Pomiń mosty o zerowym znaczeniu strategicznym (kładki, ścieżki, szlaki)
        if category == "bridge" and tags.get("highway", "") in _SKIP_BRIDGE_HW:
            continue

        lat, lon = coords

        # Czytelna nazwa: własna > ref drogi > krótkie współrzędne
        name_tag = tags.get("name", "").strip()
        ref_tag  = tags.get("ref",  "").strip()
        if name_tag:
            name = name_tag
        elif category == "bridge" and ref_tag:
            name = f"Most {ref_tag}"
        elif category == "bridge":
            name = f"Most ({lat:.4f}°N, {lon:.4f}°E)"
        else:
            name = name_tag or CATEGORY_LABELS.get(category, "Obiekt")

        tag_lines = [f"{k}: {tags[k]}" for k in relevant_keys if k in tags]

        text = (
            f"{CATEGORY_LABELS.get(category, 'Obiekt')}: {name}\n"
            f"ID OSM: {el['id']}\n"
            f"Lokalizacja: {lat:.5f}°N, {lon:.5f}°E\n"
        )
        if tag_lines:
            text += "Szczegóły:\n  " + "\n  ".join(tag_lines) + "\n"

        # Dla mostów: zróżnicowane znaczenie strategiczne + klasa drogi
        if category == "bridge":
            text += _bridge_importance(tags) + "\n"
            text += "Zniszczenie lub zablokowanie tej przeprawy odcina ruch i dostęp do obszarów po drugiej stronie.\n"

        chunks.append({
            "id":       f"infra_{el['id']}",
            "text":     text,
            "metadata": {
                "source":   "infrastructure.json",
                "category": category,
                "name":     name,
                "lat":      lat,
                "lon":      lon,
                "osm_id":   el["id"],
            },
        })

    return chunks


def _dep_chunks(graph: dict) -> list[dict]:
    """Chunki z grafu zależności — linie, stacje, wodociągi, obiekty krytyczne."""
    chunks = []

    fac_by_id = {f["facility_id"]: f for f in graph.get("facility_deps", [])}
    sub_by_id = {s["substation_id"]: s for s in graph.get("substation_zones", [])}
    water_list = graph.get("water_zones", [])

    # Linie energetyczne
    for line in graph.get("power_chains", []):
        subs = [sub_by_id[sid]["name"] for sid in line["feeds_substations"] if sid in sub_by_id]
        facs = [fac_by_id[fid]["name"] for fid in line["feeds_facilities"] if fid in fac_by_id]

        text = (
            f"Linia energetyczna {line['voltage_label']}"
            f"{(' \"' + line['name'] + '\"') if line['name'] else ''}"
            f" (id: {line['line_id']})\n"
        )
        if line.get("operator"):
            text += f"Operator: {line['operator']}\n"
        if subs:
            text += f"Zasila stacje transformatorowe: {', '.join(subs)}\n"
        if facs:
            text += f"Zasila obiekty krytyczne ({len(facs)}): {', '.join(facs)}\n"
            text += f"Uszkodzenie tej linii odcina {len(facs)} obiektów krytycznych.\n"
        else:
            text += "Brak bezpośrednio zasilanych obiektów krytycznych w zasięgu.\n"

        chunks.append({
            "id":       f"line_{line['line_id']}",
            "text":     text,
            "metadata": {"source": "dependencies.json", "type": "power_line",
                         "line_id": line["line_id"]},
        })

    # Stacje transformatorowe
    for sub in graph.get("substation_zones", []):
        facs = [fac_by_id[fid]["name"] for fid in sub["powers_facilities"] if fid in fac_by_id]

        text = (
            f"Stacja transformatorowa: {sub['name']} (id: {sub['substation_id']})\n"
            f"Lokalizacja: {sub['lat']:.5f}°N, {sub['lon']:.5f}°E\n"
        )
        if sub.get("voltage"):
            text += f"Napięcie: {sub['voltage']} V\n"
        if facs:
            text += f"Zasila obiekty krytyczne ({len(facs)}): {', '.join(facs)}\n"
        else:
            text += "Brak przypisanych obiektów krytycznych w zasięgu.\n"

        chunks.append({
            "id":       f"sub_{sub['substation_id']}",
            "text":     text,
            "metadata": {
                "source":        "dependencies.json",
                "type":          "substation",
                "substation_id": sub["substation_id"],
                "lat":           sub["lat"],
                "lon":           sub["lon"],
            },
        })

    # Strefy zasilania wodą (water_works, pumping_station, water_tower)
    type_labels = {
        "pumping_station": "Przepompownia wody",
        "water_tower":     "Wieżyczka ciśnień",
    }
    for wz in water_list:
        facs = [fac_by_id[fid]["name"] for fid in wz["supplies_facilities"] if fid in fac_by_id]
        label = type_labels.get(wz["type"], "Ujęcie wody / SUW")

        text = (
            f"{label}: {wz['name']} (id: {wz['water_id']})\n"
            f"Typ: {wz['type']}\n"
            f"Lokalizacja: {wz['lat']:.5f}°N, {wz['lon']:.5f}°E\n"
        )
        if facs:
            text += f"Zasila w wodę obiekty krytyczne ({len(facs)}): {', '.join(facs)}\n"
        else:
            text += "Brak przypisanych obiektów krytycznych w zasięgu.\n"

        chunks.append({
            "id":       f"water_{wz['water_id']}",
            "text":     text,
            "metadata": {
                "source":   "dependencies.json",
                "type":     "water_zone",
                "water_id": wz["water_id"],
                "lat":      wz["lat"],
                "lon":      wz["lon"],
            },
        })

    # Obiekty krytyczne — pełne podsumowanie zależności (najbardziej użyteczne dla LLM)
    for fac in graph.get("facility_deps", []):
        subs = [sub_by_id[sid]["name"] for sid in fac["powered_by_substations"] if sid in sub_by_id]
        waters = [
            wz["name"] for wz in water_list
            if fac["facility_id"] in wz["supplies_facilities"]
        ]

        text = (
            f"Obiekt krytyczny: {fac['name']} (id: {fac['facility_id']})\n"
            f"Kategoria: {fac['category']}\n"
            f"Lokalizacja: {fac['lat']:.5f}°N, {fac['lon']:.5f}°E\n"
        )
        if subs:
            text += f"Zasilanie elektryczne — stacje: {', '.join(subs)}\n"
        else:
            text += "Zasilanie elektryczne: brak przypisanej stacji w grafie.\n"
        if waters:
            text += f"Zasilanie w wodę: {', '.join(waters)}\n"
        else:
            text += "Zasilanie w wodę: brak przypisanego źródła w grafie.\n"

        # Skrótowa ocena podatności
        gaps = []
        if not subs:
            gaps.append("brak redundancji energetycznej")
        if not waters:
            gaps.append("brak zasilania wodnego w danych")
        if gaps:
            text += f"Potencjalne luki: {'; '.join(gaps)}.\n"

        chunks.append({
            "id":       f"fac_{fac['facility_id']}",
            "text":     text,
            "metadata": {
                "source":      "dependencies.json",
                "type":        "facility",
                "facility_id": fac["facility_id"],
                "category":    fac["category"],
                "lat":         fac["lat"],
                "lon":         fac["lon"],
            },
        })

    return chunks


# ---------------------------------------------------------------------------
# Chunking dokumentów (PDF + MD)
# ---------------------------------------------------------------------------
def _clean(text: str) -> str:
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)   # dehyfenacja przez łamanie linii
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _split(text: str) -> list[str]:
    """Sliding-window chunking z próbą cięcia na granicy akapitu lub zdania."""
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        if end >= len(text):
            chunk = text[start:]
        else:
            # Preferuj cięcie na granicy akapitu, potem zdania, potem twarde
            for sep in ("\n\n", ". ", "? ", "! ", "\n", " "):
                pos = text.rfind(sep, start + CHUNK_SIZE // 2, end)
                if pos > start + CHUNK_SIZE // 2:
                    end = pos + len(sep)
                    break
            chunk = text[start:end]

        chunk = chunk.strip()
        if len(chunk) >= 60:
            chunks.append(chunk)
        start = end - CHUNK_OVERLAP
        if start >= len(text):
            break
    return chunks


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def _doc_chunks(docs_dir: Path) -> list[dict]:
    """Parsuje wszystkie PDF i MD w katalogu, zwraca listę chunków."""
    chunks: list[dict] = []

    for path in sorted(docs_dir.iterdir()):
        if path.suffix.lower() == ".pdf":
            try:
                reader = PdfReader(str(path))
            except Exception as e:
                print(f"  POMINIĘTO {path.name}: {e}")
                continue

            slug = _slug(path.stem)
            chunk_idx = 0

            for page_num, page in enumerate(reader.pages, start=1):
                raw = page.extract_text() or ""
                text = _clean(raw)
                if not text:
                    continue

                for chunk in _split(text):
                    chunks.append({
                        "id":       f"doc_{slug}_{page_num}_{chunk_idx}",
                        "text":     chunk,
                        "metadata": {
                            "source":    path.name,
                            "page":      page_num,
                            "chunk_idx": chunk_idx,
                            "type":      "document",
                        },
                    })
                    chunk_idx += 1

        elif path.suffix.lower() == ".md":
            try:
                raw = path.read_text(encoding="utf-8")
            except Exception as e:
                print(f"  POMINIĘTO {path.name}: {e}")
                continue

            slug = _slug(path.stem)
            text = _clean(raw)

            for chunk_idx, chunk in enumerate(_split(text)):
                chunks.append({
                    "id":       f"doc_{slug}_0_{chunk_idx}",
                    "text":     chunk,
                    "metadata": {
                        "source":    path.name,
                        "page":      0,
                        "chunk_idx": chunk_idx,
                        "type":      "document",
                    },
                })

    return chunks


# ---------------------------------------------------------------------------
# Indeksowanie
# ---------------------------------------------------------------------------
def _index(chunks: list[dict], collection: chromadb.Collection, http: httpx.Client) -> None:
    total = len(chunks)
    done  = 0
    for i in range(0, total, BATCH_SIZE):
        batch      = chunks[i : i + BATCH_SIZE]
        embeddings = _embed([c["text"] for c in batch], http)
        collection.upsert(
            ids=[c["id"] for c in batch],
            documents=[c["text"] for c in batch],
            embeddings=embeddings,  # type: ignore
            metadatas=[c["metadata"] for c in batch],
        )
        done += len(batch)
        print(f"  {done}/{total}", end="\r", flush=True)
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def build_rag() -> None:
    print("=== Budowanie indeksu RAG — Steel Sentinel ===\n")

    # Sprawdź Ollama i przetestuj faktyczne embedowanie
    print(f"Sprawdzanie Ollama ({OLLAMA_URL})…")
    try:
        with httpx.Client(timeout=30) as c:
            models = [m["name"] for m in c.get(f"{OLLAMA_URL}/api/tags").json().get("models", [])]
            if not any(EMBED_MODEL in m for m in models):
                print(f"  UWAGA: model {EMBED_MODEL!r} niedostępny.")
                print(f"  Uruchom: ollama pull {EMBED_MODEL}")
                return
            # Test faktycznego embedowania przez nowy endpoint
            test = c.post(f"{OLLAMA_URL}/api/embed",
                          json={"model": EMBED_MODEL, "input": "test"}, timeout=20)
            if not test.is_success:
                print(f"  BŁĄD: embed test zwrócił {test.status_code}: {test.text[:200]}")
                return
            dim = len(test.json()["embeddings"][0])
        print(f"  OK — {EMBED_MODEL!r} gotowy, wymiarowość: {dim}\n")
    except Exception as e:
        print(f"  BŁĄD: {e}\n  Uruchom: ollama serve")
        return

    # Załaduj dane
    print("Ładowanie danych…")
    with open(INFRA_FILE, encoding="utf-8") as f:
        infra_elements = json.load(f)["elements"]
    with open(DEPS_FILE, encoding="utf-8") as f:
        deps = json.load(f)
    print(f"  infrastructure.json: {len(infra_elements)} elementów")
    print(
        f"  dependencies.json:   {len(deps.get('power_chains', []))} linii, "
        f"{len(deps.get('substation_zones', []))} stacji, "
        f"{len(deps.get('water_zones', []))} stref wody, "
        f"{len(deps.get('facility_deps', []))} obiektów krytycznych\n"
    )

    # Buduj chunki
    print("Budowanie chunków tekstowych…")
    infra_ch = _infra_chunks(infra_elements)
    dep_ch   = _dep_chunks(deps)
    doc_ch   = _doc_chunks(DOCS_DIR)
    all_ch   = infra_ch + dep_ch + doc_ch
    print(f"  Infrastruktura:    {len(infra_ch)} chunków")
    print(f"  Graf zależności:   {len(dep_ch)} chunków")
    print(f"  Dokumenty ({len({c['metadata']['source'] for c in doc_ch})} plików): {len(doc_ch)} chunków")
    print(f"  Łącznie:           {len(all_ch)} chunków\n")

    # ChromaDB
    print(f"Inicjalizacja ChromaDB → {CHROMA_DIR}…")
    chroma = chromadb.PersistentClient(path=str(CHROMA_DIR))
    if COLLECTION_NAME in [c.name for c in chroma.list_collections()]:
        chroma.delete_collection(COLLECTION_NAME)
        print(f"  Usunięto starą kolekcję '{COLLECTION_NAME}'")
    collection = chroma.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    print(f"  Kolekcja '{COLLECTION_NAME}' gotowa\n")

    # Indeksuj
    print(f"Indeksowanie (batch={BATCH_SIZE})…")
    t0 = time.time()
    with httpx.Client() as http:
        _index(all_ch, collection, http)

    print(f"\n✓ {collection.count()} dokumentów w {time.time() - t0:.1f}s")
    print(f"  Indeks: {CHROMA_DIR}/")
    print(f"\nAby przetestować zapytanie:")
    print(f"  uv run python -c \"")
    print(f"  import chromadb, httpx")
    print(f"  c = chromadb.PersistentClient('{CHROMA_DIR}')")
    print(f"  col = c.get_collection('{COLLECTION_NAME}')")
    print(f"  q = httpx.post('http://localhost:11434/api/embed', json={{'model': '{EMBED_MODEL}', 'input': ['szpital zasilanie']}}, timeout=30).json()['embeddings'][0]")
    print(f"  r = col.query(query_embeddings=[q], n_results=3, include=['documents','metadatas'])")
    print(f"  [print(d[:120]) for d in r['documents'][0]]\"")


if __name__ == "__main__":
    build_rag()
