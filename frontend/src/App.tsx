import { useState } from "react";
import { MapContainer } from "../containers/MapContainer";
import { DocumentsContainer } from "../containers/DocumentsContainer";
import { OperationLogOverlay } from "./components/OperationLogOverlay";
import type { LogEntry } from "./components/OperationLogOverlay";
import type { CriticalObject } from "./types";

export interface HighlightLocation {
  lat: number;
  lon: number;
  name: string;
  category?: string;
}

export default function App() {
  const [currentView, setCurrentView] = useState<"map" | "documents">("map");
  const [highlightLocation, setHighlightLocation] = useState<HighlightLocation | null>(null);

  // --- Stan logu operacyjnego (persists across views) ---
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [criticalObjects, setCriticalObjects] = useState<Record<string, CriticalObject>>({});

  const pushLog = (entry: Omit<LogEntry, "id" | "time">) => {
    const now = new Date();
    const time = now.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const newEntry = { ...entry, id: `${Date.now()}-${Math.random()}`, time };

    if (entry.type === "result" || entry.type === "error") {
      const resolution: "success" | "error" = entry.type === "result" ? "success" : "error";
      setLogEntries(prev => {
        let marked = false;
        const updated = prev.map(e => {
          if (!marked && e.type === "start" && e.objectName === entry.objectName && !e.resolved) {
            marked = true;
            return { ...e, resolved: resolution };
          }
          return e;
        });
        return [...updated, newEntry];
      });
    } else {
      setLogEntries(prev => [...prev, newEntry]);
    }
  };

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
          ? <MapContainer
              highlightLocation={highlightLocation}
              onHighlightConsumed={() => setHighlightLocation(null)}
              logEntries={logEntries}
              pushLog={pushLog}
              criticalObjects={criticalObjects}
              onCriticalObjectsLoaded={setCriticalObjects}
              onClearLog={() => setLogEntries([])}
            />
          : <DocumentsContainer
              onShowOnMap={handleShowOnMap}
              logEntries={logEntries}
              criticalObjects={criticalObjects}
              onClearLog={() => setLogEntries([])}
            />}
      </main>

      {/* Operation Log — pływające okno, tylko na widoku mapy */}
      {currentView === "map" && (
        <OperationLogOverlay
          entries={logEntries}
          criticalObjects={criticalObjects}
          onClear={() => setLogEntries([])}
        />
      )}
    </div>
  );
}
