import { useState, useMemo, useEffect } from "react";
import { useWebSocket } from "../src/hooks/useWebSocket";
import { useOnlineStatus } from "../src/hooks/useOnlineStatus";
import { useInfrastructure } from "../src/hooks/useInfrastructure";
import { useDependencies } from "../src/hooks/useDependencies";
import type { Unit, InfraCategory } from "../src/types";
import { INFRA_CONFIG } from "../src/utils/infraConfig";
import type { HighlightLocation } from "../src/App";

import { Controls } from "../src/components/Controls";
import { StatusPanel } from "../src/components/StatusPanel";
import { LeafletMap } from "../src/components/LeafletMap";

const ALL_CATEGORIES = Object.keys(INFRA_CONFIG) as InfraCategory[];

interface MapContainerProps {
  highlightLocation?: HighlightLocation | null;
  onHighlightConsumed?: () => void;
}

export const MapContainer = ({ highlightLocation, onHighlightConsumed }: MapContainerProps) => {
    const [units, setUnits] = useState<Unit[]>([]);
    const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
    const [followMode, setFollowMode] = useState(false);
    const isOnline = useOnlineStatus();

    // Infrastruktura krytyczna
    const { items: infraItems, loading: infraLoading } = useInfrastructure();
    const [showInfra, setShowInfra] = useState(true);
    const [activeCategories, setActiveCategories] = useState<Set<InfraCategory>>(
        new Set(ALL_CATEGORIES)
    );

    // Graf zależności energetycznych
    const { graph: dependencyGraph } = useDependencies();
    const [showDeps, setShowDeps] = useState(true);
    const [isAddingMode, setIsAddingMode] = useState(false);
    const [customPoints, setCustomPoints] = useState<import("../src/types").CustomPoint[]>([]);

    useEffect(() => {
        fetch("http://localhost:8000/api/custom_points")
            .then(r => r.json())
            .then(data => setCustomPoints(data))
            .catch(err => console.error("Error loading custom points", err));
    }, []);

    const [mapStyle, setMapStyle] = useState<"osm" | "sentinel">("sentinel");

    const handleAddPoint = async (lat: number, lng: number) => {
        const name = prompt("Podaj nazwę dla nowego punktu:");
        if (name) {
            const newPoint = {
                id: `custom_${Date.now()}`,
                lat,
                lng,
                name,
                description: "Ręcznie dodany punkt",
            };
            try {
                await fetch("http://localhost:8000/api/custom_points", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(newPoint),
                });
                setCustomPoints(prev => [...prev, newPoint]);
            } catch (err) {
                console.error("Failed to add point", err);
            }
        }
        setIsAddingMode(false);
    };

    const handleDeletePoint = async (id: string) => {
        try {
            await fetch(`http://localhost:8000/api/custom_points/${id}`, { method: "DELETE" });
            setCustomPoints(prev => prev.filter(p => p.id !== id));
        } catch (err) {
            console.error("Failed to delete point", err);
        }
    };

    const toggleCategory = (cat: InfraCategory) => {
        setActiveCategories((prev) => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    // Licznik widocznych obiektów per kategoria
    const countByCategory = useMemo(() => {
        const map: Record<string, number> = {};
        for (const el of infraItems) {
            map[el.category] = (map[el.category] ?? 0) + 1;
        }
        return map;
    }, [infraItems]);

    useWebSocket("ws://localhost:8000/ws/map", (data) => {
        const msg = data as { type: string; units: Unit[] };
        if (msg.type === "positions") {
            // Deduplikacja po id — zabezpieczenie przed duplikatami z backendu
            const seen = new Set<string>();
            setUnits(msg.units.filter(u => !seen.has(u.id) && seen.add(u.id) !== undefined));
        }
    });

    return (
        <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <LeafletMap
                    units={units}
                    selectedUnit={selectedUnit}
                    onSelectUnit={setSelectedUnit}
                    followMode={followMode}
                    isOnline={isOnline}
                    infraItems={infraItems}
                    showInfra={showInfra}
                    activeCategories={activeCategories}
                    dependencyGraph={dependencyGraph}
                    showDeps={showDeps}
                    mapStyle={mapStyle}
                    isAddingMode={isAddingMode}
                    onMapClick={handleAddPoint}
                    onDeletePoint={handleDeletePoint}
                    customPoints={customPoints}
                    highlightLocation={highlightLocation}
                    onHighlightConsumed={onHighlightConsumed}
                />
            </div>

            <div style={{
                width: 320,
                flexShrink: 0,
                background: "#1e293b",
                padding: 16,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 16,
            }}>
                {/* Nagłówek */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Crisis Command</h1>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                            onClick={() => setMapStyle(prev => prev === "sentinel" ? "osm" : "sentinel")}
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: 4,
                                background: "#334155",
                                color: "#e2e8f0",
                                border: "1px solid #475569",
                                cursor: "pointer",
                                letterSpacing: "0.05em",
                            }}
                        >
                            STYL: {mapStyle.toUpperCase()}
                        </button>
                        <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: isOnline ? "#16a34a22" : "#b4510022",
                            color: isOnline ? "#4ade80" : "#fb923c",
                            border: `1px solid ${isOnline ? "#4ade8044" : "#fb923c44"}`,
                            letterSpacing: "0.05em",
                        }}>
                            {isOnline ? "ONLINE" : "OFFLINE"}
                        </span>
                    </div>
                </div>

                <Controls
                    followMode={followMode}
                    onToggleFollow={() => setFollowMode(!followMode)}
                    isAddingMode={isAddingMode}
                    onToggleAddMode={() => setIsAddingMode(!isAddingMode)}
                />

                {/* Panel zależności energetycznych */}
                <div style={{
                    background: showDeps ? "#ef444410" : "transparent",
                    border: `1px solid ${showDeps ? "#ef444430" : "#33415544"}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 14 }}>⚡</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: showDeps ? "#e2e8f0" : "#64748b" }}>
                                Sieć energetyczna
                            </span>
                        </div>
                        <button
                            onClick={() => setShowDeps((v) => !v)}
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 4,
                                border: `1px solid ${showDeps ? "#ef444444" : "#47556944"}`,
                                background: showDeps ? "#ef444422" : "transparent",
                                color: showDeps ? "#f87171" : "#64748b",
                                cursor: "pointer",
                                letterSpacing: "0.05em",
                            }}
                        >
                            {showDeps ? "WIDOCZNA" : "UKRYTA"}
                        </button>
                    </div>
                    {showDeps && dependencyGraph && (
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, lineHeight: 1.5 }}>
                            {dependencyGraph.power_chains.filter(l => l.feeds_substations.length > 0).length} linii energetycznych
                            {" · "}
                            {dependencyGraph.substation_zones.length} stacji
                            {" · "}
                            {dependencyGraph.facility_deps.filter(f => f.powered_by_substations.length > 0).length} obiektów zasilanych
                        </div>
                    )}
                </div>

                {/* Panel infrastruktury */}
                <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <h2 style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>
                            Infrastruktura krytyczna
                            {infraLoading && (
                                <span style={{ fontSize: 11, color: "#64748b", marginLeft: 6 }}>ładowanie…</span>
                            )}
                        </h2>
                        <button
                            onClick={() => setShowInfra((v) => !v)}
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: 4,
                                border: `1px solid ${showInfra ? "#38bdf844" : "#47556944"}`,
                                background: showInfra ? "#38bdf822" : "transparent",
                                color: showInfra ? "#38bdf8" : "#64748b",
                                cursor: "pointer",
                                letterSpacing: "0.05em",
                            }}
                        >
                            {showInfra ? "WŁĄCZONA" : "WYŁĄCZONA"}
                        </button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {ALL_CATEGORIES.map((cat) => {
                            const cfg = INFRA_CONFIG[cat];
                            const count = countByCategory[cat] ?? 0;
                            if (count === 0) return null;
                            const active = showInfra && activeCategories.has(cat);
                            return (
                                <button
                                    key={cat}
                                    onClick={() => toggleCategory(cat)}
                                    disabled={!showInfra}
                                    title={`${cfg.label} (${count})`}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        padding: "5px 10px",
                                        background: active ? `${cfg.color}12` : "transparent",
                                        border: `1px solid ${active ? `${cfg.color}44` : "#33415544"}`,
                                        borderRadius: 6,
                                        color: active ? "#e2e8f0" : "#475569",
                                        cursor: showInfra ? "pointer" : "default",
                                        textAlign: "left",
                                        fontSize: 12,
                                        transition: "all 0.15s",
                                    }}
                                >
                                    <span style={{ fontSize: 14, opacity: active ? 1 : 0.4 }}>
                                        {cfg.emoji}
                                    </span>
                                    <span style={{ flex: 1, fontWeight: 500, opacity: active ? 1 : 0.5 }}>
                                        {cfg.label}
                                    </span>
                                    <span style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        padding: "1px 5px",
                                        borderRadius: 3,
                                        background: active ? `${cfg.color}30` : "#33415533",
                                        color: active ? cfg.color : "#64748b",
                                    }}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <StatusPanel
                    units={units}
                    selectedUnit={selectedUnit}
                    onSelectUnit={setSelectedUnit}
                />
            </div>
        </div>
    );
};