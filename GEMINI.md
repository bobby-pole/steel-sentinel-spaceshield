# SpaceShield Hackathon Project

## Project Overview
SpaceShield is a map-based dashboard application designed to track and monitor the positions and statuses of various units in real-time, centered around Stalowa Wola, Poland. It uses a modern web stack with a Python backend providing real-time telemetry and a React frontend for visualization.

## Technologies
- **Backend**: Python 3.11+, FastAPI, Uvicorn, WebSockets. Dependency management is handled via `uv` (indicated by `uv.lock` and `pyproject.toml`).
- **Frontend**: React 19, TypeScript, Vite, Leaflet (for interactive maps). Package management via `npm`.

## Architecture
- **Backend (`/backend`)**:
  - Exposes REST endpoints (`/api/units`, `/api/alerts`) for fetching current unit data and proximity alerts.
  - Maintains a WebSocket endpoint (`/ws/map`) that streams randomized unit movement and status updates every second.
  - Can serve static map tiles from the `map_tiles/` directory.
  - Key file: `main.py` contains the core application logic and unit mock data.
- **Frontend (`/frontend`)**:
  - A Vite-powered React application.
  - Connects to the backend WebSocket to display live unit positions on a Leaflet map.
  - Uses modern React patterns with hooks (`useWebSocket.ts`, `useOnlineStatus.ts`, etc.) and structured into components and containers.

## Building and Running

### Backend
Navigate to the `backend` directory. Ensure you have `uv` installed.
```bash
cd backend
# Install dependencies (if not already installed)
uv sync
# Run the FastAPI server in development mode
uv run uvicorn main:app --reload
```
*Note: The server typically runs on `http://localhost:8000`.*

### Frontend
Navigate to the `frontend` directory. Ensure you have Node.js and `npm` installed.
```bash
cd frontend
# Install dependencies
npm install
# Start the Vite development server
npm run dev
```
*Note: The frontend typically runs on `http://localhost:5173`.*

## Development Conventions
- **Frontend**: The project uses TypeScript. Follow standard React Hooks patterns and ensure type safety. Code formatting/linting is enforced via ESLint (`npm run lint`).
- **Backend**: FastAPI with async features. Keep dependencies up-to-date in `pyproject.toml` and use `uv` for management.

## Project Structure Notes
- The `docs/` folder contains a presentation markdown file (`PREZENTACJA.md`), likely for the hackathon pitch.
- Local map tiles seem to be handled by a script (`backend/download_map_tiles.py`) to allow offline capability.