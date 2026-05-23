// Attack corridor routing & styling

export interface DynamicCorridor {
  id:         string;
  objectId:   string;
  objectName: string;
  threatType: string;
  severity:   string;    // updated when simulation completes
  coords:     [number, number][];
  active:     boolean;   // true while simulation is running
}

// Per-threat visual style
export const THREAT_STYLE: Record<string, {
  color:  string;
  weight: number;
  dash:   string;
  icon:   string;
  label:  string;
}> = {
  drone:    { color: "#eab308", weight: 2, dash: "7 5",  icon: "🤖", label: "Dron/UAV" },
  missile:  { color: "#ef4444", weight: 3, dash: "none", icon: "🚀", label: "Rakieta" },
  sabotage: { color: "#a855f7", weight: 2, dash: "4 4",  icon: "🔧", label: "Sabotaż" },
  chemical: { color: "#22c55e", weight: 2, dash: "9 5",  icon: "☣️", label: "Chemiczny" },
  cyber:    { color: "#22d3ee", weight: 1, dash: "2 5",  icon: "💻", label: "Cyber" },
};

export const SEVERITY_COLOR: Record<string, string> = {
  KATASTROFALNY: "#ef4444",
  KRYTYCZNY:     "#f97316",
  POWAŻNY:       "#eab308",
  UMIARKOWANY:   "#22c55e",
};

// Known entry points for each threat vector (outside / edge of Stalowa Wola)
const ORIGINS: Partial<Record<string, [number, number]>> = {
  drone:    [50.745, 22.062],   // north — open agricultural fields
  missile:  [50.582, 22.290],   // east  — DK9 / railway corridor
  chemical: [50.598, 21.815],   // west  — San river valley
};

/**
 * Builds a multi-point route from attack origin → target object.
 * Returns null for threat types with no physical corridor (cyber).
 */
export function computeAttackCorridor(
  threatType:  string,
  targetLat:   number,
  targetLng:   number,
  objectId:    string,
  objectName:  string,
  severity:    string = "UMIARKOWANY",
): DynamicCorridor | null {

  if (threatType === "cyber") return null;

  let coords: [number, number][];

  // ── Sabotaż: short internal approach (deterministic from objectId) ──
  if (threatType === "sabotage") {
    const seed = objectId.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const angle = ((seed % 360) * Math.PI) / 180;
    // Origin ~1.5 km from target
    const oLat = targetLat + Math.cos(angle) * 0.013;
    const oLng = targetLng + Math.sin(angle) * 0.018;
    // Mid-point with small lateral offset for curved look
    const mLat = (oLat + targetLat) / 2 + Math.cos(angle + Math.PI / 2) * 0.003;
    const mLng = (oLng + targetLng) / 2 + Math.sin(angle + Math.PI / 2) * 0.004;
    coords = [[oLat, oLng], [mLat, mLng], [targetLat, targetLng]];

  // ── Missile from east: along DK9 axis then diagonal to target ──
  } else if (threatType === "missile") {
    const origin = ORIGINS.missile!;
    // Approach along lat ~50.582 (DK9 road), then angle diagonally to target
    const eastAxis: [number, number]  = [50.582, targetLng + 0.055];
    const diagonal: [number, number]  = [
      (50.582 + targetLat) / 2,
      (eastAxis[1] + targetLng) / 2,
    ];
    coords = [origin, eastAxis, diagonal, [targetLat, targetLng]];

  // ── Chemical: west → east following San river valley ──
  } else if (threatType === "chemical") {
    const origin = ORIGINS.chemical!;
    const wp1: [number, number] = [50.592, 21.885];
    const wp2: [number, number] = [50.583, 21.975];
    const wp3: [number, number] = [(wp2[0] + targetLat) / 2, (wp2[1] + targetLng) / 2];
    coords = [origin, wp1, wp2, wp3, [targetLat, targetLng]];

  // ── Drone: straight approach from north with slight convergence ──
  } else {
    const origin = ORIGINS.drone!;
    const mid1: [number, number] = [50.675, (origin[1] + targetLng) / 2];
    const mid2: [number, number] = [50.618, targetLng + (origin[1] - targetLng) * 0.12];
    coords = [origin, mid1, mid2, [targetLat, targetLng]];
  }

  return {
    id:         `${objectId}_${threatType}_${Date.now()}`,
    objectId,
    objectName,
    threatType,
    severity,
    coords,
    active:     true,
  };
}

export function getBearing(p1: [number, number], p2: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lat1, lng1] = p1.map(toRad);
  const [lat2, lng2] = p2.map(toRad);
  const dLng = lng2 - lng1;
  const x = Math.sin(dLng) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
}
