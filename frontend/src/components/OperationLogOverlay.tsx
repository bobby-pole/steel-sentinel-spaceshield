import { useEffect, useRef } from "react";
import type { ThreatScenarioResult, CriticalObject } from "../types";

export interface LogEntry {
  id: string;
  time: string;
  type: "start" | "result" | "error";
  objectName?: string;
  threatType?: string;
  message?: string;
  result?: ThreatScenarioResult;
}

interface Props {
  entries: LogEntry[];
  criticalObjects: Record<string, CriticalObject>;
  onClear: () => void;
  /** 'float' = fixed overlay on map (default). 'panel' = inline inside a column */
  variant?: "float" | "panel";
}

const SEV_COLOR: Record<string, string> = {
  KATASTROFALNY: "#ef4444",
  KRYTYCZNY: "#f97316",
  POWAŻNY: "#eab308",
  UMIARKOWANY: "#22c55e",
};

const THREAT_ICON: Record<string, string> = {
  drone: "🤖",
  missile: "🚀",
  sabotage: "🔧",
  cyber: "💻",
  chemical: "☣️",
};

function TierRow({
  dot, label, color, ids, criticalObjects,
}: {
  dot: string; label: string; color: string;
  ids: string[]; criticalObjects: Record<string, CriticalObject>;
}) {
  if (!ids.length) return null;
  const names = ids.map(id => criticalObjects[id]?.name ?? id).join(", ");
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 2, alignItems: "flex-end" }}>
      <span style={{ flexShrink: 0, fontSize: 9, color, lineHeight: "14px" }}>{dot}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color, marginRight: 4 }}>{label}:</span>
        <span style={{ fontSize: 9, color: "#94a3b8", wordBreak: "break-word" }}>{names}</span>
      </div>
    </div>
  );
}

export function OperationLogOverlay({ entries, criticalObjects, onClear, variant = "float" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries.length]);

  // In panel mode always render (column is always visible)
  if (variant === "float" && entries.length === 0) return null;

  const isRunning = entries[entries.length - 1]?.type === "start";

  // Panel mode: fill the parent column, no fixed positioning
  if (variant === "panel") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Header */}
        <div style={{
          padding: "6px 12px",
          background: "#1e293b",
          borderBottom: "1px solid #334155",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isRunning && (
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "#ef4444",
                animation: "pulse 1s ease-in-out infinite",
                flexShrink: 0,
              }} />
            )}
            <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em" }}>
              LOG · {entries.length} wpisów
            </span>
          </div>
          {entries.length > 0 && (
            <button
              onClick={onClear}
              style={{
                fontSize: 9, fontWeight: 700, padding: "2px 7px",
                borderRadius: 3, border: "1px solid #334155",
                background: "transparent", color: "#475569",
                cursor: "pointer", letterSpacing: "0.06em",
              }}
            >CLSÄ</button>
          )}
        </div>
        {/* Entries */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin" }}>
          {entries.length === 0 ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", color: "#1e3a5f", fontSize: 12 }}>
              — brak wpisów —
            </div>
          ) : (
            entries.map(entry => <EntryRow key={entry.id} entry={entry} criticalObjects={criticalObjects} />)
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      left: 12,
      zIndex: 9999,
      width: 380,
      maxHeight: "50vh",
      display: "flex",
      flexDirection: "column",
      background: "rgba(15, 23, 42, 0.93)",
      backdropFilter: "blur(10px)",
      border: "1px solid #334155",
      borderRadius: 10,
      overflow: "hidden",
      boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
      pointerEvents: "auto",
    }}>

      {/* Header */}
      <div style={{
        padding: "6px 12px",
        background: "#1e293b",
        borderBottom: "1px solid #334155",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isRunning && (
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#f97316",
              flexShrink: 0,
              animation: "op-blink 1s ease-in-out infinite",
            }} />
          )}
          <span style={{
            fontSize: 10, fontWeight: 700, color: "#64748b",
            letterSpacing: "0.1em", fontFamily: "'Courier New', monospace",
          }}>
            LOG OPERACYJNY
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9, color: "#334155", fontFamily: "monospace" }}>
            {entries.length} wpisów
          </span>
          <button
            onClick={onClear}
            style={{
              background: "transparent", border: "none",
              color: "#475569", cursor: "pointer",
              fontSize: 12, padding: "1px 2px", lineHeight: 1,
            }}
            title="Wyczyść log"
          >✕</button>
        </div>
      </div>
      <style>{`@keyframes op-blink{0%,100%{opacity:1}50%{opacity:.3}}`}</style>

      {/* Entries */}
      <div ref={scrollRef} style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
        {entries.map(entry => (
          <EntryRow key={entry.id} entry={entry} criticalObjects={criticalObjects} />
        ))}
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  criticalObjects,
}: {
  entry: LogEntry;
  criticalObjects: Record<string, CriticalObject>;
}) {
  const fontMono: React.CSSProperties = { fontFamily: "'Courier New', monospace" };

  if (entry.type === "start") {
    const icon = THREAT_ICON[entry.threatType ?? ""] ?? "🎯";
    return (
      <div style={{
        padding: "5px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.03)",
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
      }}>
        <span style={{ ...fontMono, fontSize: 9, color: "#334155", flexShrink: 0, marginTop: 1 }}>
          {entry.time}
        </span>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
            <span style={{ fontSize: 10 }}>{icon}</span>
            <span style={{ ...fontMono, fontSize: 10, fontWeight: 700, color: "#f97316" }}>
              SYMULACJA · START
            </span>
            <span style={{
              ...fontMono, fontSize: 9, fontWeight: 700,
              padding: "0 4px", borderRadius: 3,
              background: "#172554", border: "1px solid #1e3a8a", color: "#93c5fd",
            }}>
              {(entry.threatType ?? "?").toUpperCase()}
            </span>
          </div>
          <div style={{ ...fontMono, fontSize: 10, color: "#94a3b8" }}>
            {entry.objectName}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: "#f97316",
              animation: "op-blink 1s ease-in-out infinite",
              flexShrink: 0,
            }} />
            <span style={{ ...fontMono, fontSize: 9, color: "#64748b" }}>
              Analizuję kaskadę… (do 120s)
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (entry.type === "error") {
    return (
      <div style={{
        padding: "5px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.03)",
        borderLeft: "3px solid #ef4444",
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
      }}>
        <span style={{ ...fontMono, fontSize: 9, color: "#334155", flexShrink: 0, marginTop: 1 }}>
          {entry.time}
        </span>
        <div>
          <span style={{ ...fontMono, fontSize: 10, fontWeight: 700, color: "#ef4444" }}>
            ⚠ BŁĄD SYMULACJI
          </span>
          <div style={{ ...fontMono, fontSize: 9, color: "#64748b", marginTop: 2 }}>
            {entry.objectName}
          </div>
        </div>
      </div>
    );
  }

  // type === "result"
  const r = entry.result!;
  const sevColor = SEV_COLOR[r.impact.severity] ?? "#94a3b8";
  const icon = THREAT_ICON[r.threat_type] ?? "💥";
  const hasAny = r.impact.total_affected > 0;

  return (
    <div style={{
      padding: "6px 12px",
      borderBottom: "1px solid rgba(255,255,255,0.03)",
      borderLeft: `3px solid ${sevColor}`,
    }}>
      {/* Severity header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ ...fontMono, fontSize: 9, color: "#334155", flexShrink: 0 }}>
          {entry.time}
        </span>
        <span style={{
          ...fontMono, fontSize: 10, fontWeight: 800,
          color: sevColor, letterSpacing: "0.06em",
        }}>
          {r.impact.severity}
        </span>
        <span style={{ fontSize: 10 }}>{icon}</span>
        <span style={{ ...fontMono, fontSize: 10, color: "#e2e8f0", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.object_name}
        </span>
        <span style={{ ...fontMono, fontSize: 9, color: "#475569", flexShrink: 0 }}>
          {r.impact.total_affected > 0 ? `+${r.impact.total_affected}` : "0"}
        </span>
      </div>

      {/* Cascade tiers */}
      {hasAny ? (
        <div style={{
          background: "rgba(255,255,255,0.02)",
          borderRadius: 4,
          padding: "4px 6px",
        }}>
          <TierRow dot="●" label="NATYCHMIAST" color="#ef4444" ids={r.impact.immediate} criticalObjects={criticalObjects} />
          <TierRow dot="●" label="4H" color="#f97316" ids={r.impact.cascade_4h} criticalObjects={criticalObjects} />
          <TierRow dot="●" label="8H" color="#eab308" ids={r.impact.cascade_8h} criticalObjects={criticalObjects} />
          <TierRow dot="○" label="ODPORNE &gt;8H" color="#475569" ids={r.impact.cascade_t3} criticalObjects={criticalObjects} />
        </div>
      ) : (
        <div style={{ ...fontMono, fontSize: 9, color: "#334155", paddingLeft: 4 }}>
          brak kaskady zależności
        </div>
      )}

      {/* Critical count */}
      {r.impact.critical_affected > 0 && (
        <div style={{ ...fontMono, fontSize: 9, color: "#94a3b8", marginTop: 4 }}>
          Obiektów krytycznych (≥4): <span style={{ color: sevColor, fontWeight: 700 }}>{r.impact.critical_affected}</span>
          {r.rag_chunks_used > 0 && (
            <span style={{ color: "#1e3a5f", marginLeft: 8 }}>
              · RAG {r.rag_chunks_used}×
            </span>
          )}
        </div>
      )}
    </div>
  );
}
