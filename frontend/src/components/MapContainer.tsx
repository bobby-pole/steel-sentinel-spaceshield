import { useState } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import type { Unit } from "../types";

import { Controls } from "./Controls";
import { StatusPanel } from "./StatusPanel";
import { LeafletMap } from "./LeafletMap";

export const MapContainer = () => {
    const [units, setUnits] = useState<Unit[]>([]);
    const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
    const [followMode, setFollowMode] = useState(false);

    useWebSocket("ws://localhost:8000/ws/map", (data) => {
        const msg = data as { type: string; units: Unit[] };
        if (msg.type === "positions") {
            setUnits(msg.units);
        }
    });

    return (
        <div style={{ display: "flex", height: "100vh" }}>
            <div style={{ flex: 1 }}>
                <LeafletMap
                    units={units}
                    selectedUnit={selectedUnit}
                    onSelectUnit={setSelectedUnit}
                    followMode={followMode}
                />
            </div>

            <div style={{
                width: 320,
                background: "#1e293b",
                padding: 16,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 16,
            }}>
                <h1 style={{ fontSize: 18, fontWeight: 700 }}>Crisis Command</h1>

                <Controls
                    followMode={followMode}
                    onToggleFollow={() => setFollowMode(!followMode)}
                />

                <StatusPanel
                    units={units}
                    selectedUnit={selectedUnit}
                    onSelectUnit={setSelectedUnit}
                />
            </div>
        </div>
    )
};