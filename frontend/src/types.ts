export interface Unit {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: "active" | "idle" | "sos";
  role: "recon" | "medic" | "engineer" | "command" | "drone";
}

export type InfraCategory =
  | "power_plant"
  | "substation"
  | "water_works"
  | "pumping_station"
  | "water_tower"
  | "reservoir"
  | "hospital"
  | "fire_station"
  | "police"
  | "industrial"
  | "railway"
  | "power_line"
  | "highway"
  | "building"
  | "bridge"
  | "other";

export interface InfrastructureElement {
  id: number;
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
  category: InfraCategory;
  label: string;
}

// ---------- Graf zależności ----------

export interface PowerLine {
  line_id:            number;
  voltage:            number;
  voltage_label:      string;
  name:               string;
  operator:           string;
  geometry:           [number, number][];   // [lat, lon][]
  feeds_substations:  number[];
  feeds_facilities:   number[];
}

export interface SubstationZone {
  substation_id:       number;
  name:                string;
  lat:                 number;
  lon:                 number;
  voltage:             string;
  powered_by_lines:    number[];
  powers_facilities:   number[];
}

export interface WaterZone {
  water_id:            number;
  name:                string;
  lat:                 number;
  lon:                 number;
  type:                string;
  supplies_facilities: number[];
}

export interface WaterPipe {
  pipe_id:  number;
  name:     string;
  type:     "pipeline" | "canal" | "river" | string;
  geometry: [number, number][];
}

export interface FacilityDep {
  facility_id:               number;
  name:                      string;
  lat:                       number;
  lon:                       number;
  category:                  string;
  powered_by_substations:    number[];
  supplied_by_water:         number[];
}

export interface WaterPipeChain {
  pipe_id:  number;
  name:     string;
  type:     "river" | "canal" | "pipeline";
  geometry: [number, number][];
}

export interface BridgeNode {
  bridge_id:  number;
  name:       string;
  lat:        number;
  lon:        number;
  road_ref:   string;
  road_type:  string;
}

export interface DependencyGraph {
  generated_at:     string;
  thresholds:       { line_to_substation_m: number; substation_to_facility_m: number; water_source_to_facility_m?: number };
  power_chains:     PowerLine[];
  substation_zones: SubstationZone[];
  water_zones?:     WaterZone[];
  water_pipes?:     WaterPipe[];
  bridge_nodes?:    BridgeNode[];
  facility_deps:    FacilityDep[];
}

export interface CustomPoint {
  id:          string;
  lat:         number;
  lng:         number;
  name:        string;
  description: string;
}
