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

function classify(tags: Record<string, string>): InfraCategory | null {
  if (tags.waterway) return null;  // cieki naturalne — brak linii WFS, tylko środek geometrii
  if (tags.man_made === "pipeline") return null;  // brak danych wodociągowych w OSM dla SW
  if (tags.power === "plant")                         return "power_plant";
  if (tags.power === "substation")                    return "substation";
  if (tags.power === "line")                          return "power_line";
  if (tags.man_made === "water_works")                return "water_works";
  if (tags.man_made === "pumping_station")            return "pumping_station";
  if (tags.man_made === "water_tower")                return "water_tower";
  if (tags.man_made === "reservoir_covered")          return "reservoir";
  if (tags.man_made === "bridge")                     return "bridge";
  if (tags.landuse  === "reservoir")                  return "reservoir";
  if (tags.amenity === "hospital")                    return "hospital";
  if (tags.amenity === "fire_station")                return "fire_station";
  if (tags.amenity === "police")                      return "police";
  if (tags.amenity === "school" || tags.amenity === "university" || tags.amenity === "college") return "building";
  if (tags.amenity === "town_hall")                   return "building";
  if (tags.office === "government")                   return "building";
  if (tags.building === "government" || tags.building === "civic") return "building";
  if (tags.landuse === "industrial")                  return "industrial";
  // Mosty: przed railway i highway, żeby most kolejowy/drogowy nie był klasyfikowany jako droga/kolej
  if (tags.bridge === "yes" && (tags.highway || tags.railway)) return "bridge";
  if (tags.railway)                                   return "railway";
  if (tags.highway)                                   return "highway";
  return "other";
}

function label(tags: Record<string, string>, category: InfraCategory): string {
  if (tags.name) return tags.name;
  const fallbacks: Record<InfraCategory, string> = {
    power_plant:     "Elektrownia",
    substation:      "Stacja transformatorowa",
    power_line:      "Linia energetyczna",
    water_works:     "Ujęcie wody / SUW",
    pumping_station: "Pompownia wody",
    water_tower:     "Wieżyczka ciśnień",
    reservoir:       "Zbiornik wody",
    hospital:        "Szpital",
    fire_station:    "Straż pożarna",
    police:          "Policja",
    industrial:      "Strefa przemysłowa",
    railway:         "Kolej",
    highway:         "Droga",
    building:        "Budynek publiczny",
    bridge:          "Most",
    other:           "Obiekt",
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
          if (category === null) continue;
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
