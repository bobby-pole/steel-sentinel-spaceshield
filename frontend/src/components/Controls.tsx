interface Props {
  followMode:     boolean;
  onToggleFollow: () => void;
}

export function Controls({ followMode, onToggleFollow }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ fontSize: 14, color: "#94a3b8" }}>Sterowanie</h2>

      <button
        onClick={onToggleFollow}
        style={{
          padding:      "8px 12px",
          background:   followMode ? "#2563eb" : "#334155",
          border:       "none",
          borderRadius: 8,
          color:        "white",
          cursor:       "pointer",
          fontSize:     13,
          fontWeight:   600,
        }}
      >
        {followMode ? "🎯 Śledzenie ON" : "📍 Śledzenie OFF"}
      </button>

      <p style={{ fontSize: 11, color: "#64748b" }}>
        {followMode
          ? "Mapa podąża za wybraną jednostką"
          : "Kliknij jednostkę, potem włącz śledzenie"}
      </p>
    </div>
  );
}
