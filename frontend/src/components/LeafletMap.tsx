import { useRef, useEffect } from "react";
import L from "leaflet";
import type { Unit } from "../types";

const STALOWA_WOLA: L.LatLngExpression = [50.5826, 22.0533];
const INITIAL_ZOOM = 14;
const COMMAND_ZONE_RADIUS = 500;

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
  units:        Unit[];
  selectedUnit: string | null;
  onSelectUnit: (id: string) => void;
  followMode:   boolean;
}

export function LeafletMap({ units, selectedUnit, onSelectUnit, followMode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<L.Map | null>(null);
  const markersRef   = useRef<Map<string, L.Marker>>(new Map());
  const zoneRef      = useRef<L.Circle | null>(null);

  // EFFECT 1: Inicjalizacja mapy — uruchamia się RAZ
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: STALOWA_WOLA,
      zoom:   INITIAL_ZOOM,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // EFFECT 2: Aktualizacja markerów
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

  // EFFECT 3: Strefa geofencingu wokół command
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

  // EFFECT 4: Follow mode
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

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}
