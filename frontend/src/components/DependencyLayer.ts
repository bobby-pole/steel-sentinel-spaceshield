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
import type { DependencyGraph, PowerLine, SubstationZone, FacilityDep, WaterZone, WaterPipe } from "../types";

// Kolory wg napięcia
function voltageColor(voltage: number): string {
  if (voltage >= 220000) return "#ef4444";
  if (voltage >= 110000) return "#f97316";
  if (voltage >= 15000)  return "#eab308";
  return "#94a3b8";
}

function voltageWeight(voltage: number): number {
  if (voltage >= 220000) return 4;
  if (voltage >= 110000) return 3;
  return 2;
}

// Emoji per kategoria obiektu krytycznego
function facilityEmoji(category: string): string {
  const map: Record<string, string> = {
    hospital:     "🏥",
    fire_station: "🚒",
    police:       "🚔",
    industrial:   "🏭",
  };
  return map[category] ?? "📍";
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

export interface DependencyLayerHandle {
  show: () => void;
  hide: () => void;
  destroy: () => void;
  setHighlight: (lineId: number | null) => void;
  showPower: () => void;
  hidePower: () => void;
  showWater: () => void;
  hideWater: () => void;
}

export function initDependencyLayer(
  map: L.Map,
  graph: DependencyGraph,
): DependencyLayerHandle {
  const powerGroup = L.layerGroup();
  const waterGroup = L.layerGroup();
  // Osobna grupa na hover-connections — dodawana/usuwana dynamicznie
  const hoverGroup = L.layerGroup().addTo(map);

  // Indeks facilities po ID
  const facilityIndex = new Map<number, FacilityDep>(
    graph.facility_deps.map((f) => [f.facility_id, f])
  );
  // Indeks substations po ID
  const substationIndex = new Map<number, SubstationZone>(
    graph.substation_zones.map((s) => [s.substation_id, s])
  );

  // Per-linia polyline + highlight polyline
  const linePolylines  = new Map<number, L.Polyline>();
  const highlightLines = new Map<number, L.Polyline>();
  // Per-stacja circle marker
  const subCircles     = new Map<number, L.CircleMarker>();

  // Referencje do aktywnych hover-connection polylines (dla in-place update)
  // facilityId → polyline
  const hoverConnLines = new Map<number, L.Polyline>();

  // ── CSS ──────────────────────────────────────────────────────────────────
  if (!document.getElementById("dep-layer-styles")) {
    const style = document.createElement("style");
    style.id = "dep-layer-styles";
    style.textContent = `
      @keyframes dep-fac-pulse {
        0%,100% { r: 7; opacity: 0.9; }
        50%      { r: 13; opacity: 0.5; }
      }
      .dep-fac-pulse circle {
        animation: dep-fac-pulse 1.1s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Hover: rysuj linie do zasilanych obiektów ─────────────────────────────
  /**
   * Pierwsze wywołanie tworzy linie + markery i wypełnia hoverConnLines.
   * Kolejne wywołania updateConnectionOrigin() aktualizują tylko punkt
   * startowy każdej linii w miejscu — zero nowych obiektów DOM.
   */
  function showFacilityConnections(
    fromLat: number,
    fromLon: number,
    facilityIds: number[],
    color: string = "#facc15"
  ) {
    hoverGroup.clearLayers();
    hoverConnLines.clear();

    for (const fid of facilityIds) {
      const fac = facilityIndex.get(fid);
      if (!fac) continue;

      // Przerywana linia od punktu hovera do obiektu
      const connLine = L.polyline(
        [[fromLat, fromLon], [fac.lat, fac.lon]],
        {
          color:       color,
          weight:      1.5,
          opacity:     0.85,
          dashArray:   "6 5",
          interactive: false,
        }
      );
      hoverGroup.addLayer(connLine);
      hoverConnLines.set(fid, connLine);

      // Pulsujący marker przy obiekcie
      const dot = L.circleMarker([fac.lat, fac.lon], {
        radius:      8,
        color:       color,
        fillColor:   color,
        fillOpacity: 0.4,
        weight:      2,
        className:   "dep-fac-pulse",
        interactive: false,
      });
      hoverGroup.addLayer(dot);

      // Etykieta obiektu
      const label = L.marker([fac.lat, fac.lon], {
        icon: L.divIcon({
          className: "",
          iconAnchor: [-12, 8],
          html: `<div style="
            background:#0f172aee;
            border:1px solid ${color}88;
            border-radius:4px;
            padding:2px 6px;
            font-size:10px;
            color:${color};
            font-family:system-ui,sans-serif;
            white-space:nowrap;
            pointer-events:none;
          ">${facilityEmoji(fac.category)} ${fac.name}</div>`,
        }),
        interactive: false,
      });
      hoverGroup.addLayer(label);
    }
  }

  /**
   * In-place update punktu startowego połączeń — wywoływany na mousemove.
   * Nie tworzy nowych obiektów, tylko przestawia istniejące polylines.
   */
  function updateConnectionOrigin(lat: number, lon: number) {
    for (const [fid, connLine] of hoverConnLines) {
      const fac = facilityIndex.get(fid);
      if (!fac) continue;
      connLine.setLatLngs([[lat, lon], [fac.lat, fac.lon]]);
    }
  }

  function clearFacilityConnections() {
    hoverGroup.clearLayers();
    hoverConnLines.clear();
  }

  // ── Rysuj linie energetyczne ─────────────────────────────────────────────
  for (const line of graph.power_chains) {
    if (line.geometry.length < 2) continue;

    const color  = voltageColor(line.voltage);
    const weight = voltageWeight(line.voltage);
    const latLngs = line.geometry.map(([lat, lon]) => [lat, lon] as L.LatLngTuple);

    // Najbliższy podłączony węzeł transformatorowy — fallback dla setHighlight
    const nearestSub = line.feeds_substations
      .map((sid) => substationIndex.get(sid))
      .filter(Boolean)
      .reduce<SubstationZone | null>((best, sub) => {
        if (!best) return sub!;
        const midIdx = Math.floor(latLngs.length / 2);
        const [mLat, mLon] = latLngs[midIdx];
        const dBest = Math.hypot(best.lat - mLat, best.lon - mLon);
        const dSub  = Math.hypot(sub!.lat - mLat, sub!.lon - mLon);
        return dSub < dBest ? sub! : best;
      }, null);

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

    polyline.on("mouseover", (e: L.LeafletMouseEvent) => {
      polyline.setStyle({ opacity: 1, weight: weight + 2 });
      for (const sid of line.feeds_substations) {
        subCircles.get(sid)?.setStyle({ color: "#facc15", fillColor: "#facc15", fillOpacity: 0.35, weight: 3 });
      }
      // Rysuj linie od miejsca hovera
      showFacilityConnections(e.latlng.lat, e.latlng.lng, line.feeds_facilities);
    });

    polyline.on("mousemove", (e: L.LeafletMouseEvent) => {
      // In-place update — brak nowych obiektów DOM
      updateConnectionOrigin(e.latlng.lat, e.latlng.lng);
    });

    polyline.on("mouseout", () => {
      polyline.setStyle({ opacity: 0.75, weight });
      for (const sid of line.feeds_substations) {
        subCircles.get(sid)?.setStyle({ color: "#fb923c", fillColor: "#fb923c", fillOpacity: 0.15, weight: 2 });
      }
      clearFacilityConnections();
    });

    powerGroup.addLayer(highlightPolyline);
    powerGroup.addLayer(polyline);
    linePolylines.set(line.line_id, polyline);
    highlightLines.set(line.line_id, highlightPolyline);
    // Przechowaj nearest sub dla setHighlight
    if (nearestSub) {
      (polyline as L.Polyline & { _nearestSubId?: number })._nearestSubId = nearestSub.substation_id;
    }
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

    // Lista obiektów (z poprawną klasą emoji dla lepszego UI)
    const facList = sub.powers_facilities
      .map(fid => facilityIndex.get(fid))
      .filter(Boolean)
      .map(f => `<li>${facilityEmoji(f!.category)} ${f!.name}</li>`)
      .join("");

    circle.bindPopup(`
      <div style="font-family:system-ui,sans-serif;font-size:12px;min-width:200px">
        <div style="background:#fb923c18;border-left:3px solid #fb923c;padding:6px 10px;margin-bottom:8px;border-radius:0 4px 4px 0">
          <strong style="color:#fb923c;font-size:13px">🔌 ${sub.name}</strong><br/>
          ${sub.voltage ? `<span style="color:#64748b;font-size:11px">${sub.voltage} V</span>` : ""}
        </div>
        <div style="color:#94a3b8;margin-bottom:4px">Zasila obiektów: <strong style="color:#e2e8f0">${sub.powers_facilities.length}</strong></div>
        ${facList ? `<ul style="margin:4px 0 0;padding-left:16px;color:#cbd5e1;max-height:150px;overflow-y:auto">${facList}</ul>` : ""}
      </div>
    `, { maxWidth: 280 });

    circle.bindTooltip(`<b>${sub.name}</b><br/>${sub.voltage || "Brak danych o napięciu"}`, { direction: "top", sticky: true });

    circle.on("mouseover", () => {
      circle.setStyle({ color: "#facc15", fillColor: "#facc15", fillOpacity: 0.3, weight: 3 });
      showFacilityConnections(sub.lat, sub.lon, sub.powers_facilities);
    });

    circle.on("mouseout", () => {
      circle.setStyle({ color: "#fb923c", fillColor: "#fb923c", fillOpacity: 0.15, weight: 2 });
      clearFacilityConnections();
    });

    powerGroup.addLayer(circle);
    subCircles.set(sub.substation_id, circle);
  }

  // Przepompownie wody (wydzielone z water_zones)
  const pumpingStations: WaterZone[] = (graph.water_zones ?? []).filter(
    z => z.type === "pumping_station"
  );

  // ── Rysuj rurociągi i cieki wodne ────────────────────────────────────────
  // Ślad cursor → przepompownie (aktualizowany w mousemove)
  const pipeHoverLines = new Map<number, L.Polyline>();

  function showPumpingStationHover(fromLat: number, fromLon: number) {
    hoverGroup.clearLayers();
    pipeHoverLines.clear();

    for (const ps of pumpingStations) {
      const connLine = L.polyline(
        [[fromLat, fromLon], [ps.lat, ps.lon]],
        { color: "#0ea5e9", weight: 1.5, opacity: 0.75, dashArray: "5 4", interactive: false }
      );
      hoverGroup.addLayer(connLine);
      pipeHoverLines.set(ps.water_id, connLine);

      hoverGroup.addLayer(L.circleMarker([ps.lat, ps.lon], {
        radius: 9, color: "#0ea5e9", fillColor: "#0ea5e9",
        fillOpacity: 0.55, weight: 2, className: "dep-fac-pulse", interactive: false,
      }));

      hoverGroup.addLayer(L.marker([ps.lat, ps.lon], {
        icon: L.divIcon({
          className: "",
          iconAnchor: [-12, 8],
          html: `<div style="
            background:#0f172aee;border:1px solid #0ea5e988;border-radius:4px;
            padding:2px 6px;font-size:10px;color:#0ea5e9;
            font-family:system-ui,sans-serif;white-space:nowrap;pointer-events:none;
          ">⚙️ ${ps.name}</div>`,
        }),
        interactive: false,
      }));
    }
  }

  function updatePipeHoverOrigin(lat: number, lon: number) {
    for (const [wid, connLine] of pipeHoverLines) {
      const ps = pumpingStations.find(p => p.water_id === wid);
      if (!ps) continue;
      connLine.setLatLngs([[lat, lon], [ps.lat, ps.lon]]);
    }
  }

  function waterPipeColor(type: WaterPipe["type"]): string {
    if (type === "river")    return "#38bdf8";
    if (type === "canal")    return "#0ea5e9";
    return "#0284c7"; // pipeline
  }

  function waterPipeWeight(type: WaterPipe["type"]): number {
    return type === "river" ? 3 : 2;
  }

  function waterPipePopupHtml(pipe: WaterPipe): string {
    const typeLabel = pipe.type === "river" ? "Rzeka" : pipe.type === "canal" ? "Kanał" : "Rurociąg ciśnieniowy";
    const color = waterPipeColor(pipe.type);
    const pumpList = pumpingStations
      .map(p => `<li style="margin:2px 0">⚙️ ${p.name}</li>`)
      .join("");
    return `
      <div style="color:#0f172a;min-width:220px;font-family:system-ui,sans-serif">
        <div style="background:${color}18;border-left:3px solid ${color};padding:6px 10px;margin-bottom:8px;border-radius:0 4px 4px 0">
          <div style="font-weight:700;font-size:13px">💧 ${pipe.name || typeLabel}</div>
          <div style="font-size:11px;color:#475569">${typeLabel}</div>
        </div>
        ${pumpList
          ? `<div style="font-size:12px;font-weight:600;margin-bottom:4px">Przepompownie w sieci (${pumpingStations.length}):</div>
             <ul style="margin:0;padding-left:14px;font-size:12px;max-height:120px;overflow-y:auto">${pumpList}</ul>`
          : '<div style="font-size:12px;color:#94a3b8">Brak danych o przepompowniach</div>'
        }
        <div style="font-size:10px;color:#94a3b8;margin-top:6px">Najedź, aby zobaczyć przepompownie na mapie</div>
      </div>
    `;
  }

  for (const pipe of (graph.water_pipes ?? [])) {
    if (pipe.geometry.length < 2) continue;

    const color  = waterPipeColor(pipe.type);
    const weight = waterPipeWeight(pipe.type);
    const latLngs = pipe.geometry.map(([lat, lon]) => [lat, lon] as L.LatLngTuple);

    const polyline = L.polyline(latLngs, {
      color,
      weight,
      opacity: 0.65,
      dashArray: pipe.type === "pipeline" ? "7 4" : undefined,
    });

    polyline.bindPopup(waterPipePopupHtml(pipe), { maxWidth: 300 });
    polyline.bindTooltip(
      pipe.name || (pipe.type === "river" ? "Rzeka" : pipe.type === "canal" ? "Kanał" : "Rurociąg"),
      { sticky: true }
    );

    polyline.on("mouseover", (e: L.LeafletMouseEvent) => {
      polyline.setStyle({ opacity: 1, weight: weight + 2 });
      showPumpingStationHover(e.latlng.lat, e.latlng.lng);
    });
    polyline.on("mousemove", (e: L.LeafletMouseEvent) => {
      updatePipeHoverOrigin(e.latlng.lat, e.latlng.lng);
    });
    polyline.on("mouseout", () => {
      polyline.setStyle({ opacity: 0.65, weight });
      hoverGroup.clearLayers();
      pipeHoverLines.clear();
    });

    waterGroup.addLayer(polyline);
  }

  // ── Rysuj przepompownie jako osobne markery ───────────────────────────────
  const pumpCircles = new Map<number, L.CircleMarker>();

  for (const ps of pumpingStations) {
    const circle = L.circleMarker([ps.lat, ps.lon], {
      radius: 8, color: "#0ea5e9", fillColor: "#0ea5e9", fillOpacity: 0.2, weight: 2,
    });

    const facList = ps.supplies_facilities
      .map(fid => facilityIndex.get(fid))
      .filter(Boolean)
      .map(f => `<li>${facilityEmoji(f!.category)} ${f!.name}</li>`)
      .join("");

    circle.bindPopup(`
      <div style="font-family:system-ui,sans-serif;font-size:12px;min-width:200px">
        <div style="background:#0ea5e918;border-left:3px solid #0ea5e9;padding:6px 10px;margin-bottom:8px;border-radius:0 4px 4px 0">
          <strong style="color:#0ea5e9;font-size:13px">⚙️ ${ps.name}</strong>
          <div style="font-size:11px;color:#475569;margin-top:2px">Przepompownia wody</div>
        </div>
        <div style="color:#94a3b8;margin-bottom:4px">Zasila obiektów: <strong style="color:#e2e8f0">${ps.supplies_facilities.length}</strong></div>
        ${facList ? `<ul style="margin:4px 0 0;padding-left:16px;color:#cbd5e1;max-height:120px;overflow-y:auto">${facList}</ul>` : ""}
      </div>
    `, { maxWidth: 280 });

    circle.bindTooltip(`<b>⚙️ ${ps.name}</b><br/>Przepompownia wody`, { direction: "top", sticky: true });

    circle.on("mouseover", () => {
      circle.setStyle({ color: "#38bdf8", fillColor: "#38bdf8", fillOpacity: 0.5, weight: 3 });
      showFacilityConnections(ps.lat, ps.lon, ps.supplies_facilities, "#0ea5e9");
    });
    circle.on("mouseout", () => {
      circle.setStyle({ color: "#0ea5e9", fillColor: "#0ea5e9", fillOpacity: 0.2, weight: 2 });
      clearFacilityConnections();
    });

    waterGroup.addLayer(circle);
    pumpCircles.set(ps.water_id, circle);
  }

  // ── Rysuj strefy zasilania w wodę (niebieskie) — wyłączając pompownie ────
  if (graph.water_zones) {
    for (const wzone of graph.water_zones) {
      if (wzone.type === "pumping_station") continue; // rysowane osobno wyżej
      if (wzone.supplies_facilities.length === 0) continue;

      const circle = L.circleMarker([wzone.lat, wzone.lon], {
        radius: 12, color: "#38bdf8", fillColor: "#38bdf8", fillOpacity: 0.15, weight: 2,
      });

      circle.bindTooltip(
        `<b>${wzone.name}</b><br/>${wzone.type === "water_tower" ? "Wieżyczka ciśnień" : "Ujęcie wody"}`,
        { sticky: true }
      );

      const wFacList = wzone.supplies_facilities
        .map(fid => facilityIndex.get(fid))
        .filter(Boolean)
        .map(f => `<li>${facilityEmoji(f!.category)} ${f!.name}</li>`)
        .join("");

      circle.bindPopup(`
        <div style="font-family:system-ui,sans-serif;font-size:12px;min-width:200px">
          <div style="background:#38bdf818;border-left:3px solid #38bdf8;padding:6px 10px;margin-bottom:8px;border-radius:0 4px 4px 0">
            <strong style="color:#38bdf8;font-size:13px">💧 ${wzone.name}</strong>
          </div>
          <div style="color:#94a3b8;margin-bottom:4px">Zasila obiektów: <strong style="color:#e2e8f0">${wzone.supplies_facilities.length}</strong></div>
          ${wFacList ? `<ul style="margin:4px 0 0;padding-left:16px;color:#cbd5e1;max-height:150px;overflow-y:auto">${wFacList}</ul>` : ""}
        </div>
      `, { maxWidth: 280 });

      circle.on("mouseover", () => {
        circle.setStyle({ color: "#7dd3fc", fillColor: "#7dd3fc", fillOpacity: 0.35, weight: 3 });
        showFacilityConnections(wzone.lat, wzone.lon, wzone.supplies_facilities, "#38bdf8");
      });
      circle.on("mouseout", () => {
        circle.setStyle({ color: "#38bdf8", fillColor: "#38bdf8", fillOpacity: 0.15, weight: 2 });
        clearFacilityConnections();
      });

      waterGroup.addLayer(circle);
    }
  }

  // ── Zarządzanie cyklem życia ─────────────────────────────────────────────
  let isPowerShown = false;
  let isWaterShown = false;

  const showPower = () => {
    if (!isPowerShown) {
      powerGroup.addTo(map);
      isPowerShown = true;
    }
  };

  const hidePower = () => {
    if (isPowerShown) {
      map.removeLayer(powerGroup);
      clearFacilityConnections();
      isPowerShown = false;
    }
  };

  const showWater = () => {
    if (!isWaterShown) {
      waterGroup.addTo(map);
      isWaterShown = true;
    }
  };

  const hideWater = () => {
    if (isWaterShown) {
      map.removeLayer(waterGroup);
      clearFacilityConnections();
      isWaterShown = false;
    }
  };

  const show = () => showPower();
  const hide = () => hidePower();

  const destroy = () => {
    hidePower();
    hideWater();
    powerGroup.clearLayers();
    waterGroup.clearLayers();
    map.removeLayer(hoverGroup);
    hoverGroup.clearLayers();
    linePolylines.clear();
    highlightLines.clear();
    subCircles.clear();
  };

  // ── Programowy highlight (np. z panelu bocznego) ─────────────────────────
  let currentHighlight: number | null = null;

  const setHighlight = (lineId: number | null) => {
    if (currentHighlight !== null) {
      const prev = highlightLines.get(currentHighlight);
      if (prev) prev.setStyle({ opacity: 0 });

      const prevLine = graph.power_chains.find((l) => l.line_id === currentHighlight);
      if (prevLine) {
        for (const sid of prevLine.feeds_substations) {
          subCircles.get(sid)?.setStyle({ color: "#fb923c", fillColor: "#fb923c", fillOpacity: 0.15, weight: 2 });
        }
      }
      clearFacilityConnections();
    }

    currentHighlight = lineId;
    if (lineId === null) return;

    const hl = highlightLines.get(lineId);
    if (hl) hl.setStyle({ color: "#ffffff", opacity: 0.4 });

    const line = graph.power_chains.find((l) => l.line_id === lineId);
    if (!line) return;

    for (const sid of line.feeds_substations) {
      subCircles.get(sid)?.setStyle({ color: "#facc15", fillColor: "#facc15", fillOpacity: 0.35, weight: 3 });
    }

    // Dla programowego highlight: użyj najbliższego podłączonego węzła transformatorowego
    const nearestSubId = line.feeds_substations
      .map((sid) => substationIndex.get(sid))
      .filter(Boolean)
      .reduce<SubstationZone | null>((best, sub) => {
        if (!best) return sub!;
        const midIdx = Math.floor(line.geometry.length / 2);
        const [mLat, mLon] = line.geometry[midIdx];
        const dBest = Math.hypot(best.lat - mLat, best.lon - mLon);
        const dSub  = Math.hypot(sub!.lat - mLat, sub!.lon - mLon);
        return dSub < dBest ? sub! : best;
      }, null);

    const origin = nearestSubId
      ? { lat: nearestSubId.lat, lon: nearestSubId.lon }
      : { lat: line.geometry[Math.floor(line.geometry.length / 2)][0], lon: line.geometry[Math.floor(line.geometry.length / 2)][1] };

    showFacilityConnections(origin.lat, origin.lon, line.feeds_facilities, "#facc15");
  };

  return { show, hide, destroy, setHighlight, showPower, hidePower, showWater, hideWater };
}

