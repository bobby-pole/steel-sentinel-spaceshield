import { useState } from "react";
import { MapContainer } from "../containers/MapContainer";
import { DocumentsContainer } from "../containers/DocumentsContainer";

export interface HighlightLocation {
  lat: number;
  lon: number;
  name: string;
  category?: string;
}

export default function App() {
  const [currentView, setCurrentView] = useState<"map" | "documents">("map");
  const [highlightLocation, setHighlightLocation] = useState<HighlightLocation | null>(null);

  const handleShowOnMap = (loc: HighlightLocation) => {
    setHighlightLocation(loc);
    setCurrentView("map");
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{
        padding: "1rem",
        background: "#1e293b",
        borderBottom: "1px solid #334155",
        display: "flex",
        gap: "1rem"
      }}>
        <h1 style={{ margin: 0, fontSize: "1.25rem", marginRight: "auto" }}>Steel Sentinel</h1>
        <button
          onClick={() => setCurrentView("map")}
          style={{
            padding: "0.5rem 1rem",
            background: currentView === "map" ? "#3b82f6" : "#334155",
            color: "white",
            border: "none",
            borderRadius: "0.25rem",
            cursor: "pointer"
          }}
        >
          Mapa
        </button>
        <button
          onClick={() => setCurrentView("documents")}
          style={{
            padding: "0.5rem 1rem",
            background: currentView === "documents" ? "#3b82f6" : "#334155",
            color: "white",
            border: "none",
            borderRadius: "0.25rem",
            cursor: "pointer"
          }}
        >
          Centrum dowodzenia
        </button>
      </header>

      <main style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {currentView === "map"
          ? <MapContainer highlightLocation={highlightLocation} onHighlightConsumed={() => setHighlightLocation(null)} />
          : <DocumentsContainer onShowOnMap={handleShowOnMap} />}
      </main>
    </div>
  );
}
