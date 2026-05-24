# Stalowy Strażnik — Steel Sentinel

System analizy zagrożeń i ochrony infrastruktury krytycznej dla Stalowej Woli.  
SpaceShield 2026 · kategoria Defence.

---

## Wymagania systemowe

| Narzędzie | Minimalna wersja | Instalacja |
|-----------|-----------------|------------|
| Python | 3.11+ | [python.org](https://www.python.org/downloads/) |
| uv (Python package manager) | dowolna | `pip install uv` lub [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| Ollama | dowolna | [ollama.com/download](https://ollama.com/download) |

**RAM:** minimum 8 GB (model Bielik 7B zajmuje ~5 GB).  
**Dysk:** ~8 GB wolnego miejsca (modele Ollama).

---

## Krok 1 — Pobierz modele AI (Ollama)

Uruchom Ollama, a następnie pobierz oba modele:

```bash
ollama serve
```

W nowym terminalu:

```bash
# Model generatywny — analiza zagrożeń (4.5 GB, może potrwać kilka minut)
ollama pull SpeakLeash/bielik-minitron-7B-v3.0-instruct:Q4_K_M

# Model embeddingów — wyszukiwanie RAG (1.2 GB)
ollama pull bge-m3
```

> `ollama serve` musi działać w tle przez cały czas pracy aplikacji.

---

## Krok 2 — Backend (FastAPI)

```bash
cd backend

# Instalacja zależności Python
uv sync

# Budowanie bazy wiedzy RAG z dokumentów w docs/
# (indeksuje PDFy, plany kryzysowe, procedury NATO — zajmuje 2-5 minut)
uv run python build_rag.py

# Uruchomienie serwera
uv run uvicorn main:app --reload
```

Backend działa na **http://localhost:8000**.

### Opcjonalnie — mapy satelitarne Sentinel-2

Jeśli posiadasz konto w [Copernicus Data Space Ecosystem](https://dataspace.copernicus.eu/), utwórz plik `backend/.env`:

```
SH_CLIENT_ID=twój-client-id
SH_CLIENT_SECRET=twój-client-secret
```

Bez tego pliku aplikacja działa normalnie — dostępne są mapy OSM i tryb ciemny Carto.

---

## Krok 3 — Frontend (React)

W nowym terminalu:

```bash
cd frontend
npm install
npm run dev
```

Frontend działa na **http://localhost:5173**.

---

## Krok 4 — Otwórz aplikację

Przejdź do **http://localhost:5173** w przeglądarce.

Trzy terminale powinny być aktywne jednocześnie:
- `ollama serve`
- `uv run uvicorn main:app --reload` (w `backend/`)
- `npm run dev` (w `frontend/`)

---

## Funkcje do demonstracji

### Mapa infrastruktury krytycznej
- Kliknij ikonę obiektu (elektrownia, wodociągi, huta) → popup ze szczegółami
- Przycisk **"Symuluj atak"** → wybierz typ zagrożenia (dron, rakieta, sabotaż, cyber, chemiczny)
- AI analizuje kaskadę awarii i zwraca rekomendacje ochronne
- Wyniki widoczne w logu operacyjnym (lewy dolny róg) i na mapie (kolorowe linie zależności)

### Graf zależności energetycznych
- Przełącznik **DEPS** w sidebarze — linie wysokiego napięcia, stacje transformatorowe, odbiorcy
- Najechanie na ikonę energetyczną pokazuje połączenia z zasilanymi obiektami

### Analiza dokumentów (zakładka Centrum Dowodzenia)
- Wyszukiwarka RAG po zaindeksowanych dokumentach operacyjnych:
  - Narodowy Program Ochrony Infrastruktury Krytycznej
  - Procedury C-UAV, procedury Orzeł, ROE 2026 (stworzone na potrzeby projektu)
  - Plan zarządzania kryzysowego Stalowej Woli
  - Dokumenty NATO AJP-3.14
- Upload własnych dokumentów PDF/MD do indeksu

### Warstwy mapy
- `🌑 DARK` — mapa taktyczna Carto (online)
- `🛰 S2` — Sentinel-2 satelita 10m/px przez CDSE (wymaga `.env`)
- `🗺 OSM` — OpenStreetMap

---

## Struktura projektu

```
backend/
  main.py              # Cały backend FastAPI (endpointy, BFS, RAG, AI)
  build_rag.py         # Skrypt budujący indeks ChromaDB z docs/
  infrastructure.json  # Graf 15 obiektów krytycznych Stalowej Woli
  dependencies.json    # Graf zależności energetycznych OSM
  docs → ../docs/      # Dokumenty źródłowe RAG
frontend/
  src/
    App.tsx            # Root — przełączanie widoków, stan globalny
    components/
      LeafletMap.tsx   # Mapa Leaflet (imperatywna, bez react-leaflet)
      DependencyLayer.ts  # Warstwa grafu energetycznego
      ThreatPanel.tsx  # Panel wyników symulacji
      OperationLogOverlay.tsx  # Log operacyjny
    containers/
      MapContainer.tsx  # Logika mapy, obsługa symulacji
      DocumentsContainer.tsx  # Widok RAG
docs/                  # Dokumenty operacyjne (w repo, indeksowane przez RAG)
```
