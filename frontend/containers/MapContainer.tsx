import { useState, useMemo, useEffect, useCallback } from "react";
import { useWebSocket } from "../src/hooks/useWebSocket";
import { useOnlineStatus } from "../src/hooks/useOnlineStatus";
import { useInfrastructure } from "../src/hooks/useInfrastructure";
import { useDependencies } from "../src/hooks/useDependencies";
import type { Unit, InfraCategory, CriticalObject, ImpactResult, ThreatScenarioResult } from "../src/types";
import { INFRA_CONFIG, svgIcon } from "../src/utils/infraConfig";
import { computeAttackCorridor, THREAT_STYLE } from "../src/utils/attackCorridors";
import type { DynamicCorridor } from "../src/utils/attackCorridors";
import type { HighlightLocation } from "../src/App";

import { Controls } from "../src/components/Controls";
import { StatusPanel } from "../src/components/StatusPanel";
import { LeafletMap } from "../src/components/LeafletMap";
import { ThreatPanel } from "../src/components/ThreatPanel";
import type { LogEntry } from "../src/components/OperationLogOverlay";

const ALL_CATEGORIES = Object.keys(INFRA_CONFIG) as InfraCategory[];

interface MapContainerProps {
  highlightLocation?: HighlightLocation | null;
  onHighlightConsumed?: () => void;
  // Lifted state from App for persistence across views
  logEntries?: LogEntry[]; // unused in MapContainer but kept for future use
  pushLog: (entry: Omit<LogEntry, "id" | "time">) => void;
  criticalObjects: Record<string, CriticalObject>;
  onCriticalObjectsLoaded: (data: Record<string, CriticalObject>) => void;
  onClearLog?: () => void;
}

export const MapContainer = ({ highlightLocation, onHighlightConsumed, pushLog, criticalObjects, onCriticalObjectsLoaded }: MapContainerProps) => {
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

    // --- Infrastruktura krytyczna (named graf) ---
    // criticalObjects & logEntries are owned by App — received as props
    const [threatResult, setThreatResult]       = useState<ThreatScenarioResult | null>(null);
    const [loadingScenarioId, setLoadingScenarioId] = useState<string | null>(null);
    const [showCorridors, setShowCorridors]     = useState(false);
    const [dynamicCorridors, setDynamicCorridors] = useState<DynamicCorridor[]>([]);

    useEffect(() => {
        fetch("http://localhost:8000/api/critical-infrastructure")
            .then(r => r.json())
            .then(data => onCriticalObjectsLoaded(data))
            .catch(err => console.error("Błąd ładowania infrastruktury krytycznej:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSimulateAttack = useCallback(async (objectId: string, threatType: string = "drone") => {
        if (loadingScenarioId) return;
        const obj     = criticalObjects[objectId];
        const objName = obj?.name ?? objectId;

        // Compute attack corridor immediately and show it
        let corridorId: string | null = null;
        if (obj) {
            const corridor = computeAttackCorridor(threatType, obj.lat, obj.lng, objectId, objName);
            if (corridor) {
                corridorId = corridor.id;
                setShowCorridors(true);
                setDynamicCorridors(prev => [...prev, corridor]);
            }
        }

        setLoadingScenarioId(objectId);
        setThreatResult(null);
        pushLog({ type: "start", objectName: objName, threatType });

        try {
            const resp = await fetch(`http://localhost:8000/api/threat-scenario/${objectId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ threat_type: threatType }),
            });
            if (resp.ok) {
                const data: ThreatScenarioResult = await resp.json();
                setThreatResult(data);
                // Solidify corridor with real severity
                if (corridorId) {
                    setDynamicCorridors(prev => prev.map(c =>
                        c.id === corridorId
                            ? { ...c, active: false, severity: data.impact.severity }
                            : c
                    ));
                }
                pushLog({ type: "result", objectName: objName, threatType, result: data });
            } else {
                if (corridorId) {
                    setDynamicCorridors(prev => prev.map(c =>
                        c.id === corridorId ? { ...c, active: false } : c
                    ));
                }
                pushLog({ type: "error", objectName: objName, threatType });
                console.error("Błąd symulacji:", resp.status);
            }
        } catch (err) {
            if (corridorId) {
                setDynamicCorridors(prev => prev.map(c =>
                    c.id === corridorId ? { ...c, active: false } : c
                ));
            }
            pushLog({ type: "error", objectName: objName, threatType });
            console.error("Błąd symulacji:", err);
        } finally {
            setLoadingScenarioId(null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadingScenarioId, criticalObjects]);

    const impactResult: ImpactResult | null = threatResult?.impact ?? null;

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

    // --- Wyszukiwanie obiektów na mapie ---
    const [searchQuery, setSearchQuery] = useState("");
    const [searchFocused, setSearchFocused] = useState(false);

    interface SearchResult { label: string; lat: number; lon: number; sub?: string; }
    const searchResults = useMemo((): SearchResult[] => {
        const q = searchQuery.trim().toLowerCase();
        if (q.length < 2) return [];
        const results: SearchResult[] = [];

        // Jednostki
        for (const u of units) {
            if (u.name.toLowerCase().includes(q)) {
                results.push({ label: u.name, lat: u.lat, lon: u.lng, sub: `Jednostka · ${u.role}` });
            }
        }
        // Infrastruktura krytyczna (named graph)
        for (const [, obj] of Object.entries(criticalObjects)) {
            if (obj.name.toLowerCase().includes(q)) {
                results.push({ label: obj.name, lat: obj.lat, lon: obj.lng, sub: `Infrastruktura · ${obj.type}` });
            }
        }
        // Infrastruktura OSM
        for (const el of infraItems) {
            const name = el.tags?.name as string | undefined;
            if (name && name.toLowerCase().includes(q)) {
                results.push({ label: name, lat: el.lat, lon: el.lon, sub: `OSM · ${el.category}` });
            }
        }

        return results.slice(0, 8);
    }, [searchQuery, units, criticalObjects, infraItems]);

    const handleSearchSelect = (r: SearchResult) => {
        setSearchHighlight({ lat: r.lat, lon: r.lon, name: r.label });
        setSearchQuery("");
        setSearchFocused(false);
    };

    const [searchHighlight, setSearchHighlight] = useState<HighlightLocation | null>(null);
    const effectiveHighlight = searchHighlight ?? highlightLocation ?? null;
    const handleEffectiveHighlightConsumed = () => {
        setSearchHighlight(null);
        onHighlightConsumed?.();
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
            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
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
                    highlightLocation={effectiveHighlight}
                    onHighlightConsumed={handleEffectiveHighlightConsumed}
                    criticalObjects={criticalObjects}
                    impactResult={impactResult}
                    loadingScenarioId={loadingScenarioId}
                    showCorridors={showCorridors}
                    dynamicCorridors={dynamicCorridors}
                    onSimulateAttack={handleSimulateAttack}
                />
                {/* OperationLogOverlay is rendered in App.tsx globally */}
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
                {/* Panel zagrożeń — pokazywany gdy symulacja aktywna */}
                <ThreatPanel
                    result={threatResult}
                    loading={loadingScenarioId !== null}
                    criticalObjects={criticalObjects}
                    onClose={() => { setThreatResult(null); setLoadingScenarioId(null); }}
                />

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

                {/* Wyszukiwarka obiektów */}
                <div style={{ position: "relative" }}>
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: "#0f172a",
                        border: `1px solid ${searchFocused ? "#3b82f6" : "#334155"}`,
                        borderRadius: searchResults.length > 0 ? "6px 6px 0 0" : 6,
                        padding: "6px 10px",
                        transition: "border-color 0.15s",
                    }}>
                        <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13, color: "#64748b", flexShrink: 0 }}>
                            <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
                            <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onFocus={() => setSearchFocused(true)}
                            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                            placeholder="Szukaj obiektu…"
                            style={{
                                flex: 1,
                                background: "transparent",
                                border: "none",
                                outline: "none",
                                color: "#e2e8f0",
                                fontSize: 12,
                                fontFamily: "inherit",
                            }}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 14 }}
                            >×</button>
                        )}
                    </div>
                    {searchResults.length > 0 && (
                        <div style={{
                            position: "absolute",
                            top: "100%",
                            left: 0, right: 0,
                            background: "#0f172a",
                            border: "1px solid #3b82f6",
                            borderTop: "none",
                            borderRadius: "0 0 6px 6px",
                            zIndex: 9999,
                            maxHeight: 280,
                            overflowY: "auto",
                        }}>
                            {searchResults.map((r, i) => (
                                <div
                                    key={i}
                                    onMouseDown={() => handleSearchSelect(r)}
                                    style={{
                                        padding: "7px 10px",
                                        cursor: "pointer",
                                        borderBottom: i < searchResults.length - 1 ? "1px solid #1e293b" : "none",
                                        transition: "background 0.1s",
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = "#1e293b")}
                                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                >
                                    <div style={{ fontSize: 12, fontWeight: 500, color: "#e2e8f0" }}>{r.label}</div>
                                    {r.sub && <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>{r.sub}</div>}
                                </div>
                            ))}
                        </div>
                    )}
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
                            <span style={{ width: 14, height: 14, color: "#fbbf24", display: "inline-flex", flexShrink: 0 }}
                                dangerouslySetInnerHTML={{ __html: svgIcon(`<path d="M10 2H6L4 9h4L5.5 14H10L13 7H9z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`) }} />
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

                {/* Korytarze ataku — dynamiczne */}
                <div style={{
                    background: dynamicCorridors.length > 0 ? "#7f1d1d10" : "transparent",
                    border: `1px solid ${dynamicCorridors.length > 0 ? "#ef444430" : "#33415544"}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: dynamicCorridors.length > 0 ? 8 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 14, height: 14, color: "#f87171", display: "inline-flex", flexShrink: 0 }}
                                dangerouslySetInnerHTML={{ __html: svgIcon(`<path d="M8 2L5 8h2v5l5-7H9z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`) }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: dynamicCorridors.length > 0 ? "#fca5a5" : "#64748b" }}>
                                Korytarze ataku
                            </span>
                            {dynamicCorridors.length > 0 && (
                                <span style={{
                                    fontSize: 10, fontWeight: 700,
                                    padding: "0px 5px", borderRadius: 10,
                                    background: "#ef444420", color: "#f87171",
                                    border: "1px solid #ef444440",
                                }}>
                                    {dynamicCorridors.length}
                                </span>
                            )}
                        </div>
                        <div style={{ display: "flex", gap: 5 }}>
                            {dynamicCorridors.length > 0 && (
                                <button
                                    onClick={() => { setDynamicCorridors([]); setShowCorridors(false); }}
                                    style={{
                                        fontSize: 10, padding: "2px 6px", borderRadius: 4,
                                        background: "transparent", border: "1px solid #33415566",
                                        color: "#475569", cursor: "pointer", letterSpacing: "0.04em",
                                    }}
                                >
                                    WYCZYŚĆ
                                </button>
                            )}
                            <button
                                onClick={() => setShowCorridors(v => !v)}
                                disabled={dynamicCorridors.length === 0}
                                style={{
                                    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                                    border: `1px solid ${showCorridors && dynamicCorridors.length > 0 ? "#ef444488" : "#47556944"}`,
                                    background: showCorridors && dynamicCorridors.length > 0 ? "#ef444422" : "transparent",
                                    color: showCorridors && dynamicCorridors.length > 0 ? "#fca5a5" : "#64748b",
                                    cursor: dynamicCorridors.length > 0 ? "pointer" : "default",
                                    letterSpacing: "0.05em",
                                }}
                            >
                                {showCorridors && dynamicCorridors.length > 0 ? "WIDOCZNE" : "UKRYTE"}
                            </button>
                        </div>
                    </div>

                    {dynamicCorridors.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {dynamicCorridors.map(c => {
                                const ts = THREAT_STYLE[c.threatType] ?? THREAT_STYLE.drone;
                                const sevCol: Record<string, string> = {
                                    KATASTROFALNY: "#ef4444", KRYTYCZNY: "#f97316",
                                    POWAŻNY: "#eab308", UMIARKOWANY: "#22c55e",
                                };
                                const col = c.active ? ts.color : (sevCol[c.severity] ?? "#94a3b8");
                                return (
                                    <div key={c.id} style={{
                                        display: "flex", alignItems: "center", gap: 6,
                                        padding: "4px 6px",
                                        background: "rgba(255,255,255,0.02)",
                                        borderRadius: 5,
                                        borderLeft: `2px solid ${col}`,
                                    }}>
                                        <span style={{ fontSize: 11, flexShrink: 0 }}>{ts.icon}</span>
                                        <span style={{ fontSize: 11, color: "#cbd5e1", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {c.objectName}
                                        </span>
                                        {c.active ? (
                                            <span style={{ fontSize: 9, color: ts.color, flexShrink: 0 }}>●</span>
                                        ) : (
                                            <span style={{
                                                fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
                                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                                                background: `${col}22`, color: col, border: `1px solid ${col}44`,
                                            }}>
                                                {c.severity.slice(0, 3)}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ fontSize: 11, color: "#1e3a5f", fontStyle: "italic" }}>
                            Pojawią się automatycznie po symulacji ataku
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
                                        <span style={{
                                        width: 16, height: 16,
                                        flexShrink: 0,
                                        opacity: active ? 1 : 0.35,
                                        color: cfg.color,
                                        display: "inline-flex",
                                    }} dangerouslySetInnerHTML={{ __html: svgIcon(cfg.icon) }} />
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