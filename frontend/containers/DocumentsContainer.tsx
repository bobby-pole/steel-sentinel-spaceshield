import React, { useState, useEffect, useRef } from 'react';
import type { HighlightLocation } from '../src/App';

interface RagDocument {
  source: string;
  type: string;
  chunk_count: number;
}

interface RagChunk {
  text: string;
  metadata: {
    source: string;
    type?: string;
    page?: number;
    category?: string;
    name?: string;
    lat?: number;
    lon?: number;
  };
  score: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  chunks?: RagChunk[];
  loading?: boolean;
}

interface Tooltip {
  x: number;
  y: number;
  chunk: RagChunk;
  idx: number;
}

function docIcon(source: string, category?: string) {
  if (source.endsWith('.pdf')) return '📄';
  if (source.endsWith('.md'))  return '📝';
  if (source === 'infrastructure.json' || source === 'dependencies.json') {
    if (category === 'bridge')                                  return '🌉';
    if (category === 'hospital')                                return '🏥';
    if (category === 'fire_station')                            return '🚒';
    if (category === 'police')                                  return '🚔';
    if (category === 'power_plant' || category === 'substation' || category === 'power_line') return '⚡';
    if (category === 'water_works' || category === 'pumping_station' || category === 'water_tower' || category === 'water_zone') return '💧';
    if (category === 'building')                                return '🏛️';
    if (category === 'industrial')                              return '🏭';
    if (source === 'dependencies.json')                         return '⚡';
    return '🏗️';
  }
  return '📂';
}

function docColor(type: string) {
  if (type === 'document')       return '#f97316';
  if (type === 'infrastructure') return '#38bdf8';
  if (type === 'facility')       return '#a78bfa';
  return '#94a3b8';
}

function docLabel(source: string) {
  if (source === 'infrastructure.json') return 'Infrastruktura krytyczna (OSM)';
  if (source === 'dependencies.json')   return 'Graf zależności';
  return source;
}

// ---------------------------------------------------------------------------
// Parsowanie tekstu odpowiedzi AI: **bold** + klikalne współrzędne
// ---------------------------------------------------------------------------
const COORD_RE = /(\d{1,2}\.\d{3,6})°N,\s*(\d{1,2}\.\d{3,6})°E/g;

function renderBold(text: string): React.ReactNode[] {
  const parts = text.split(/\*\*([^*]+)\*\*/);
  return parts.map((p, i) =>
    i % 2 === 1
      ? <strong key={i} style={{ color: '#e2e8f0', fontWeight: 700 }}>{p}</strong>
      : (p as React.ReactNode)
  );
}

function renderSegment(text: string): React.ReactNode[] {
  return renderBold(text);
}

function renderAgentText(
  text: string,
  chunks: RagChunk[] | undefined,
  onCoord: (lat: number, lon: number, name: string, cat?: string) => void
): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  COORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = COORD_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(...renderSegment(text.slice(last, m.index)));

    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);

    // Spróbuj dopasować chunk po współrzędnych (tolerancja ~100 m)
    const hit = chunks?.find(c =>
      c.metadata.lat !== undefined && c.metadata.lon !== undefined &&
      Math.abs(c.metadata.lat - lat) < 0.001 &&
      Math.abs(c.metadata.lon - lon) < 0.001
    );
    const name = hit?.metadata.name || hit?.metadata.source || 'Lokalizacja';
    const cat  = hit?.metadata.category || hit?.metadata.type;

    nodes.push(
      <span
        key={`coord${m.index}`}
        onClick={() => onCoord(lat, lon, name, cat)}
        title="Pokaż na mapie"
        style={{
          color: '#f59e0b', cursor: 'pointer', fontWeight: 600,
          textDecoration: 'underline', textDecorationStyle: 'dotted',
          borderRadius: 2,
        }}
      >
        📍 {m[1]}°N, {m[2]}°E
      </span>
    );
    last = m.index + m[0].length;
  }

  if (last < text.length) nodes.push(...renderSegment(text.slice(last)));
  return <>{nodes}</>;
}

// ---------------------------------------------------------------------------

function scoreColor(score: number) {
  if (score >= 0.80) return { bg: '#22c55e20', fg: '#4ade80', border: '#22c55e44' };
  if (score >= 0.70) return { bg: '#eab30820', fg: '#fbbf24', border: '#eab30844' };
  return               { bg: '#64748b20', fg: '#94a3b8', border: '#64748b44' };
}

// ---------------------------------------------------------------------------
// Thread persistence (localStorage)
// ---------------------------------------------------------------------------
interface ConversationThread {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  messages: ChatMessage[];
}

const STORAGE_KEY = 'ss_threads';
const INITIAL_MSG: ChatMessage = {
  id: '0', role: 'agent',
  content: 'Gotowy do pracy. Zadaj pytanie o procedury, infrastrukturę lub plany kryzysowe.',
};

function loadThreads(): ConversationThread[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch { return []; }
}

function saveThreads(threads: ConversationThread[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

function newThread(): ConversationThread {
  return {
    id: Date.now().toString(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: 'Nowy wątek',
    messages: [INITIAL_MSG],
  };
}

function threadTitle(messages: ChatMessage[]): string {
  const first = messages.find(m => m.role === 'user');
  if (!first) return 'Nowy wątek';
  return first.content.length > 44 ? first.content.slice(0, 42) + '…' : first.content;
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------

interface DocumentsContainerProps {
  onShowOnMap?: (loc: HighlightLocation) => void;
}

export const DocumentsContainer: React.FC<DocumentsContainerProps> = ({ onShowOnMap }) => {
  const [documents,   setDocuments]   = useState<RagDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError,   setDocsError]   = useState<string | null>(null);

  // Thread state — single localStorage read shared across two useState calls
  const [initialData] = useState(() => {
    const stored = loadThreads();
    if (stored.length > 0) {
      return { threads: stored, activeId: stored[0].id };
    } else {
      const t = newThread();
      return { threads: [t], activeId: t.id };
    }
  });

  const [threads,        setThreads]        = useState<ConversationThread[]>(initialData.threads);
  const [activeThreadId, setActiveThreadId] = useState<string>(initialData.activeId);

  const activeThread = threads.find(t => t.id === activeThreadId) ?? threads[0];
  const messages = activeThread?.messages ?? [INITIAL_MSG];

  const setMessages = (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setThreads(prev => prev.map(t => {
      if (t.id !== activeThreadId) return t;
      const next = typeof updater === 'function' ? updater(t.messages) : updater;
      const updated = { ...t, messages: next, updatedAt: Date.now(), title: threadTitle(next) };
      return updated;
    }));
  };

  // Persist threads to localStorage whenever they change
  useEffect(() => { saveThreads(threads); }, [threads]);

  const [chatInput, setChatInput] = useState('');
  const [querying,  setQuerying]  = useState(false);
  const [tooltip,   setTooltip]   = useState<Tooltip | null>(null);

  const [indexing,  setIndexing]  = useState(false);
  const [indexProg, setIndexProg] = useState<{ done: number; total: number; filename: string }>({ done: 0, total: 0, filename: '' });
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef   = useRef<HTMLDivElement>(null);

  const fetchDocs = () => {
    fetch('/api/rag/documents')
      .then(r => r.json())
      .then((d: { documents?: RagDocument[]; error?: string }) => {
        if (d.error) setDocsError(d.error);
        else setDocuments(d.documents ?? []);
      })
      .catch(() => setDocsError('Nie można pobrać listy dokumentów'))
      .finally(() => setDocsLoading(false));
  };

  useEffect(() => { fetchDocs(); }, []);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const r = await fetch('/api/rag/status');
      const s = await r.json() as { running: boolean; filename: string; done: number; total: number; error: string };
      setIndexProg({ done: s.done, total: s.total, filename: s.filename });
      if (!s.running) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setIndexing(false);
        if (s.error) setUploadErr(s.error);
        else { setUploadErr(null); fetchDocs(); }
      }
    }, 800);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadErr(null);

    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch('/api/rag/upload', { method: 'POST', body: fd });
    const data = await resp.json() as { ok?: boolean; error?: string; filename?: string };

    if (data.error) { setUploadErr(data.error); return; }
    setIndexing(true);
    setIndexProg({ done: 0, total: 0, filename: file.name });
    startPolling();
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeThreadId]);

  const handleNewThread = () => {
    const t = newThread();
    setThreads(prev => [t, ...prev]);
    setActiveThreadId(t.id);
    setChatInput('');
  };

  const handleSwitchThread = (id: string) => {
    setActiveThreadId(id);
    setChatInput('');
    setTooltip(null);
  };

  const handleDeleteThread = (id: string) => {
    setThreads(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        const t = newThread();
        setActiveThreadId(t.id);
        return [t];
      }
      if (id === activeThreadId) setActiveThreadId(next[0].id);
      return next;
    });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = chatInput.trim();
    if (!q || querying) return;

    const userMsg:    ChatMessage = { id: Date.now().toString(),       role: 'user',  content: q };
    const loadingMsg: ChatMessage = { id: (Date.now()+1).toString(),   role: 'agent', content: '', loading: true };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setChatInput('');
    setQuerying(true);

    try {
      const resp = await fetch('/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, n_results: 8 }),
      });
      const data = await resp.json() as { answer?: string; chunks?: RagChunk[]; error?: string };
      const chunks  = data.chunks ?? [];
      const content = data.answer || (data.error ? `Błąd: ${data.error}` : 'Brak odpowiedzi z modelu.');
      setMessages(prev => prev.map(m => m.loading ? { ...m, content, chunks, loading: false } : m));
    } catch {
      setMessages(prev => prev.map(m => m.loading ? { ...m, content: 'Błąd połączenia z backendem.', loading: false } : m));
    } finally {
      setQuerying(false);
    }
  };

  const showTooltip = (e: React.MouseEvent, chunk: RagChunk, idx: number) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ x: rect.left + rect.width / 2, y: rect.top, chunk, idx });
  };

  return (
    <div style={{ display: 'flex', height: '100%', backgroundColor: '#0f172a', color: '#e2e8f0', position: 'relative' }}>

      {/* ── Kolumna 1: Baza dokumentów (20%) ── */}
      <div style={{ flex: '0 0 20%', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #334155', backgroundColor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h2 style={{ fontSize: '0.8rem', margin: 0, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em' }}>BAZA DOKUMENTÓW</h2>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={indexing}
            title="Dodaj dokument (PDF lub MD)"
            style={{
              width: 26, height: 26, borderRadius: 5, flexShrink: 0,
              background: indexing ? '#1e293b' : '#3b82f620',
              border: `1px solid ${indexing ? '#334155' : '#3b82f644'}`,
              color: indexing ? '#475569' : '#60a5fa',
              fontSize: 16, lineHeight: 1, cursor: indexing ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >+</button>
          <input ref={fileInputRef} type="file" accept=".pdf,.md" style={{ display: 'none' }} onChange={handleFileChange} />
        </div>

        {indexing && (
          <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #334155', background: '#0f172a' }}>
            <div style={{ fontSize: 10, color: '#60a5fa', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Indeksowanie: {indexProg.filename}
            </div>
            <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2, background: '#3b82f6',
                width: indexProg.total > 0 ? `${Math.round(indexProg.done / indexProg.total * 100)}%` : '5%',
                transition: 'width 0.4s ease',
              }} />
            </div>
            <div style={{ fontSize: 9, color: '#475569', marginTop: 3 }}>
              {indexProg.total > 0 ? `${indexProg.done} / ${indexProg.total} fragmentów` : 'parsowanie…'}
            </div>
          </div>
        )}
        {uploadErr && (
          <div style={{ margin: '0.5rem 0.75rem', padding: '0.4rem 0.6rem', background: '#ef444415', border: '1px solid #ef444430', borderRadius: 5, fontSize: 10, color: '#f87171' }}>
            {uploadErr}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docsLoading && <div style={{ color: '#475569', fontSize: 12 }}>Ładowanie indeksu RAG…</div>}
          {docsError && (
            <div style={{ padding: '0.6rem', background: '#ef444415', border: '1px solid #ef444430', borderRadius: 6, fontSize: 11, color: '#f87171' }}>
              {docsError}
            </div>
          )}
          {documents.map(doc => {
            const color = docColor(doc.type);
            return (
              <div key={doc.source} style={{ padding: '0.5rem 0.65rem', background: '#1e293b', borderRadius: 6, border: `1px solid ${color}22` }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 13, flexShrink: 0 }}>{docIcon(doc.source, doc.type)}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, wordBreak: 'break-word', lineHeight: 1.4, color: '#cbd5e1' }}>
                    {docLabel(doc.source)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${color}20`, color, fontWeight: 700, letterSpacing: '0.05em' }}>
                    {doc.type.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 9, color: '#475569' }}>{doc.chunk_count} fragmentów</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Kolumna 2: Chat (50%) ── */}
      <div style={{ flex: '0 0 50%', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Nagłówek */}
        <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #1e293b', backgroundColor: '#1e293b' }}>
          <h2 style={{ fontSize: '0.8rem', margin: 0, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em' }}>AGENT DOWODZENIA (RAG)</h2>
        </div>

        {/* Zakładki wątków */}
        <div style={{
          display: 'flex', alignItems: 'stretch', gap: 0,
          borderBottom: '1px solid #334155',
          backgroundColor: '#0f172a',
          overflowX: 'auto',
          flexShrink: 0,
          scrollbarWidth: 'none',
        }}>
          {threads.map(thread => {
            const isActive = thread.id === activeThreadId;
            const label = thread.title.length > 22 ? thread.title.slice(0, 20) + '…' : thread.title;
            return (
              <div
                key={thread.id}
                onClick={() => handleSwitchThread(thread.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '0.4rem 0.65rem',
                  borderRight: '1px solid #1e293b',
                  borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                  background: isActive ? '#1e293b' : 'transparent',
                  cursor: 'pointer',
                  flexShrink: 0,
                  maxWidth: 180,
                  transition: 'background 0.12s',
                }}
                title={`${thread.title} (${fmtDate(thread.updatedAt)})`}
              >
                <span style={{
                  fontSize: 11, fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#e2e8f0' : '#64748b',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  lineHeight: 1.3,
                }}>
                  {label}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteThread(thread.id); }}
                  title="Zamknij wątek"
                  style={{
                    flexShrink: 0, width: 14, height: 14, borderRadius: 2,
                    background: 'transparent', border: 'none',
                    color: '#475569', fontSize: 12, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, padding: 0, marginLeft: 2,
                  }}
                >×</button>
              </div>
            );
          })}
          {/* Przycisk nowego wątku */}
          <button
            onClick={handleNewThread}
            title="Nowy wątek"
            style={{
              flexShrink: 0, width: 32, alignSelf: 'stretch',
              background: 'transparent', border: 'none',
              borderRight: '1px solid #1e293b',
              color: '#475569', fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#60a5fa')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
          >+</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map(msg => (
            <div key={msg.id} style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              <div style={{
                background: msg.role === 'user' ? '#3b82f6' : '#1e293b',
                border: msg.role === 'agent' ? '1px solid #334155' : 'none',
                padding: '0.65rem 0.9rem',
                borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                wordBreak: 'break-word',
              }}>
                <div style={{ fontSize: 10, marginBottom: 4, color: msg.role === 'user' ? '#bfdbfe' : '#475569', fontWeight: 600, letterSpacing: '0.05em' }}>
                  {msg.role === 'user' ? 'OPERATOR' : 'AI AGENT'}
                </div>
                {msg.loading ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[0, 0.25, 0.5].map((delay, i) => (
                      <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#475569', display: 'inline-block', animation: `rag-blink 1s ${delay}s infinite` }} />
                    ))}
                    <style>{`@keyframes rag-blink{0%,100%{opacity:.2}50%{opacity:1}}`}</style>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, lineHeight: 1.65, color: msg.role === 'user' ? 'white' : '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                    {msg.role === 'agent' && onShowOnMap
                      ? renderAgentText(msg.content, msg.chunks, (lat, lon, name, cat) =>
                          onShowOnMap({ lat, lon, name, category: cat }))
                      : msg.content}
                  </div>
                )}
              </div>

              {/* Numerowane odwołania do źródeł */}
              {!msg.loading && msg.chunks && msg.chunks.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 4 }}>
                  {msg.chunks.map((chunk, idx) => {
                    const c = scoreColor(chunk.score);
                    const hasLocation = chunk.metadata.lat !== undefined && chunk.metadata.lon !== undefined;
                    return (
                      <div
                        key={idx}
                        onMouseEnter={e => showTooltip(e, chunk, idx + 1)}
                        onMouseLeave={() => setTooltip(null)}
                        onClick={hasLocation && onShowOnMap ? () => onShowOnMap({
                          lat: chunk.metadata.lat!,
                          lon: chunk.metadata.lon!,
                          name: chunk.metadata.name || chunk.metadata.source,
                          category: chunk.metadata.category || chunk.metadata.type,
                        }) : undefined}
                        style={{
                          width: 22, height: 22,
                          borderRadius: 4,
                          background: c.bg,
                          border: `1px solid ${c.border}`,
                          color: c.fg,
                          fontSize: 10,
                          fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: hasLocation ? 'pointer' : 'default',
                          userSelect: 'none',
                          flexShrink: 0,
                          position: 'relative',
                        }}
                        title={hasLocation ? `Pokaż na mapie: ${chunk.metadata.name || chunk.metadata.source}` : undefined}
                      >
                        {idx + 1}
                        {hasLocation && (
                          <span style={{
                            position: 'absolute', top: -4, right: -4,
                            width: 8, height: 8, borderRadius: '50%',
                            background: '#f59e0b', border: '1px solid #0f172a',
                            pointerEvents: 'none',
                          }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #334155', backgroundColor: '#1e293b' }}>
          <form onSubmit={handleSend} style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              disabled={querying}
              placeholder="Pytaj o procedury, infrastrukturę, plany kryzysowe…"
              style={{ flex: 1, padding: '0.55rem 0.75rem', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: 13, outline: 'none' }}
            />
            <button type="submit" disabled={querying || !chatInput.trim()} style={{
              padding: '0.55rem 1.1rem', background: querying ? '#1e293b' : '#3b82f6',
              color: querying ? '#475569' : 'white', border: '1px solid #334155',
              borderRadius: 6, cursor: querying ? 'default' : 'pointer', fontWeight: 700, fontSize: 13,
            }}>
              {querying ? '…' : 'Wyślij'}
            </button>
          </form>
        </div>
      </div>

      {/* ── Kolumna 3: Log operacyjny (30%) ── */}
      <div style={{ flex: '0 0 30%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #334155', backgroundColor: '#1e293b' }}>
          <h2 style={{ fontSize: '0.8rem', margin: 0, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em' }}>LOG OPERACYJNY</h2>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 12, color: '#1e3a5f', userSelect: 'none' }}>— brak wpisów —</span>
        </div>
      </div>

      {/* ── Tooltip (fixed, nad kursorem) ── */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: Math.min(tooltip.x, window.innerWidth - 340),
          top: tooltip.y - 12,
          transform: 'translateY(-100%)',
          zIndex: 9999,
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: '0.7rem 0.85rem',
          width: 320,
          boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
          pointerEvents: 'none',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {docIcon(tooltip.chunk.metadata.source, tooltip.chunk.metadata.category || tooltip.chunk.metadata.type)}
              {' '}
              {tooltip.chunk.metadata.name
                ? tooltip.chunk.metadata.name
                : tooltip.chunk.metadata.source}
              {tooltip.chunk.metadata.page ? ` · s. ${tooltip.chunk.metadata.page}` : ''}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                ...(() => { const c = scoreColor(tooltip.chunk.score); return { background: c.bg, color: c.fg, border: `1px solid ${c.border}` }; })()
              }}>
                {Math.round(tooltip.chunk.score * 100)}%
              </span>
              <span style={{ fontSize: 9, color: '#475569', background: '#1e293b', border: '1px solid #334155', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>
                #{tooltip.idx}
              </span>
            </div>
          </div>
          {(tooltip.chunk.metadata.category || tooltip.chunk.metadata.type) && (
            <div style={{ marginBottom: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {tooltip.chunk.metadata.category && (
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#38bdf820', color: '#38bdf8', border: '1px solid #38bdf840', fontWeight: 700, letterSpacing: '0.05em' }}>
                  {tooltip.chunk.metadata.category.replace(/_/g, ' ').toUpperCase()}
                </span>
              )}
              {tooltip.chunk.metadata.source && (
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#1e293b', color: '#475569', border: '1px solid #334155', fontWeight: 600 }}>
                  {tooltip.chunk.metadata.source}
                </span>
              )}
            </div>
          )}
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.65, color: '#94a3b8', fontStyle: 'italic' }}>
            "{tooltip.chunk.text.slice(0, 300)}{tooltip.chunk.text.length > 300 ? '…' : ''}"
          </p>
        </div>
      )}
    </div>
  );
};

export default DocumentsContainer;
