import type { Unit } from "../types";

const STATUS_COLORS: Record<Unit["status"], string> = {
  active: "#22c55e",
  idle: "#eab308",
  sos: "#ef4444",
};

const ROLE_LABEL: Record<Unit["role"], string> = {
  recon:    "RCN",
  medic:    "MED",
  engineer: "ENG",
  command:  "CMD",
  drone:    "UAV",
};

interface Props {
  units: Unit[];
  selectedUnit: string | null;
  onSelectUnit: (id: string) => void;
}

export function StatusPanel({ units, selectedUnit, onSelectUnit }: Props) {
  // SOS zawsze na górze, reszta w stałej kolejności wg id — bez skakania przy zmianie active↔idle
  const sorted = [...units].sort((a, b) => {
    const asos = a.status === "sos" ? 0 : 1;
    const bsos = b.status === "sos" ? 0 : 1;
    if (asos !== bsos) return asos - bsos;
    return a.id.localeCompare(b.id);
  });

  return (
    <div>
      <h2 style={{ fontSize: 14, color: "#94a3b8", marginBottom: 8 }}>
        Jednostki ({units.length})
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {sorted.map((unit) => (
          <button
            key={unit.id}
            onClick={() => onSelectUnit(unit.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              background: unit.id === selectedUnit ? "#334155" : "transparent",
              border: unit.id === selectedUnit ? "1px solid #475569" : "1px solid transparent",
              borderRadius: 8,
              color: "#e2e8f0",
              cursor: "pointer",
              textAlign: "left",
              fontSize: 13,
              transition: "background 0.15s",
            }}
          >
            <div style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: STATUS_COLORS[unit.status],
              flexShrink: 0,
            }} />
            <span style={{
              fontFamily: "'Courier New', monospace",
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: "0.06em",
              color: STATUS_COLORS[unit.status],
              background: `${STATUS_COLORS[unit.status]}18`,
              border: `1px solid ${STATUS_COLORS[unit.status]}44`,
              borderRadius: 3,
              padding: "1px 4px",
              flexShrink: 0,
            }}>{ROLE_LABEL[unit.role]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{unit.name}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                {unit.role} • {unit.status}
              </div>
            </div>
            {unit.status === "sos" && (
              <span style={{
                background: "#ef4444",
                color: "white",
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
              }}>
                SOS
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
