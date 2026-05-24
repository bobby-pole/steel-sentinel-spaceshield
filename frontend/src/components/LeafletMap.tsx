import { useRef, useEffect, useLayoutEffect } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import type { Unit, InfrastructureElement, InfraCategory, DependencyGraph, CriticalObject, ImpactResult } from "../types";
import type { HighlightLocation } from "../App";
import { createInfraIcon, createInfraPopup } from "./InfrastructureMarker";
import { INFRA_CONFIG } from "../utils/infraConfig";
import { initDependencyLayer, type DependencyLayerHandle } from "./DependencyLayer";
import { getBearing, THREAT_STYLE, SEVERITY_COLOR } from "../utils/attackCorridors";
import type { DynamicCorridor } from "../utils/attackCorridors";

const STALOWA_WOLA: L.LatLngExpression = [50.56211528577714, 22.066128447186205];
const INITIAL_ZOOM = 14;
const COMMAND_ZONE_RADIUS = 500;

const WATER_SUPPLY_RADIUS: Partial<Record<import("../types").InfraCategory, number>> = {
  water_works: 3000,
  water_tower: 1500,
  pumping_station: 1000,
  reservoir: 2000,
};

const TILE_ONLINE   = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_OFFLINE  = "http://localhost:8000/tiles/{z}/{x}/{y}.png";
const TILE_SENTINEL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_SAT_S2   = "http://localhost:8000/satellite/{z}/{x}/{y}.jpg";

const STATUS_COLORS: Record<Unit["status"], string> = {
  active: "#22c55e",
  idle: "#eab308",
  sos: "#ef4444",
};

const ROLE_LABEL: Record<Unit["role"], string> = {
  recon: "RCN",
  medic: "MED",
  engineer: "ENG",
  command: "CMD",
  drone: "UAV",
};

function createIcon(unit: Unit, isSelected: boolean): L.DivIcon {
  const color = STATUS_COLORS[unit.status];
  const label = ROLE_LABEL[unit.role];
  const size = isSelected ? 40 : 32;
  const border = isSelected ? "3px solid white" : `2px solid ${color}`;
  const isDrone = unit.role === "drone";
  const fs = Math.round(size * 0.27);

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="
        display:flex;align-items:center;justify-content:center;
        width:${size}px;height:${size}px;
        ${unit.status === "sos" ? "animation:pulse 1s infinite;" : ""}
      ">
        <div style="
          width:${isDrone ? size * 0.78 : size}px;
          height:${isDrone ? size * 0.78 : size}px;
          background:${color}22;
          border:${border};
          border-radius:${isDrone ? "4px" : "50%"};
          transform:${isDrone ? "rotate(45deg)" : "none"};
          display:flex;align-items:center;justify-content:center;
          cursor:pointer;
        ">
          <span style="
            display:block;
            font-family:'Courier New',monospace;
            font-weight:700;
            font-size:${fs}px;
            letter-spacing:0.05em;
            color:${color};
            line-height:1;
            ${isDrone ? "transform:rotate(-45deg);" : ""}
          ">${label}</span>
        </div>
      </div>
      <style>
        @keyframes pulse {
          0%,100% { transform:scale(1); }
          50%     { transform:scale(1.3); }
        }
      </style>
    `,
  });
}

function createPopupContent(unit: Unit): string {
  return `
    <div style="color:#0f172a;min-width:150px;font-family:system-ui,sans-serif">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="
          font-family:'Courier New',monospace;font-weight:700;font-size:11px;
          letter-spacing:0.08em;color:${STATUS_COLORS[unit.status]};
          background:${STATUS_COLORS[unit.status]}18;border:1px solid ${STATUS_COLORS[unit.status]}44;
          border-radius:3px;padding:1px 5px;
        ">${ROLE_LABEL[unit.role]}</span>
        <span style="font-weight:700;font-size:13px">${unit.name}</span>
      </div>
      <p style="margin:3px 0;font-size:12px">
        Status: <span style="color:${STATUS_COLORS[unit.status]};font-weight:700">${unit.status.toUpperCase()}</span>
      </p>
      <p style="margin:3px 0;font-size:11px;color:#64748b">${unit.lat.toFixed(5)}, ${unit.lng.toFixed(5)}</p>
    </div>
  `;
}

const CRITICAL_TYPE: Record<string, { color: string; icon: string }> = {
  energy: { color: "#facc15", icon: `<path d="M10 2H6L4 9h4L5.5 14H10L13 7H9z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` },
  water: { color: "#38bdf8", icon: `<path d="M8 2C7 4 3 8 3 11a5 5 0 0010 0C13 8 9 4 8 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` },
  medical: { color: "#f87171", icon: `<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>` },
  transport: { color: "#a78bfa", icon: `<line x1="5" y1="1" x2="5" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="11" y1="1" x2="11" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="3" y1="5" x2="13" y2="5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="3" y1="10" x2="13" y2="10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>` },
  industrial: { color: "#94a3b8", icon: `<path d="M2 14h12M2 14V9h4M6 9l3.5-3v3l3.5-3V9H14v5M5 6V4M11 5V3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` },
  law_enforcement: { color: "#818cf8", icon: `<path d="M8 2L3 4v5c0 3 2.5 5 5 6 2.5-1 5-3 5-6V4z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` },
  fire: { color: "#ef4444", icon: `<path d="M8 14C5 14 3 12 3 9.5 3 7.5 4.5 6 5 4.5c.5 1.5 1 2 2 1.5C6.5 4.5 7 3 9 1c0 2.5 1 3.5 2 4.5.5-1 .5-2 1-2.5 1 2 1 3 1 5C13 12 11 14 8 14z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` },
  government: { color: "#34d399", icon: `<path d="M2 14h12M3 14V9h10v5M6 9V7M10 9V7M3 7h10M8 3L3 7M8 3L13 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` },
  communications: { color: "#22d3ee", icon: `<path d="M8 14V9M4 7a4 4 0 0 0 8 0M2 5a6 6 0 0 0 12 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="9" r="1" fill="currentColor"/>` },
};

type ImpactStatus = "normal" | "attacked" | "immediate" | "cascade_4h" | "cascade_8h";

const IMPACT_COLOR: Record<ImpactStatus, string | null> = {
  normal: null,
  attacked: "#ff0000",
  immediate: "#ef4444",
  cascade_4h: "#f97316",
  cascade_8h: "#eab308",
};

function createCriticalIcon(obj: CriticalObject, _objectId: string, status: ImpactStatus): L.DivIcon {
  const cfg = CRITICAL_TYPE[obj.type] ?? { color: "#64748b", icon: `<circle cx="8" cy="7" r="3.5" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="10.5" x2="8" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` };
  const fill = IMPACT_COLOR[status] ?? cfg.color;
  const size = status === "attacked" ? 38 : 30;
  const pulse = status === "attacked" || status === "immediate";
  const inner = Math.round(size * 0.55);

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="
        width:${size}px;height:${size}px;
        background:${fill}28;
        border:2px solid ${fill};
        border-radius:6px;
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;
        box-shadow:0 0 ${pulse ? 8 : 3}px ${fill}88;
        ${pulse ? "animation:critpulse 1s ease-in-out infinite;" : ""}
        position:relative;
        color:${fill};
        padding:${Math.round(size * 0.12)}px;
        box-sizing:border-box;
      ">
        <svg viewBox="0 0 16 16" fill="none" style="width:${inner}px;height:${inner}px">${cfg.icon}</svg>
        <div style="
          position:absolute;top:-5px;right:-5px;
          background:${fill};
          border-radius:50%;
          width:${obj.criticality * 3}px;height:${obj.criticality * 3}px;
          min-width:9px;min-height:9px;
          opacity:0.9;
        "></div>
      </div>
      <style>
        @keyframes critpulse{0%,100%{box-shadow:0 0 6px ${fill}88}50%{box-shadow:0 0 16px ${fill}ff}}
      </style>`,
    tooltipAnchor: [0, -size / 2 - 4],
  });
}

const THREAT_OPTIONS = [
  { value: "drone", label: "Dron/UAV" },
  { value: "missile", label: "Rakieta" },
  { value: "sabotage", label: "Sabotaż" },
  { value: "cyber", label: "Cyber" },
  { value: "chemical", label: "Chemiczny" },
];

function createCriticalPopup(objectId: string, obj: CriticalObject, loadingId: string | null, allObjects: Record<string, CriticalObject> = {}): string {
  const cfg = CRITICAL_TYPE[obj.type] ?? { color: "#64748b", icon: `<circle cx="8" cy="7" r="3.5" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="10.5" x2="8" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>` };
  const vulns = obj.vulnerability.join(", ");
  const defense = (obj.defense ?? []).join(", ") || "brak danych";
  const isLoading = loadingId === objectId;
  const defaultThreat = obj.vulnerability[0] || "drone";
  const powersNames = (obj.powers ?? []).map(id => allObjects[id]?.name ?? id);
  const depsNames = (obj.dependencies ?? []).map(id => allObjects[id]?.name ?? id);

  const threatOptions = THREAT_OPTIONS.map(t =>
    `<option value="${t.value}"${t.value === defaultThreat ? " selected" : ""}>${t.label}</option>`
  ).join("");

  return `
    <div style="font-family:system-ui,sans-serif;color:#0f172a;min-width:210px;max-width:250px">
      <div style="background:${cfg.color}18;border-left:3px solid ${cfg.color};padding:6px 10px;margin-bottom:8px;border-radius:0 4px 4px 0;display:flex;align-items:center;gap:8px">
        <span style="width:16px;height:16px;flex-shrink:0;color:${cfg.color}">
          <svg viewBox="0 0 16 16" fill="none" style="width:100%;height:100%">${cfg.icon}</svg>
        </span>
        <div>
          <div style="font-weight:700;font-size:13px">${obj.name}</div>
          <div style="font-size:11px;color:#475569;margin-top:1px">Krytyczność: ${"★".repeat(obj.criticality)}${"☆".repeat(5 - obj.criticality)}</div>
        </div>
      </div>
      <table style="border-collapse:collapse;width:100%;font-size:11px;margin-bottom:8px">
        <tr><td style="color:#64748b;padding:2px 6px 2px 0;white-space:nowrap">Zapas zasilania</td><td>${obj.backup_power_hours}h</td></tr>
        <tr><td style="color:#64748b;padding:2px 6px 2px 0">Podatności</td><td style="color:#fca5a5">${vulns}</td></tr>
        <tr><td style="color:#64748b;padding:2px 6px 2px 0">Ochrona</td><td style="color:#28a355">${defense}</td></tr>
        ${obj.protection_recommended?.length ? `<tr><td style="color:#64748b;padding:2px 6px 2px 0;vertical-align:top;white-space:nowrap">Rekomendowane</td><td style="color:#64748b;font-size:10px">${obj.protection_recommended.join("<br/>")}</td></tr>` : ""}
        ${powersNames.length ? `<tr><td style="color:#64748b;padding:2px 6px 2px 0;vertical-align:top;white-space:nowrap">⚡ Zasila</td><td style="color:#22c55e;font-size:10px">${powersNames.join("<br/>")}</td></tr>` : ""}
        ${depsNames.length ? `<tr><td style="color:#64748b;padding:2px 6px 2px 0;vertical-align:top;white-space:nowrap">🔌 Zależy od</td><td style="color:#f97316;font-size:10px">${depsNames.join("<br/>")}</td></tr>` : ""}
      </table>
      <select
        class="threat-type-select"
        style="
          width:100%;margin-bottom:6px;padding:5px 6px;
          background:#1e293b;color:#e2e8f0;
          border:1px solid #475569;border-radius:4px;
          font-family:system-ui,sans-serif;font-size:11px;
          cursor:pointer;
        "
      >${threatOptions}</select>
      <button
        class="simulate-attack-btn"
        data-object-id="${objectId}"
        style="
          width:100%;padding:7px;
          background:${isLoading ? "#6b2121" : "#7f1d1d"};
          color:${isLoading ? "#fca5a5" : "#fecaca"};
          border:1px solid #ef444488;border-radius:4px;
          cursor:${isLoading ? "not-allowed" : "pointer"};
          font-family:'Courier New',monospace;font-size:11px;font-weight:700;
          letter-spacing:0.1em;
        "
      >${isLoading ? "[ SYMULACJA... ]" : "[ SYMULUJ ATAK ]"}</button>
    </div>`;
}

interface Props {
  units: Unit[];
  selectedUnit: string | null;
  onSelectUnit: (id: string) => void;
  followMode: boolean;
  isOnline: boolean;
  infraItems: InfrastructureElement[];
  showInfra: boolean;
  activeCategories: Set<InfraCategory>;
  dependencyGraph: DependencyGraph | null;
  showDeps: boolean;
  mapStyle?: "osm" | "sentinel" | "s2";
  isAddingMode?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  onDeletePoint?: (id: string) => void;
  customPoints?: import("../types").CustomPoint[];
  highlightLocation?: HighlightLocation | null;
  onHighlightConsumed?: () => void;
  // --- Nowe ---
  criticalObjects?: Record<string, CriticalObject>;
  impactResult?: ImpactResult | null;
  loadingScenarioId?: string | null;
  showCorridors?: boolean;
  dynamicCorridors?: DynamicCorridor[];
  onSimulateAttack?: (objectId: string, threatType: string) => void;
}

export function LeafletMap({ units, selectedUnit, onSelectUnit, followMode, isOnline, infraItems, showInfra, activeCategories, dependencyGraph, showDeps, mapStyle = "sentinel", isAddingMode, onMapClick, onDeletePoint, customPoints = [], highlightLocation, onHighlightConsumed, criticalObjects = {}, impactResult, loadingScenarioId, showCorridors = false, dynamicCorridors = [], onSimulateAttack }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const clusterGroupsRef = useRef<Map<InfraCategory, L.MarkerClusterGroup>>(new Map());
  const infraMarkersRef = useRef<Map<number, { marker: L.Marker; category: InfraCategory }>>(new Map());
  const depLayerRef = useRef<DependencyLayerHandle | null>(null);
  const zoneRef = useRef<L.Circle | null>(null);
  const waterRadiusRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const zoomHandlerRef = useRef<(() => void) | null>(null);
  const clickHandlerRef = useRef<((e: L.LeafletMouseEvent) => void) | null>(null);
  const customMarkersRef = useRef<L.LayerGroup | null>(null);
  const highlightMarkerRef = useRef<L.Marker | null>(null);
  const criticalMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const corridorsLayerRef = useRef<L.LayerGroup | null>(null);
  const impactLinesRef = useRef<L.LayerGroup | null>(null);
  const critDepLinesRef = useRef<L.LayerGroup | null>(null);
  const selectedCritIdRef = useRef<string | null>(null);

  // Refs kept current every render — safe to read inside event handlers.
  // Updated in useLayoutEffect (runs synchronously after commit, before paint)
  // to comply with React 19's ban on ref mutation during render.
  const criticalObjectsRef = useRef(criticalObjects);
  const onSimulateAttackRef = useRef(onSimulateAttack);
  const dependencyGraphRef = useRef(dependencyGraph);
  useLayoutEffect(() => {
    criticalObjectsRef.current = criticalObjects;
    onSimulateAttackRef.current = onSimulateAttack;
    dependencyGraphRef.current = dependencyGraph;
  });

  // EFFECT 1: Inicjalizacja mapy + cluster groups
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: STALOWA_WOLA,
      zoom: INITIAL_ZOOM,
      // Preferuj canvas renderer – szybszy przy wielu markerach
      renderer: L.canvas(),
    });

    mapRef.current = map;
    customMarkersRef.current = L.layerGroup().addTo(map);
    critDepLinesRef.current = L.layerGroup().addTo(map);

    // Utwórz jeden MarkerClusterGroup per kategoria z własnym stylem
    const categories = Object.keys(INFRA_CONFIG) as InfraCategory[];
    for (const cat of categories) {
      const cfg = INFRA_CONFIG[cat];
      const group = L.markerClusterGroup({
        maxClusterRadius: 60,
        disableClusteringAtZoom: 16,
        spiderfyOnMaxZoom: true,
        zoomToBoundsOnClick: true,
        iconCreateFunction: (cluster) => {
          const count = cluster.getChildCount();
          const size = count < 10 ? 30 : count < 50 ? 36 : 42;
          return L.divIcon({
            className: "",
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            html: `<div style="
              width:${size}px;height:${size}px;
              background:#0f172aee;
              border:2px solid ${cfg.color}aa;
              border-radius:50%;
              display:flex;align-items:center;justify-content:center;
              color:${cfg.color};font-size:${size * 0.35}px;font-weight:700;
              box-shadow:0 0 0 3px ${cfg.color}22;
            ">${count}</div>`,
          });
        },
      });
      clusterGroupsRef.current.set(cat, group);
    }

    const markers = markersRef.current;
    const infraMarkers = infraMarkersRef.current;
    const clusterGroups = clusterGroupsRef.current;

    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
      infraMarkers.clear();
      clusterGroups.clear();
      depLayerRef.current?.destroy();
      depLayerRef.current = null;
      criticalMarkersRef.current.clear();
      corridorsLayerRef.current = null;
      impactLinesRef.current = null;
      critDepLinesRef.current = null;
      selectedCritIdRef.current = null;
    };
  }, []);

  // EFFECT 2: Przełączanie tile layer online ↔ offline oraz style
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let url = TILE_OFFLINE;
    let attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    let className = "";
    let maxZoom = isOnline ? 19 : 17;

    if (mapStyle === "s2") {
      url = TILE_SAT_S2;
      attribution = "© Copernicus / ESA, Sentinel-2";
      maxZoom = 17;
    } else if (isOnline) {
      if (mapStyle === "sentinel") {
        url = TILE_SENTINEL;
        attribution = '&copy; <a href="https://carto.com/attributions">CARTO</a>';
        className = "sentinel-tiles-layer";
      } else {
        url = TILE_ONLINE;
      }
    }

    const maxNativeZoom = mapStyle === "s2" ? 14 : maxZoom;
    const layer = L.tileLayer(url, { attribution, maxZoom, maxNativeZoom, className }).addTo(map);
    map.setMaxZoom(mapStyle === "s2" ? 14 : maxZoom);

    tileLayerRef.current = layer;
  }, [isOnline, mapStyle]);

  // EFFECT 3: Aktualizacja markerów jednostek
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentMarkers = markersRef.current;
    const incomingIds = new Set(units.map((u) => u.id));

    for (const [id, marker] of currentMarkers) {
      if (!incomingIds.has(id)) {
        map.removeLayer(marker);
        currentMarkers.delete(id);
      }
    }

    for (const unit of units) {
      const isSelected = unit.id === selectedUnit;
      const existing = currentMarkers.get(unit.id);

      if (existing) {
        existing.setLatLng([unit.lat, unit.lng]);
        existing.setIcon(createIcon(unit, isSelected));
        const popup = existing.getPopup();
        if (popup) popup.setContent(createPopupContent(unit));
      } else {
        const marker = L.marker([unit.lat, unit.lng], {
          icon: createIcon(unit, isSelected),
        });

        marker.bindPopup(createPopupContent(unit));
        marker.bindTooltip(unit.name, { direction: "top", offset: [0, -20] });
        marker.on("click", () => onSelectUnit(unit.id));

        marker.addTo(map);
        currentMarkers.set(unit.id, marker);
      }
    }
  }, [units, selectedUnit, onSelectUnit]);

  // EFFECT 4: Strefa geofencingu wokół command
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const command = units.find((u) => u.role === "command");
    if (!command) return;

    if (zoneRef.current) map.removeLayer(zoneRef.current);

    const zone = L.circle([command.lat, command.lng], {
      radius: COMMAND_ZONE_RADIUS,
      color: "#38bdf8",
      fillColor: "#38bdf8",
      fillOpacity: 0.1,
      weight: 1,
      dashArray: "5 5",
    });

    zone.addTo(map);
    zoneRef.current = zone;
  }, [units]);

  // EFFECT 5a: Centruj mapę przy wyborze jednostki (jednorazowo)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedUnit) return;
    // units nie jest w deps — efekt odpala się tylko przy zmianie wyboru, nie przy każdym ruchu
    const unit = units.find((u) => u.id === selectedUnit);
    if (!unit) return;
    map.flyTo([unit.lat, unit.lng], Math.max(map.getZoom(), 15), {
      animate: true,
      duration: 0.7,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnit]);

  // EFFECT 5b: Follow mode — ciągłe podążanie za jednostką
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !followMode || !selectedUnit) return;

    const unit = units.find((u) => u.id === selectedUnit);
    if (!unit) return;

    map.setView([unit.lat, unit.lng], map.getZoom(), {
      animate: true,
      duration: 0.3,
    });
  }, [units, selectedUnit, followMode]);

  // EFFECT 6: Warstwa infrastruktury krytycznej z clusteringiem + zoom-gating
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const clusterGroups = clusterGroupsRef.current;
    const infraMarkers = infraMarkersRef.current;

    // Lazy: tworzy markery dla kategorii dopiero gdy staje się widoczna (oszczędza RAM i czas)
    const populateCategory = (cat: InfraCategory) => {
      const group = clusterGroups.get(cat);
      if (!group) return;

      for (const el of infraItems) {
        if (el.category !== cat) continue;
        if (infraMarkers.has(el.id)) continue;

        const lat = el.lat;
        const lon = el.lon;
        if (lat === undefined || lon === undefined) continue;

        const marker = L.marker([lat, lon], {
          icon: createInfraIcon(el),
          zIndexOffset: -200,
        });
        marker.bindPopup(createInfraPopup(el), { maxWidth: 280 });
        marker.bindTooltip(el.label, { direction: "top", offset: [0, -18] });

        const supplyRadius = WATER_SUPPLY_RADIUS[el.category];
        if (supplyRadius) {
          marker.on("mouseover", () => {
            const currentMap = mapRef.current;
            if (!currentMap) return;
            if (waterRadiusRef.current) currentMap.removeLayer(waterRadiusRef.current);

            const cfg = INFRA_CONFIG[el.category];
            const radiusGroup = L.layerGroup();

            L.circle([lat, lon], {
              radius: supplyRadius,
              color: cfg.color,
              fillColor: cfg.color,
              fillOpacity: 0.07,
              weight: 1.5,
              dashArray: "7 5",
              interactive: false,
            }).addTo(radiusGroup);

            L.marker([lat, lon], {
              icon: L.divIcon({
                className: "",
                iconAnchor: [0, -34],
                html: `<div style="
                  background:#0f172acc;
                  border:1px solid ${cfg.color}66;
                  border-radius:4px;
                  padding:2px 8px;
                  font-size:10px;
                  color:${cfg.color};
                  white-space:nowrap;
                  pointer-events:none;
                  font-family:system-ui,sans-serif;
                  transform:translateX(-50%);
                ">Zasięg ~${(supplyRadius / 1000).toFixed(1)} km</div>`,
              }),
              interactive: false,
            }).addTo(radiusGroup);

            radiusGroup.addTo(currentMap);
            waterRadiusRef.current = radiusGroup;
          });

          marker.on("mouseout", () => {
            if (waterRadiusRef.current && mapRef.current) {
              mapRef.current.removeLayer(waterRadiusRef.current);
              waterRadiusRef.current = null;
            }
          });
        }

        // Energy infrastructure: hover shows supply connections
        if (el.category === "power_plant" || el.category === "substation" || el.category === "power_line") {
          marker.on("mouseover", () => depLayerRef.current?.highlightOsmId(el.id, true));
          marker.on("mouseout", () => depLayerRef.current?.highlightOsmId(el.id, false));
        }

        // Power plant / substation: add simulate attack button
        if (el.category === "power_plant" || el.category === "substation") {
          const attackHtml = `
            <div style="margin-top:8px">
              <select class="infra-threat-select" style="width:100%;margin-bottom:6px;padding:5px 6px;
                background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:4px;
                font-family:system-ui,sans-serif;font-size:11px;cursor:pointer;">
                <option value="drone">Dron/UAV</option>
                <option value="missile">Rakieta</option>
                <option value="sabotage">Sabotaż</option>
                <option value="cyber">Cyber</option>
                <option value="chemical">Chemiczny</option>
              </select>
              <button class="infra-simulate-btn" style="width:100%;padding:7px;
                background:#7f1d1d;color:#fecaca;border:1px solid #ef444488;border-radius:4px;
                cursor:pointer;font-family:'Courier New',monospace;font-size:11px;font-weight:700;
                letter-spacing:0.1em;">[ SYMULUJ ATAK ]</button>
            </div>`;
          marker.setPopupContent(createInfraPopup(el) + attackHtml);

          marker.on("popupopen", (e) => {
            const btn = e.popup.getElement()?.querySelector(".infra-simulate-btn");
            if (!btn) return;
            btn.addEventListener("click", () => {
              const sel = e.popup.getElement()?.querySelector(".infra-threat-select") as HTMLSelectElement | null;
              const threatType = sel?.value ?? "drone";
              // Find nearest energy critical object
              const objs = criticalObjectsRef.current;
              let bestId: string | null = null;
              let bestDist = Infinity;
              for (const [id, obj] of Object.entries(objs)) {
                if (obj.type !== "energy") continue;
                const d = Math.hypot(obj.lat - lat, obj.lng - lon);
                if (d < bestDist) { bestDist = d; bestId = id; }
              }
              if (bestId) {
                onSimulateAttackRef.current?.(bestId, threatType);
                marker.closePopup();
              }
            });
          });
        }

        group.addLayer(marker);
        infraMarkers.set(el.id, { marker, category: el.category });
      }
    };

    // Synchronizuje widoczność grup z aktualnym zoom; tworzy markery leniwie przy pierwszym pokazaniu
    const syncInfraVisibility = () => {
      if (!mapRef.current) return;
      const currentZoom = mapRef.current.getZoom();

      for (const [cat, group] of clusterGroups) {
        const cfg = INFRA_CONFIG[cat];
        const visible = showInfra && activeCategories.has(cat) && currentZoom >= cfg.minZoom;

        if (visible) {
          populateCategory(cat);
          if (!mapRef.current.hasLayer(group)) group.addTo(mapRef.current);
        } else if (mapRef.current.hasLayer(group)) {
          mapRef.current.removeLayer(group);
        }
      }
    };

    // Usuń stary zoom handler jeśli istnieje
    if (zoomHandlerRef.current) {
      map.off("zoomend", zoomHandlerRef.current);
    }
    map.on("zoomend", syncInfraVisibility);
    zoomHandlerRef.current = syncInfraVisibility;

    // Wyczyść markery kategorii które zostały odznaczone/ukryte
    for (const [id, { marker, category }] of infraMarkers) {
      if (!showInfra || !activeCategories.has(category)) {
        const group = clusterGroups.get(category);
        if (group) group.removeLayer(marker);
        infraMarkers.delete(id);
      }
    }

    if (!showInfra) {
      for (const group of clusterGroups.values()) {
        if (map.hasLayer(group)) map.removeLayer(group);
      }
      return;
    }

    syncInfraVisibility();

  }, [infraItems, showInfra, activeCategories]);

  // EFFECT 7: Warstwa zależności energetycznych
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !dependencyGraph) return;

    if (!depLayerRef.current) {
      depLayerRef.current = initDependencyLayer(map, dependencyGraph);
    }

    if (showDeps) {
      depLayerRef.current.showPower();
    } else {
      depLayerRef.current.hidePower();
    }

    // Warstwa wodociągów (rzeki/kanały z dep grafu) trwale ukryta — brak danych WFS dla SW
    depLayerRef.current.hideWater();
  }, [dependencyGraph, showDeps]);

  // EFFECT 8: Obsługa kliknięć (dodawanie punktów)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (clickHandlerRef.current) {
      map.off("click", clickHandlerRef.current);
    }

    if (isAddingMode && onMapClick) {
      map.getContainer().style.cursor = "crosshair";
      const handler = (e: L.LeafletMouseEvent) => {
        onMapClick(e.latlng.lat, e.latlng.lng);
      };
      map.on("click", handler);
      clickHandlerRef.current = handler;
    } else {
      map.getContainer().style.cursor = "";
    }
  }, [isAddingMode, onMapClick]);

  // EFFECT 9: Renderowanie custom points
  useEffect(() => {
    const layer = customMarkersRef.current;
    if (!layer) return;

    layer.clearLayers();
    for (const pt of customPoints) {
      const marker = L.circleMarker([pt.lat, pt.lng], {
        radius: 8,
        color: "#10b981",
        fillColor: "#10b981",
        fillOpacity: 0.8,
        weight: 2,
      });

      const popup = L.popup().setContent(`
        <div style="font-family:system-ui,sans-serif;font-size:13px;color:#0f172a">
          <strong style="color:#10b981">${pt.name}</strong><br/>
          <span style="color:#64748b;font-size:11px">${pt.description}</span><br/><br/>
          <button class="delete-btn" style="background:#ef4444;color:white;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;font-weight:600;width:100%">🗑️ Usuń punkt</button>
        </div>
      `);

      marker.bindPopup(popup);
      marker.on("popupopen", (e) => {
        const btn = e.popup.getElement()?.querySelector(".delete-btn");
        if (btn && onDeletePoint) {
          btn.addEventListener("click", () => onDeletePoint(pt.id));
        }
      });

      layer.addLayer(marker);
    }
  }, [customPoints, onDeletePoint]);

  // EFFECT 10: Highlight location from search / RAG (flyTo + open popup)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !highlightLocation) return;

    const { lat, lon, name, category } = highlightLocation;

    // Remove previous temporary highlight marker
    if (highlightMarkerRef.current) {
      map.removeLayer(highlightMarkerRef.current);
      highlightMarkerRef.current = null;
    }

    // -- Fly first, then open popup once settled --
    map.flyTo([lat, lon], Math.max(map.getZoom(), 16), { animate: true, duration: 1.2 });

    map.once("moveend", () => {
      // 1. Try to find & open an existing critical-infrastructure marker
      const criticalMarkers = criticalMarkersRef.current;
      for (const [, marker] of criticalMarkers) {
        const pos = marker.getLatLng();
        const dist = Math.abs(pos.lat - lat) + Math.abs(pos.lng - lon);
        if (dist < 0.0005) {
          marker.openPopup();
          return; // done — use the rich popup with simulate button
        }
      }

      // 2. Fallback: generic pulsing marker (for OSM infra / units)
      const catEmoji: Record<string, string> = {
        bridge: "🌉", hospital: "🏥", fire_station: "🚒", police: "🚔",
        power_plant: "⚡", substation: "⚡", water_works: "💧",
        pumping_station: "💧", water_tower: "💧", building: "🏛️", industrial: "🏭",
      };
      const emoji = category ? (catEmoji[category] ?? "📍") : "📍";

      const icon = L.divIcon({
        className: "",
        iconSize: [48, 48],
        iconAnchor: [24, 24],
        html: `
          <style>
            @keyframes rag-ring {
              0%   { transform: scale(0.6); opacity: 1; }
              100% { transform: scale(2.2); opacity: 0; }
            }
            @keyframes rag-bob {
              0%,100% { transform: translateY(0); }
              50%     { transform: translateY(-5px); }
            }
          </style>
          <div style="position:relative;width:48px;height:48px;">
            <div style="position:absolute;inset:0;border-radius:50%;border:3px solid #f59e0b;animation:rag-ring 1.4s ease-out infinite;"></div>
            <div style="position:absolute;inset:0;border-radius:50%;border:3px solid #f59e0b;animation:rag-ring 1.4s ease-out infinite;animation-delay:0.5s;"></div>
            <div style="
              position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
              width:32px;height:32px;border-radius:50%;
              background:#0f172a;border:2.5px solid #f59e0b;
              display:flex;align-items:center;justify-content:center;
              font-size:16px;animation:rag-bob 2s ease-in-out infinite;
              box-shadow:0 0 12px #f59e0b88;
            ">${emoji}</div>
          </div>`,
      });

      const marker = L.marker([lat, lon], { icon, zIndexOffset: 1000 });
      marker.bindPopup(
        `<div style="font-family:system-ui,sans-serif;color:#0f172a;min-width:160px">
          <strong style="color:#d97706">${emoji} ${name}</strong><br/>
          <span style="font-size:11px;color:#64748b">${category ? category.replace(/_/g, " ") : ""}</span><br/>
          <span style="font-size:10px;color:#94a3b8">${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E</span>
        </div>`,
        { autoClose: false, closeOnClick: true }
      );

      marker.addTo(map);
      marker.openPopup();
      highlightMarkerRef.current = marker;
    });

    // Clear the state after consuming so it doesn't re-trigger on unrelated re-renders
    onHighlightConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightLocation]);

  // EFFECT 11: Markery infrastruktury krytycznej (named graf)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentMarkers = criticalMarkersRef.current;
    const incomingIds = new Set(Object.keys(criticalObjects));

    // Usuń markery których już nie ma
    for (const [id, marker] of currentMarkers) {
      if (!incomingIds.has(id)) {
        map.removeLayer(marker);
        currentMarkers.delete(id);
      }
    }

    for (const [objectId, obj] of Object.entries(criticalObjects)) {
      const existing = currentMarkers.get(objectId);
      const status: ImpactStatus = "normal";

      if (existing) {
        // Odśwież popup przy zmianie loadingScenarioId
        const popup = existing.getPopup();
        if (popup) popup.setContent(createCriticalPopup(objectId, obj, loadingScenarioId ?? null, criticalObjects));
      } else {
        const marker = L.marker([obj.lat, obj.lng], {
          icon: createCriticalIcon(obj, objectId, status),
          zIndexOffset: 500,
        });

        marker.bindPopup(createCriticalPopup(objectId, obj, null, criticalObjects), { maxWidth: 260 });
        marker.bindTooltip(`${obj.name} (kryt. ${obj.criticality}/5)`, { direction: "top", offset: [0, -18] });

        marker.on("click", () => {
          const linesLayer = critDepLinesRef.current;
          if (!linesLayer) return;
          linesLayer.clearLayers();

          if (selectedCritIdRef.current === objectId) {
            selectedCritIdRef.current = null;
            return;
          }
          selectedCritIdRef.current = objectId;

          const objs = criticalObjectsRef.current;
          const src = objs[objectId];
          if (!src) return;

          const drawDep = (fromLat: number, fromLng: number, toLat: number, toLng: number, color: string, label: string) => {
            L.polyline([[fromLat, fromLng], [toLat, toLng]], {
              color, weight: 2, opacity: 0.85, interactive: false,
            }).addTo(linesLayer);
            L.circleMarker([toLat, toLng], {
              radius: 6, color, fillColor: color, fillOpacity: 0.55, weight: 2, interactive: false,
            }).bindTooltip(label, { permanent: false, direction: "top", offset: [0, -8] }).addTo(linesLayer);
          };

          // Zasilane przez ten obiekt — zielony
          for (const targetId of src.powers ?? []) {
            const t = objs[targetId];
            if (t) drawDep(src.lat, src.lng, t.lat, t.lng, "#22c55e", `⚡ ${t.name}`);
          }
          // Ten obiekt zależy od — pomarańczowy
          for (const depId of src.dependencies ?? []) {
            const d = objs[depId];
            if (d) drawDep(d.lat, d.lng, src.lat, src.lng, "#f97316", `🔌 ${d.name}`);
          }
        });

        marker.on("popupopen", (e) => {
          const btn = e.popup.getElement()?.querySelector(".simulate-attack-btn");
          if (btn && onSimulateAttack) {
            btn.addEventListener("click", () => {
              const select = e.popup.getElement()?.querySelector(".threat-type-select") as HTMLSelectElement | null;
              const threatType = select?.value || "drone";
              critDepLinesRef.current?.clearLayers();
              selectedCritIdRef.current = null;
              onSimulateAttack(objectId, threatType);
              marker.closePopup();
            });
          }
        });

        marker.addTo(map);
        currentMarkers.set(objectId, marker);
      }
    }
    // loadingScenarioId intentionally included so popup refreshes during loading
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criticalObjects, loadingScenarioId, onSimulateAttack]);

  // EFFECT 12: Nakładka impact — koloruje markery krytyczne wg wyniku symulacji
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markers = criticalMarkersRef.current;

    // Resetuj wszystkie do "normal"
    for (const [id, marker] of markers) {
      const obj = criticalObjects[id];
      if (obj) marker.setIcon(createCriticalIcon(obj, id, "normal"));
    }

    // Reset dependency layer and impact lines
    depLayerRef.current?.clearImpact();
    if (impactLinesRef.current) {
      map.removeLayer(impactLinesRef.current);
      impactLinesRef.current = null;
    }

    if (!impactResult) return;

    const paint = (ids: string[], status: ImpactStatus) => {
      for (const id of ids) {
        const marker = markers.get(id);
        const obj = criticalObjects[id];
        if (marker && obj) marker.setIcon(createCriticalIcon(obj, id, status));
      }
    };

    const attackedMarker = markers.get(impactResult.attacked_id);
    const attackedObj = criticalObjects[impactResult.attacked_id];
    if (attackedMarker && attackedObj) {
      attackedMarker.setIcon(createCriticalIcon(attackedObj, impactResult.attacked_id, "attacked"));
    }

    paint(impactResult.immediate, "immediate");
    paint(impactResult.cascade_4h, "cascade_4h");
    paint(impactResult.cascade_8h, "cascade_8h");

    // Recolor dependency-layer substations/lines that power affected facilities
    const dg = dependencyGraphRef.current;
    if (dg) {
      const allImpacted = [
        impactResult.attacked_id,
        ...impactResult.immediate,
        ...impactResult.cascade_4h,
        ...impactResult.cascade_8h,
      ];
      const facIds: number[] = [];
      for (const strId of allImpacted) {
        const obj = criticalObjects[strId];
        if (!obj) continue;
        let best: typeof dg.facility_deps[0] | null = null;
        let bestDist = Infinity;
        for (const fac of dg.facility_deps) {
          const d = Math.hypot(fac.lat - obj.lat, fac.lon - obj.lng);
          if (d < bestDist) { bestDist = d; best = fac; }
        }
        if (best && bestDist < 0.02) facIds.push(best.facility_id);
      }
      depLayerRef.current?.setImpactedFacilities(facIds);
    }

    // Draw impact lines from attacked object to each dependent object
    const src = criticalObjects[impactResult.attacked_id];
    if (src) {
      const linesLayer = L.layerGroup();

      const drawLines = (ids: string[], color: string) => {
        for (const id of ids) {
          const dep = criticalObjects[id];
          if (!dep) continue;
          L.polyline([[src.lat, src.lng], [dep.lat, dep.lng]], {
            color,
            weight: 1.5,
            opacity: 0.75,
            dashArray: "5 4",
            interactive: false,
          }).addTo(linesLayer);
          L.circleMarker([dep.lat, dep.lng], {
            radius: 5,
            color,
            fillColor: color,
            fillOpacity: 0.55,
            weight: 1.5,
            interactive: false,
          }).addTo(linesLayer);
        }
      };

      drawLines(impactResult.immediate, "#ef4444");
      drawLines(impactResult.cascade_4h, "#f97316");
      drawLines(impactResult.cascade_8h, "#eab308");

      linesLayer.addTo(map);
      impactLinesRef.current = linesLayer;
    }
  }, [impactResult, criticalObjects]);

  // EFFECT 13: Dynamic attack corridors — tied to simulations
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (corridorsLayerRef.current) {
      map.removeLayer(corridorsLayerRef.current);
      corridorsLayerRef.current = null;
    }

    if (!showCorridors || !dynamicCorridors.length) return;

    const layer = L.layerGroup();

    for (const corridor of dynamicCorridors) {
      const style = THREAT_STYLE[corridor.threatType] ?? THREAT_STYLE.drone;
      const sevCol = SEVERITY_COLOR[corridor.severity] ?? "#ef4444";
      const isActive = corridor.active;
      const lineCol = "#ef4444";

      // ── Polyline — solid red ──
      L.polyline(corridor.coords, {
        color: lineCol,
        weight: 3,
        opacity: isActive ? 0.65 : 0.90,
      }).addTo(layer);

      // ── Bearing arrows — always shown ──
      for (let i = 0; i < corridor.coords.length - 1; i++) {
        const p1 = corridor.coords[i];
        const p2 = corridor.coords[i + 1];
        const mid: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
        const bearing = getBearing(p1, p2);
        L.marker(mid, {
          icon: L.divIcon({
            className: "",
            iconSize: [14, 14],
            iconAnchor: [7, 7],
            html: `<div style="
              width:0;height:0;
              border-left:5px solid transparent;
              border-right:5px solid transparent;
              border-bottom:10px solid ${lineCol};
              transform:rotate(${bearing}deg);
              transform-origin:50% 65%;
              opacity:${isActive ? 0.65 : 0.9};
            "></div>`,
          }),
          interactive: false,
        }).addTo(layer);
      }

      // ── Origin label ──
      const origin = corridor.coords[0];
      L.marker(origin, {
        icon: L.divIcon({
          className: "",
          iconAnchor: [-2, 8],
          html: `<div style="
            background:rgba(15,23,42,0.88);
            border:1px solid ${style.color}77;
            border-radius:4px;
            padding:2px 7px;
            font-size:9px;
            color:${style.color};
            white-space:nowrap;
            pointer-events:none;
            font-family:system-ui,sans-serif;
            opacity:${isActive ? 0.7 : 1};
          ">${style.icon} ${style.label}</div>`,
        }),
        interactive: false,
      }).addTo(layer);

      // ── Target endpoint ──
      const target = corridor.coords[corridor.coords.length - 1];
      if (isActive) {
        // Pulsing ring while simulation runs
        L.marker(target, {
          icon: L.divIcon({
            className: "",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            html: `
              <style>@keyframes corr-pulse{0%,100%{transform:scale(1);opacity:0.9}50%{transform:scale(1.45);opacity:0.4}}</style>
              <div style="
                width:22px;height:22px;
                border-radius:50%;
                border:2px solid ${style.color};
                animation:corr-pulse 0.9s ease-in-out infinite;
              "></div>`,
          }),
          interactive: false,
        }).addTo(layer);
      } else {
        // Impact ring colored by severity
        L.marker(target, {
          icon: L.divIcon({
            className: "",
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            html: `<div style="
              width:28px;height:28px;
              border-radius:50%;
              border:2.5px solid ${sevCol};
              background:${sevCol}22;
              display:flex;align-items:center;justify-content:center;
              font-size:11px;
              box-shadow:0 0 10px ${sevCol}55;
            ">🎯</div>`,
          }),
          interactive: false,
        }).addTo(layer);
      }
    }

    layer.addTo(map);
    corridorsLayerRef.current = layer;
  }, [dynamicCorridors, showCorridors]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%", outline: "none" }} />;
}
