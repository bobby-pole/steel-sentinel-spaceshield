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

const WATER_SUPPLY_RADIUS: Partial<Record<import("../types").InfraCategory, number>> = {
  water_works: 3000,
  water_tower: 1500,
  pumping_station: 1000,
  reservoir: 2000,
};

const TILE_ONLINE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_OFFLINE = "http://localhost:8000/tiles/{z}/{x}/{y}.png";
const TILE_SENTINEL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

const STATUS_COLORS: Record<Unit["status"], string> = {
  active: "#22c55e",
  idle: "#eab308",
  sos: "#ef4444",
};

const ROLE_EMOJI: Record<Unit["role"], string> = {
  recon:    "🔭",
  medic:    "🏥",
  engineer: "🔧",
  command:  "🎯",
  drone:    "🚁",
};

function createIcon(unit: Unit, isSelected: boolean): L.DivIcon {
  const color   = STATUS_COLORS[unit.status];
  const emoji   = ROLE_EMOJI[unit.role];
  const size    = isSelected ? 40 : 32;
  const border  = isSelected ? "3px solid white" : `2px solid ${color}`;
  const isDrone = unit.role === "drone";

  return L.divIcon({
    className: "",
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="
        display:flex;align-items:center;justify-content:center;
        width:${size}px;height:${size}px;
        ${unit.status === "sos" ? "animation:pulse 1s infinite;" : ""}
      ">
        <div style="
          width:${isDrone ? size * 0.75 : size}px;
          height:${isDrone ? size * 0.75 : size}px;
          background:${color}20;
          border:${border};
          border-radius:${isDrone ? "4px" : "50%"};
          transform:${isDrone ? "rotate(45deg)" : "none"};
          display:flex;align-items:center;justify-content:center;
          font-size:${size * 0.45}px;
          cursor:pointer;
        ">
          <span style="display:block;${isDrone ? "transform:rotate(-45deg);" : ""}">${emoji}</span>
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
  mapStyle?: "osm" | "sentinel";
  isAddingMode?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  onDeletePoint?: (id: string) => void;
  customPoints?: import("../types").CustomPoint[];
}

export function LeafletMap({ units, selectedUnit, onSelectUnit, followMode, isOnline, infraItems, showInfra, activeCategories, dependencyGraph, showDeps, mapStyle = "sentinel", isAddingMode, onMapClick, onDeletePoint, customPoints = [] }: Props) {
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
    if (isOnline) {
      url = mapStyle === "sentinel" ? TILE_SENTINEL : TILE_ONLINE;
    }

    const layer = L.tileLayer(url, {
      attribution: mapStyle === "sentinel" ? '&copy; <a href="https://carto.com/attributions">CARTO</a>' : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: isOnline ? 19 : 17,
      className: mapStyle === "sentinel" ? "sentinel-tiles-layer" : "",
    }).addTo(map);

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

    // Funkcja przebudowująca widoczność cluster groups względem aktualnego zoom
    const syncInfraVisibility = () => {
      if (!mapRef.current) return;
      const currentZoom = mapRef.current.getZoom();

      for (const [cat, group] of clusterGroups) {
        const cfg = INFRA_CONFIG[cat];
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

      const supplyRadius = WATER_SUPPLY_RADIUS[el.category];
      if (supplyRadius) {
        marker.on("mouseover", () => {
          const currentMap = mapRef.current;
          if (!currentMap) return;
          if (waterRadiusRef.current) currentMap.removeLayer(waterRadiusRef.current);

          const cfg = INFRA_CONFIG[el.category];
          const group = L.layerGroup();

          L.circle([lat, lon], {
            radius: supplyRadius,
            color: cfg.color,
            fillColor: cfg.color,
            fillOpacity: 0.07,
            weight: 1.5,
            dashArray: "7 5",
            interactive: false,
          }).addTo(group);

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
          }).addTo(group);

          group.addTo(currentMap);
          waterRadiusRef.current = group;
        });

        marker.on("mouseout", () => {
          if (waterRadiusRef.current && mapRef.current) {
            mapRef.current.removeLayer(waterRadiusRef.current);
            waterRadiusRef.current = null;
          }
        });
      }

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

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}
