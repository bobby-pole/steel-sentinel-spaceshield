import type { InfraCategory } from "../types";

// Emoji + kolor + priorytet warstwy + minimalny zoom do wyświetlania per kategoria
export const INFRA_CONFIG: Record<
  InfraCategory,
  { emoji: string; color: string; label: string; zIndex: number; minZoom: number }
> = {
  power_plant:     { emoji: "⚡", color: "#facc15", label: "Elektrownia",         zIndex: 700, minZoom: 11 },
  substation:      { emoji: "🔌", color: "#fb923c", label: "Stacja transf.",      zIndex: 650, minZoom: 13 },
  power_line:      { emoji: "🗼", color: "#fbbf24", label: "Linia energetyczna",  zIndex: 600, minZoom: 14 },
  water_works:     { emoji: "💧", color: "#38bdf8", label: "Ujęcie wody / SUW",   zIndex: 680, minZoom: 12 },
  pumping_station: { emoji: "⚙️", color: "#0ea5e9", label: "Pompownia wody",      zIndex: 670, minZoom: 13 },
  water_tower:     { emoji: "🗼", color: "#0284c7", label: "Wieżyczka ciśnień",   zIndex: 660, minZoom: 12 },
  reservoir:       { emoji: "🚰", color: "#0369a1", label: "Zbiornik wody",       zIndex: 650, minZoom: 12 },
  hospital:        { emoji: "🏥", color: "#f87171", label: "Szpital",             zIndex: 750, minZoom: 11 },
  fire_station:    { emoji: "🚒", color: "#ef4444", label: "Straż pożarna",       zIndex: 740, minZoom: 12 },
  police:          { emoji: "🚔", color: "#818cf8", label: "Policja",             zIndex: 730, minZoom: 12 },
  industrial:      { emoji: "🏭", color: "#94a3b8", label: "Strefa przemysłowa",  zIndex: 500, minZoom: 14 },
  railway:         { emoji: "🚂", color: "#c084fc", label: "Kolej",               zIndex: 550, minZoom: 14 },
  highway:         { emoji: "🛣️",  color: "#6b7280", label: "Droga",              zIndex: 510, minZoom: 14 },
  other:           { emoji: "📍", color: "#64748b", label: "Inny obiekt",         zIndex: 400, minZoom: 14 },
};
