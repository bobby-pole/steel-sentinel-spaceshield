import { useState, useEffect } from "react";
import type { InfrastructureElement, InfraCategory } from "../types";

interface RawElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function classify(tags: Record<string, string>): InfraCategory {
  if (tags.power === "plant")              return "power_plant";
  if (tags.power === "substation")         return "substation";
  if (tags.power === "line")               return "power_line";
  if (tags.man_made === "water_works")     return "water_works";
  if (tags.amenity === "hospital")         return "hospital";
  if (tags.amenity === "fire_station")     return "fire_station";
  if (tags.amenity === "police")           return "police";
  if (tags.landuse === "industrial")       return "industrial";
  if (tags.railway)                        return "railway";
  if (tags.waterway)                       return "waterway";
  if (tags.highway)                        return "highway";
  return "other";
}

function label(tags: Record<string, string>, category: InfraCategory): string {
  if (tags.name) return tags.name;
  const fallbacks: Record<InfraCategory, string> = {
    power_plant:  "Elektrownia",
    substation:   "Stacja transformatorowa",
    power_line:   "Linia energetyczna",
    water_works:  "Ujęcie wody",
    hospital:     "Szpital",
    fire_station: "Straż pożarna",
    police:       "Policja",
    industrial:   "Strefa przemysłowa",
    railway:      "Kolej",
    waterway:     "Droga wodna",
    highway:      "Droga",
    other:        "Obiekt",
  };
  return fallbacks[category];
}

export function useInfrastructure() {
  const [items, setItems] = useState<InfrastructureElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/infrastructure.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ elements: RawElement[] }>;
      })
      .then(({ elements }) => {
        const processed: InfrastructureElement[] = [];

        for (const el of elements) {
          const tags = el.tags ?? {};

          // Wyznacz współrzędne: node → lat/lon, way/relation → center
          const lat = el.lat ?? el.center?.lat;
          const lon = el.lon ?? el.center?.lon;

          // Pomijaj elementy bez punktu (linie bez center itp.)
          if (lat === undefined || lon === undefined) continue;

          const category = classify(tags);
          processed.push({
            id:       el.id,
            type:     el.type,
            lat,
            lon,
            center:   el.center,
            tags,
            category,
            label:    label(tags, category),
          });
        }

        setItems(processed);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return { items, loading, error };
}
