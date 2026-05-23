import { useRef, useEffect } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import type { Unit, InfrastructureElement, InfraCategory, DependencyGraph } from "../types";
import { createInfraIcon, createInfraPopup } from "./InfrastructureMarker";
import { INFRA_CONFIG } from "../utils/infraConfig";
import { initDependencyLayer, type DependencyLayerHandle } from "./DependencyLayer";

const STALOWA_WOLA: L.LatLngExpression = [50.56211528577714, 22.066128447186205];
const INITIAL_ZOOM = 14;
const COMMAND_ZONE_RADIUS = 500;

const TILE_ONLINE  = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_OFFLINE = "http://localhost:8000/tiles/{z}/{x}/{y}.png";

const STATUS_COLORS: Record<Unit["status"], string> = {
  active: "#22c55e",
  idle:   "#eab308",
  sos:    "#ef4444",
};

const ROLE_EMOJI: Record<Unit["role"], string> = {
  recon:    "🔭",
  medic:    "🏥",
  engineer: "🔧",
  command:  "🎯",
};

function createIcon(unit: Unit, isSelected: boolean): L.DivIcon {
  const color  = STATUS_COLORS[unit.status];
  const emoji  = ROLE_EMOJI[unit.role];
  const size   = isSelected ? 40 : 32;
  const border = isSelected ? "3px solid white" : `2px solid ${color}`;

  return L.divIcon({
    className: "",
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background: ${color}20;
        border: ${border};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${size * 0.45}px;
        cursor: pointer;
        transition: transform 0.2s;
        ${unit.status === "sos" ? "animation: pulse 1s infinite;" : ""}
      ">
        ${emoji}
      </div>
      <style>
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.3); }
        }
      </style>
    `,
  });
}

function createPopupContent(unit: Unit): string {
  return `
    <div style="color: #0f172a; min-width: 150px;">
      <h3 style="margin: 0 0 8px; font-size: 14px;">
        ${ROLE_EMOJI[unit.role]} ${unit.name}
      </h3>
      <p style="margin: 4px 0; font-size: 12px;">
        Status:
        <span style="color: ${STATUS_COLORS[unit.status]}; font-weight: 700;">
          ${unit.status.toUpperCase()}
        </span>
      </p>
      <p style="margin: 4px 0; font-size: 12px;">Rola: ${unit.role}</p>
      <p style="margin: 4px 0; font-size: 12px; color: #64748b;">
        ${unit.lat.toFixed(5)}, ${unit.lng.toFixed(5)}
      </p>
    </div>
  `;
}

interface Props {
  units:            Unit[];
  selectedUnit:     string | null;
  onSelectUnit:     (id: string) => void;
  followMode:       boolean;
  isOnline:         boolean;
  infraItems:       InfrastructureElement[];
  showInfra:        boolean;
  activeCategories: Set<InfraCategory>;
  dependencyGraph:  DependencyGraph | null;
  showDeps:         boolean;
}

export function LeafletMap({ units, selectedUnit, onSelectUnit, followMode, isOnline, infraItems, showInfra, activeCategories, dependencyGraph, showDeps }: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<L.Map | null>(null);
  const markersRef      = useRef<Map<string, L.Marker>>(new Map());
  const clusterGroupsRef = useRef<Map<InfraCategory, L.MarkerClusterGroup>>(new Map());
  const infraMarkersRef  = useRef<Map<number, { marker: L.Marker; category: InfraCategory }>>(new Map());
  const depLayerRef      = useRef<DependencyLayerHandle | null>(null);
  const zoneRef          = useRef<L.Circle | null>(null);
  const tileLayerRef     = useRef<L.TileLayer | null>(null);
  const zoomHandlerRef   = useRef<(() => void) | null>(null);

  // EFFECT 1: Inicjalizacja mapy + cluster groups
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: STALOWA_WOLA,
      zoom:   INITIAL_ZOOM,
      // Preferuj canvas renderer – szybszy przy wielu markerach
      renderer: L.canvas(),
    });

    mapRef.current = map;

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
          const size  = count < 10 ? 30 : count < 50 ? 36 : 42;
          return L.divIcon({
            className: "",
            iconSize:   [size, size],
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

    const markers       = markersRef.current;
    const infraMarkers  = infraMarkersRef.current;
    const clusterGroups = clusterGroupsRef.current;

    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
      infraMarkers.clear();
      clusterGroups.clear();
      depLayerRef.current?.destroy();
      depLayerRef.current = null;
    };
  }, []);

  // EFFECT 2: Przełączanie tile layer online ↔ offline
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const layer = L.tileLayer(isOnline ? TILE_ONLINE : TILE_OFFLINE, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: isOnline ? 19 : 17,
    }).addTo(map);

    tileLayerRef.current = layer;
  }, [isOnline]);

  // EFFECT 3: Aktualizacja markerów jednostek
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentMarkers = markersRef.current;
    const incomingIds    = new Set(units.map((u) => u.id));

    for (const [id, marker] of currentMarkers) {
      if (!incomingIds.has(id)) {
        map.removeLayer(marker);
        currentMarkers.delete(id);
      }
    }

    for (const unit of units) {
      const isSelected = unit.id === selectedUnit;
      const existing   = currentMarkers.get(unit.id);

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
      radius:      COMMAND_ZONE_RADIUS,
      color:       "#38bdf8",
      fillColor:   "#38bdf8",
      fillOpacity: 0.1,
      weight:      1,
      dashArray:   "5 5",
    });

    zone.addTo(map);
    zoneRef.current = zone;
  }, [units]);

  // EFFECT 5: Follow mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !followMode || !selectedUnit) return;

    const unit = units.find((u) => u.id === selectedUnit);
    if (!unit) return;

    map.setView([unit.lat, unit.lng], map.getZoom(), {
      animate:  true,
      duration: 0.3,
    });
  }, [units, selectedUnit, followMode]);

  // EFFECT 6: Warstwa infrastruktury krytycznej z clusteringiem + zoom-gating
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const clusterGroups = clusterGroupsRef.current;
    const infraMarkers  = infraMarkersRef.current;

    // Funkcja przebudowująca widoczność cluster groups względem aktualnego zoom
    const syncInfraVisibility = () => {
      if (!mapRef.current) return;
      const currentZoom = mapRef.current.getZoom();

      for (const [cat, group] of clusterGroups) {
        const cfg     = INFRA_CONFIG[cat];
        const visible = showInfra && activeCategories.has(cat) && currentZoom >= cfg.minZoom;

        if (visible && !mapRef.current.hasLayer(group)) {
          group.addTo(mapRef.current);
        } else if (!visible && mapRef.current.hasLayer(group)) {
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
      const visible = showInfra && activeCategories.has(category);
      if (!visible) {
        const group = clusterGroups.get(category);
        if (group) group.removeLayer(marker);
        infraMarkers.delete(id);
      }
    }

    if (!showInfra) {
      // Usuń wszystkie cluster groups z mapy
      for (const group of clusterGroups.values()) {
        if (map.hasLayer(group)) map.removeLayer(group);
      }
      return;
    }

    // Dodaj brakujące markery do odpowiednich grup
    for (const el of infraItems) {
      if (!activeCategories.has(el.category)) continue;
      if (infraMarkers.has(el.id)) continue;

      const lat = el.lat;
      const lon = el.lon;
      if (lat === undefined || lon === undefined) continue;

      const group = clusterGroups.get(el.category);
      if (!group) continue;

      const marker = L.marker([lat, lon], {
        icon: createInfraIcon(el),
        zIndexOffset: -200,
      });
      marker.bindPopup(createInfraPopup(el), { maxWidth: 280 });
      marker.bindTooltip(el.label, { direction: "top", offset: [0, -18] });
      group.addLayer(marker);

      infraMarkers.set(el.id, { marker, category: el.category });
    }

    // Synchronizuj widoczność grup z aktualnym zoom
    syncInfraVisibility();

  }, [infraItems, showInfra, activeCategories]);

  // EFFECT 7: Warstwa zależności energetycznych
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !dependencyGraph) return;

    // Inicjalizuj layer przy pierwszym załadowaniu grafu
    if (!depLayerRef.current) {
      depLayerRef.current = initDependencyLayer(map, dependencyGraph);
    }

    if (showDeps) {
      depLayerRef.current.show();
    } else {
      depLayerRef.current.hide();
    }
  }, [dependencyGraph, showDeps]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}
