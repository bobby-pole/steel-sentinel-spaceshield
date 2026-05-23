import type { ThreatScenarioResult, CriticalObject } from "../types";

interface Props {
  result:          ThreatScenarioResult | null;
  loading:         boolean;
  criticalObjects: Record<string, CriticalObject>;
  onClose:         () => void;
}

const SEVERITY_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  KATASTROFALNY: { bg: "#7f1d1d22", text: "#fca5a5", border: "#ef444488" },
  KRYTYCZNY:     { bg: "#7c2d1222", text: "#fdba74", border: "#f9731688" },
  POWAŻNY:       { bg: "#71350022", text: "#fde047", border: "#eab30888" },
  UMIARKOWANY:   { bg: "#14532d22", text: "#28a355ff", border: "#22c55e88" },
};

const TYPE_EMOJI: Record<string, string> = {
  energy:         "⚡",
  water:          "💧",
  medical:        "🏥",
  transport:      "🛤️",
  industrial:     "🏭",
  law_enforcement:"🚔",
  fire:           "🚒",
  government:     "🏛️",
  communications: "📡",
};

export function ThreatPanel({ result, loading, criticalObjects, onClose }: Props) {
  if (loading) {
    return (
      <div style={{
        background: "#0f172a",
        border: "1px solid #ef444444",
        borderRadius: 10,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        animation: "pulse 1.5s ease-in-out infinite",
      }}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}`}</style>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🎯</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f87171" }}>Symulacja ataku…</span>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ fontSize: 11, color: "#64748b" }}>
          Analizuję kaskadę zależności i generuję scenariusz AI (do 120s)…
        </div>
        <div style={{
          height: 3, background: "#1e293b", borderRadius: 2, overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: "40%",
            background: "#ef4444",
            borderRadius: 2,
            animation: "slide 1.5s ease-in-out infinite",
          }} />
        </div>
        <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}`}</style>
      </div>
    );
  }

  if (!result) return null;

  const { impact, scenario, recommendations, order } = result;
  const sev = SEVERITY_COLOR[impact.severity] ?? SEVERITY_COLOR.UMIARKOWANY;

  const renderObjects = (ids: string[], dot: string) =>
    ids.map((id) => {
      const obj = criticalObjects[id];
      if (!obj) return null;
      const defenses = (obj.defense ?? []).slice(0, 2).join(", ");
      return (
        <div key={id} style={{ padding: "3px 0 3px 4px", borderLeft: "2px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10 }}>{dot}</span>
            <span style={{ fontSize: 11 }}>{TYPE_EMOJI[obj.type] ?? "📍"}</span>
            <span style={{ fontSize: 11, color: "#e2e8f0", flex: 1 }}>{obj.name}</span>
            {obj.backup_power_hours > 0 && (
              <span style={{ fontSize: 10, color: "#64748b" }}>
                {obj.backup_power_hours}h
              </span>
            )}
          </div>
          {defenses && (
            <div style={{ fontSize: 10, color: "#22c55e", paddingLeft: 22, marginTop: 1 }}>
              🛡 {defenses}
            </div>
          )}
        </div>
      );
    });

  return (
    <div style={{
      background: "#0f172a",
      border: `1px solid ${sev.border}`,
      borderRadius: 10,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Nagłówek */}
      <div style={{
        background: sev.bg,
        borderBottom: `1px solid ${sev.border}`,
        padding: "10px 14px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 8,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 12 }}>🎯</span>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>Symulacja ataku na:</span>
            {result.threat_type && (
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                padding: "1px 5px", borderRadius: 3,
                background: "#172554", border: "1px solid #1e3a8a", color: "#93c5fd",
              }}>
                {result.threat_type.toUpperCase()}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{result.object_name}</div>
          <div style={{
            display: "inline-block",
            marginTop: 4,
            padding: "2px 8px",
            borderRadius: 4,
            background: sev.bg,
            border: `1px solid ${sev.border}`,
            color: sev.text,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.1em",
          }}>
            {impact.severity}
          </div>
          <span style={{ fontSize: 10, color: "#64748b", marginLeft: 8 }}>
            {impact.total_affected} obiektów dotkniętych
          </span>
        </div>
        <button onClick={onClose} style={closeBtnStyle}>✕</button>
      </div>

      <div style={{ padding: "10px 14px", overflowY: "auto", maxHeight: 480, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Kaskada awarii */}
        <div>
          <div style={sectionHeaderStyle}>💥 Kaskada awarii</div>
          {impact.immediate.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 700 }}>NATYCHMIASTOWE (0h)</span>
              {renderObjects(impact.immediate, "🔴")}
            </div>
          )}
          {impact.cascade_4h.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "#f97316", fontWeight: 700 }}>W CIĄGU 4H</span>
              {renderObjects(impact.cascade_4h, "🟠")}
            </div>
          )}
          {impact.cascade_8h.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "#eab308", fontWeight: 700 }}>W CIĄGU 8H</span>
              {renderObjects(impact.cascade_8h, "🟡")}
            </div>
          )}
          {impact.cascade_t3 && impact.cascade_t3.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>ODPORNE &gt;8H (tracą zasilanie)</span>
              {renderObjects(impact.cascade_t3, "⚪")}
            </div>
          )}
          {impact.total_affected === 0 && (
            <div style={{ fontSize: 11, color: "#64748b" }}>Brak bezpośrednich zależności w grafie.</div>
          )}
        </div>

        {/* Scenariusz AI */}
        {scenario && (
          <div>
            <div style={sectionHeaderStyle}>📋 Scenariusz zagrożenia</div>
            <div style={{
              fontSize: 11, color: "#cbd5e1", lineHeight: 1.6,
              background: "#1e293b", borderRadius: 6, padding: "8px 10px",
              borderLeft: `3px solid ${sev.border}`,
            }}>
              {scenario}
            </div>
          </div>
        )}

        {/* Rekomendacje */}
        {recommendations.length > 0 && (
          <div>
            <div style={sectionHeaderStyle}>✅ Rekomendacje</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {recommendations.map((rec, i) => (
                <div key={i} style={{
                  display: "flex", gap: 6, fontSize: 11, color: "#cbd5e1", lineHeight: 1.5,
                }}>
                  <span style={{ color: "#22c55e", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rozkaz operacyjny */}
        {order && (
          <div>
            <div style={sectionHeaderStyle}>📡 Rozkaz operacyjny</div>
            <div style={{
              fontSize: 11, color: "#bfdbfe", lineHeight: 1.6, fontStyle: "italic",
              background: "#172554",
              border: "1px solid #1e3a8a",
              borderRadius: 6, padding: "8px 10px",
            }}>
              {order}
            </div>
          </div>
        )}

        {result.rag_chunks_used > 0 && (
          <div style={{ fontSize: 10, color: "#334155", textAlign: "right" }}>
            RAG: {result.rag_chunks_used} fragmentów
            {result.rag_sources?.length > 0 && (
              <span style={{ marginLeft: 6, color: "#1e3a5f" }}>
                ({result.rag_sources.slice(0, 2).join(", ")})
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const closeBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#64748b",
  cursor: "pointer",
  fontSize: 14,
  padding: "2px 4px",
  lineHeight: 1,
  flexShrink: 0,
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#94a3b8",
  letterSpacing: "0.05em",
  marginBottom: 6,
  textTransform: "uppercase",
};
