import type { InfraCategory } from "../types";

// Inline SVG body (inner content of <svg viewBox="0 0 16 16" fill="none">).
// stroke="currentColor" inherits the CSS `color` of the container.
export const INFRA_CONFIG: Record<
  InfraCategory,
  { icon: string; color: string; label: string; zIndex: number; minZoom: number }
> = {
  power_plant: {
    icon: `<path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M10 2H6L4 9h4L5.5 14H10L13 7H9z"/>`,
    color: "#facc15", label: "Elektrownia", zIndex: 700, minZoom: 11,
  },
  substation: {
    icon: `<circle cx="5.5" cy="5.5" r="3" stroke="currentColor" stroke-width="1.5"/><circle cx="10.5" cy="10.5" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 8.5v1h5v-1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
    color: "#fb923c", label: "Stacja transf.", zIndex: 650, minZoom: 13,
  },
  power_line: {
    icon: `<path d="M8 1v13M4 5h8M5.5 7.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M8 1L5 14M8 1L11 14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
    color: "#fbbf24", label: "Linia energetyczna", zIndex: 600, minZoom: 14,
  },
  water_works: {
    icon: `<path d="M8 2C7 4 3 8 3 11a5 5 0 0010 0C13 8 9 4 8 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    color: "#38bdf8", label: "Ujęcie wody / SUW", zIndex: 680, minZoom: 12,
  },
  pumping_station: {
    icon: `<circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2M4.2 4.2l1.4 1.4M10.4 10.4l1.4 1.4M11.8 4.2l-1.4 1.4M5.6 10.4l-1.4 1.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
    color: "#0ea5e9", label: "Pompownia wody", zIndex: 670, minZoom: 13,
  },
  water_tower: {
    icon: `<path d="M3 15h10M5 14.5V9M11 14.5V9M3 9h10M7 9V7M9 9V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><ellipse cx="8" cy="6.5" rx="4" ry="2.5" stroke="currentColor" stroke-width="1.5"/>`,
    color: "#0284c7", label: "Wieżyczka ciśnień", zIndex: 660, minZoom: 12,
  },
  reservoir: {
    icon: `<rect x="2" y="6" width="12" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M2 10q3-2 6 0t6 0" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none"/><path d="M5 6V4M11 6V4M5 4h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
    color: "#0369a1", label: "Zbiornik wody", zIndex: 650, minZoom: 12,
  },
  hospital: {
    icon: `<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
    color: "#f87171", label: "Szpital", zIndex: 750, minZoom: 11,
  },
  fire_station: {
    icon: `<path d="M8 14C5 14 3 12 3 9.5 3 7.5 4.5 6 5 4.5c.5 1.5 1 2 2 1.5C6.5 4.5 7 3 9 1c0 2.5 1 3.5 2 4.5.5-1 .5-2 1-2.5 1 2 1 3 1 5C13 12 11 14 8 14z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    color: "#ef4444", label: "Straż pożarna", zIndex: 740, minZoom: 12,
  },
  police: {
    icon: `<path d="M8 2L3 4v5c0 3 2.5 5 5 6 2.5-1 5-3 5-6V4z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    color: "#818cf8", label: "Policja", zIndex: 730, minZoom: 12,
  },
  industrial: {
    icon: `<path d="M2 14h12M2 14V9h4M6 9l3.5-3v3l3.5-3V9H14v5M5 6V4M11 5V3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    color: "#94a3b8", label: "Strefa przemysłowa", zIndex: 500, minZoom: 14,
  },
  railway: {
    icon: `<line x1="5" y1="1" x2="5" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="11" y1="1" x2="11" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="3" y1="4" x2="13" y2="4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="3" y1="12" x2="13" y2="12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
    color: "#c084fc", label: "Kolej", zIndex: 550, minZoom: 14,
  },
  highway: {
    icon: `<line x1="5" y1="1" x2="5" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="11" y1="1" x2="11" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="8" y1="3" x2="8" y2="6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="2 2"/><line x1="8" y1="9" x2="8" y2="12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="2 2"/>`,
    color: "#6b7280", label: "Droga", zIndex: 510, minZoom: 14,
  },
  building: {
    icon: `<path d="M2 14h12M3 14V9h10v5M6 9V7M10 9V7M3 7h10M8 3L3 7M8 3L13 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    color: "#a78bfa", label: "Budynek publiczny", zIndex: 620, minZoom: 15,
  },
  bridge: {
    icon: `<path d="M1 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2 12C2 12 4 6 8 6S14 12 14 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/><line x1="5" y1="12" x2="5" y2="9.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="8" y1="12" x2="8" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="11" y1="12" x2="11" y2="9.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`,
    color: "#22d3ee", label: "Most / wiadukt", zIndex: 580, minZoom: 16,
  },
  other: {
    icon: `<circle cx="8" cy="7" r="3.5" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="10.5" x2="8" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
    color: "#64748b", label: "Inny obiekt", zIndex: 400, minZoom: 14,
  },
};

// Shared SVG wrapper — renders an icon body at full container size
export function svgIcon(body: string): string {
  return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">${body}</svg>`;
}
