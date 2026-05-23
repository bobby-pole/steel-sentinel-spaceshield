/**
 * DependencyLayer
 * ===============
 * Zarządza warstwą grafu zależności energetycznych na mapie Leaflet.
 * Nie jest komponentem React — to moduł który dostaje referencję do mapy
 * i obsługuje imperatywne API Leaflet.
 *
 * Eksportuje:
 *  - initDependencyLayer(map, graph) → DependencyLayerHandle
 *  - DependencyLayerHandle.show() / .hide() / .destroy()
 *  - DependencyLayerHandle.setHighlight(lineId | null)
 */

import L from "leaflet";
import type { DependencyGraph, PowerLine, SubstationZone } from "../types";

// Kolory wg napięcia
function voltageColor(voltage: number): string {
  if (voltage >= 220000) return "#ef4444";   // czerwony — 220 kV
  if (voltage >= 110000) return "#f97316";   // pomarańczowy — 110 kV
  if (voltage >= 15000)  return "#eab308";   // żółty — SN
  return "#94a3b8";                          // szary — NN
}

function voltageWeight(voltage: number): number {
  if (voltage >= 220000) return 4;
  if (voltage >= 110000) return 3;
  return 2;
}

// Popup dla linii energetycznej
function linePopupHtml(line: PowerLine, subs: SubstationZone[]): string {
  const subList = line.feeds_substations
    .map((sid) => subs.find((s) => s.substation_id === sid))
    .filter(Boolean)
    .map((s) => `<li style="margin:2px 0">🔌 ${s!.name}</li>`)
    .join("");

  return `
    <div style="color:#0f172a;min-width:220px;font-family:system-ui,sans-serif">
      <div style="
        background:${voltageColor(line.voltage)}18;
        border-left:3px solid ${voltageColor(line.voltage)};
        padding:6px 10px;margin-bottom:8px;border-radius:0 4px 4px 0
      ">
        <div style="font-weight:700;font-size:13px">
          ⚡ ${line.voltage_label} ${line.name || "Linia energetyczna"}
        </div>
        ${line.operator ? `<div style="font-size:11px;color:#475569">${line.operator}</div>` : ""}
      </div>
      ${subList
        ? `<div style="font-size:12px;font-weight:600;margin-bottom:4px">Zasila stacje:</div>
           <ul style="margin:0;padding-left:14px;font-size:12px">${subList}</ul>`
        : '<div style="font-size:12px;color:#94a3b8">Brak połączonych stacji w danych</div>'
      }
      <div style="font-size:10px;color:#94a3b8;margin-top:6px">
        Uszkodzenie tej linii odcina ${line.feeds_facilities.length} obiektów krytycznych
      </div>
    </div>
  `;
}

// Popup dla stacji
function substationPopupHtml(sub: SubstationZone): string {
  return `
    <div style="color:#0f172a;min-width:200px;font-family:system-ui,sans-serif">
      <div style="
        background:#fb923c18;border-left:3px solid #fb923c;
        padding:6px 10px;margin-bottom:8px;border-radius:0 4px 4px 0
      ">
        <div style="font-weight:700;font-size:13px">🔌 ${sub.name}</div>
        ${sub.voltage ? `<div style="font-size:11px;color:#475569">${sub.voltage} V</div>` : ""}
      </div>
      <div style="font-size:12px">
        Zasila <strong>${sub.powers_facilities.length}</strong> obiektów krytycznych
      </div>
    </div>
  `;
}

export interface DependencyLayerHandle {
  show: () => void;
  hide: () => void;
  destroy: () => void;
  setHighlight: (lineId: number | null) => void;
}

export function initDependencyLayer(
  map: L.Map,
  graph: DependencyGraph,
): DependencyLayerHandle {
  const layerGroup = L.layerGroup();

  // Per-linia polyline + highlight polyline
  const linePolylines  = new Map<number, L.Polyline>();
  const highlightLines = new Map<number, L.Polyline>();   // grubsza warstwa pod spodem
  // Per-stacja circle marker
  const subCircles     = new Map<number, L.CircleMarker>();

  // ── Rysuj linie energetyczne ─────────────────────────────────────────────
  for (const line of graph.power_chains) {
    if (line.geometry.length < 2) continue;

    const color  = voltageColor(line.voltage);
    const weight = voltageWeight(line.voltage);
    const latLngs = line.geometry.map(([lat, lon]) => [lat, lon] as L.LatLngTuple);

    // Cień (highlight) — niewidoczny domyślnie
    const highlightPolyline = L.polyline(latLngs, {
      color:   "#ffffff",
      weight:  weight + 8,
      opacity: 0,
      interactive: false,
    });

    const polyline = L.polyline(latLngs, {
      color,
      weight,
      opacity: 0.75,
      dashArray: line.voltage < 110000 ? "6 4" : undefined,
    });

    polyline.bindPopup(linePopupHtml(line, graph.substation_zones), { maxWidth: 280 });
    polyline.bindTooltip(
      `${line.voltage_label} ${line.name || "Linia energetyczna"}`,
      { sticky: true }
    );

    // Hover — rozjaśniaj linię
    polyline.on("mouseover", () => {
      polyline.setStyle({ opacity: 1, weight: weight + 2 });
    });
    polyline.on("mouseout", () => {
      polyline.setStyle({ opacity: 0.75, weight });
    });

    layerGroup.addLayer(highlightPolyline);
    layerGroup.addLayer(polyline);
    linePolylines.set(line.line_id, polyline);
    highlightLines.set(line.line_id, highlightPolyline);
  }

  // ── Rysuj stacje transformatorowe ────────────────────────────────────────
  for (const sub of graph.substation_zones) {
    if (!sub.powers_facilities.length && !sub.powered_by_lines.length) continue;

    const circle = L.circleMarker([sub.lat, sub.lon], {
      radius:      10,
      color:       "#fb923c",
      fillColor:   "#fb923c",
      fillOpacity: 0.15,
      weight:      2,
      opacity:     0.8,
    });

    circle.bindPopup(substationPopupHtml(sub), { maxWidth: 260 });
    circle.bindTooltip(sub.name, { direction: "top" });

    layerGroup.addLayer(circle);
    subCircles.set(sub.substation_id, circle);
  }

  // ── CSS animacji pulsowania ───────────────────────────────────────────────
  if (!document.getElementById("dep-layer-styles")) {
    const style = document.createElement("style");
    style.id = "dep-layer-styles";
    style.textContent = `
      @keyframes dep-pulse {
        0%,100% { stroke-opacity: 0.9; stroke-width: 6; }
        50%      { stroke-opacity: 0.4; stroke-width: 12; }
      }
      .dep-highlight-pulse path {
        animation: dep-pulse 1.2s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Visible/hidden ───────────────────────────────────────────────────────
  let visible = false;

  const show = () => {
    if (!visible) {
      layerGroup.addTo(map);
      visible = true;
    }
  };

  const hide = () => {
    if (visible) {
      map.removeLayer(layerGroup);
      visible = false;
    }
  };

  const destroy = () => {
    hide();
    layerGroup.clearLayers();
    linePolylines.clear();
    highlightLines.clear();
    subCircles.clear();
  };

  // ── Highlight konkretnej linii i jej łańcucha zależności ─────────────────
  let currentHighlight: number | null = null;

  const setHighlight = (lineId: number | null) => {
    // Resetuj poprzedni highlight
    if (currentHighlight !== null) {
      const prev = highlightLines.get(currentHighlight);
      if (prev) prev.setStyle({ opacity: 0 });

      // Resetuj podświetlone stacje
      const prevLine = graph.power_chains.find((l) => l.line_id === currentHighlight);
      if (prevLine) {
        for (const sid of prevLine.feeds_substations) {
          const circle = subCircles.get(sid);
          if (circle) circle.setStyle({ color: "#fb923c", fillColor: "#fb923c", fillOpacity: 0.15, weight: 2 });
        }
      }
    }

    currentHighlight = lineId;
    if (lineId === null) return;

    // Podświetl wybraną linię
    const hl = highlightLines.get(lineId);
    if (hl) hl.setStyle({ color: "#ffffff", opacity: 0.4 });

    // Podświetl zasilane stacje
    const line = graph.power_chains.find((l) => l.line_id === lineId);
    if (!line) return;

    for (const sid of line.feeds_substations) {
      const circle = subCircles.get(sid);
      if (circle) {
        circle.setStyle({
          color:       "#facc15",
          fillColor:   "#facc15",
          fillOpacity: 0.35,
          weight:      3,
        });
      }
    }
  };

  return { show, hide, destroy, setHighlight };
}
