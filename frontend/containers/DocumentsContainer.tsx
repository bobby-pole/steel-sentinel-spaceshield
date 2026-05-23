import React, { useState, useEffect, useRef } from 'react';

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
    chunk_idx?: number;
    category?: string;
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

function docIcon(source: string): string {
  if (source.endsWith('.pdf'))  return '📄';
  if (source.endsWith('.md'))   return '📝';
  if (source === 'infrastructure.json') return '🏗️';
  if (source === 'dependencies.json')   return '⚡';
  return '📂';
}

function docColor(type: string): string {
  if (type === 'document')       return '#f97316';
  if (type === 'infrastructure') return '#38bdf8';
  if (type === 'facility')       return '#a78bfa';
  return '#94a3b8';
}

function docLabel(source: string): string {
  if (source === 'infrastructure.json') return 'Infrastruktura krytyczna (OSM)';
  if (source === 'dependencies.json')   return 'Graf zależności';
  return source;
}

export const DocumentsContainer: React.FC = () => {
  const [documents, setDocuments]   = useState<RagDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError]   = useState<string | null>(null);

  const [messages, setMessages]     = useState<ChatMessage[]>([
    {
      id: '0',
      role: 'agent',
      content: 'Gotowy do pracy. Zadaj pytanie o procedury, infrastrukturę lub plany kryzysowe.',
    },
  ]);
  const [chatInput, setChatInput]   = useState('');
  const [querying, setQuerying]     = useState(false);

  const [activeChunks, setActiveChunks] = useState<RagChunk[] | null>(null);
  const [activeAnswer, setActiveAnswer] = useState<string>('');

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/rag/documents')
      .then(r => r.json())
      .then((data: { documents?: RagDocument[]; error?: string }) => {
        if (data.error) setDocsError(data.error);
        else setDocuments(data.documents ?? []);
      })
      .catch(() => setDocsError('Nie można pobrać listy dokumentów'))
      .finally(() => setDocsLoading(false));
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = chatInput.trim();
    if (!q || querying) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: q };
    const loadingMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'agent',
      content: '',
      loading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setChatInput('');
    setQuerying(true);

    try {
      const resp = await fetch('/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, n_results: 6 }),
      });
      const data = await resp.json() as {
        answer?: string;
        chunks?: RagChunk[];
        error?: string;
      };

      const chunks  = data.chunks ?? [];
      const answer  = data.answer ?? '';
      const content = answer || (data.error ? `Błąd: ${data.error}` : 'Brak odpowiedzi z modelu. Widoczne są dopasowane fragmenty dokumentów.');

      setMessages(prev =>
        prev.map(m =>
          m.loading ? { ...m, content, chunks, loading: false } : m
        )
      );

      setActiveChunks(chunks);
      setActiveAnswer(answer);
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.loading ? { ...m, content: 'Błąd połączenia z backendem.', loading: false } : m
        )
      );
    } finally {
      setQuerying(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', backgroundColor: '#0f172a', color: '#e2e8f0' }}>

      {/* Kolumna 1: Lista dokumentów */}
      <div style={{
        width: 280,
        flexShrink: 0,
        borderRight: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem',
        overflowY: 'auto',
      }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: 600, color: '#94a3b8' }}>
          BAZA DOKUMENTÓW
        </h2>

        {docsLoading && (
          <div style={{ color: '#64748b', fontSize: 13 }}>Ładowanie indeksu RAG…</div>
        )}
        {docsError && (
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#ef444415',
            border: '1px solid #ef444430',
            borderRadius: '0.5rem',
            fontSize: 12,
            color: '#f87171',
          }}>
            {docsError}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {documents.map(doc => {
            const color = docColor(doc.type);
            return (
              <div
                key={doc.source}
                style={{
                  padding: '0.6rem 0.75rem',
                  backgroundColor: '#1e293b',
                  borderRadius: '0.375rem',
                  border: `1px solid ${color}22`,
                  cursor: 'default',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
                    {docIcon(doc.source)}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, wordBreak: 'break-word', lineHeight: 1.4 }}>
                    {docLabel(doc.source)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 3,
                    backgroundColor: `${color}20`,
                    color,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                  }}>
                    {doc.type.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 10, color: '#475569' }}>
                    {doc.chunk_count} fragmentów
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Kolumna 2: Chat RAG */}
      <div style={{ flex: 1.5, borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #334155', backgroundColor: '#1e293b' }}>
          <h2 style={{ fontSize: '1rem', margin: 0, fontWeight: 600 }}>Agent Dowodzenia (RAG)</h2>
        </div>

        <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                backgroundColor: msg.role === 'user' ? '#3b82f6' : '#1e293b',
                border: msg.role === 'agent' ? '1px solid #334155' : 'none',
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                maxWidth: '85%',
                wordBreak: 'break-word',
              }}
            >
              <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: msg.role === 'user' ? '#bfdbfe' : '#64748b' }}>
                {msg.role === 'user' ? 'Operator' : 'AI Agent'}
              </div>
              {msg.loading ? (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', color: '#64748b', fontSize: 13 }}>
                  <span style={{ animation: 'blink 1s infinite' }}>●</span>
                  <span style={{ animation: 'blink 1s infinite 0.3s' }}>●</span>
                  <span style={{ animation: 'blink 1s infinite 0.6s' }}>●</span>
                  <style>{`@keyframes blink { 0%,100%{opacity:0.2} 50%{opacity:1} }`}</style>
                </div>
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>{msg.content}</div>
              )}
              {msg.chunks && msg.chunks.length > 0 && (
                <button
                  onClick={() => { setActiveChunks(msg.chunks!); setActiveAnswer(msg.content); }}
                  style={{
                    marginTop: '0.5rem',
                    fontSize: 11,
                    padding: '2px 8px',
                    background: '#334155',
                    border: '1px solid #475569',
                    borderRadius: 4,
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  {msg.chunks.length} źródeł
                </button>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #334155', backgroundColor: '#1e293b' }}>
          <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              disabled={querying}
              placeholder="Pytaj o procedury, infrastrukturę, plany kryzysowe…"
              style={{
                flex: 1,
                padding: '0.6rem 0.75rem',
                borderRadius: '0.25rem',
                border: '1px solid #475569',
                backgroundColor: '#0f172a',
                color: 'white',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={querying || !chatInput.trim()}
              style={{
                padding: '0.6rem 1.25rem',
                backgroundColor: querying ? '#334155' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: querying ? 'default' : 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {querying ? '…' : 'Wyślij'}
            </button>
          </form>
        </div>
      </div>

      {/* Kolumna 3: Fragmenty z RAG */}
      <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: 600, color: '#94a3b8' }}>
          DOPASOWANE FRAGMENTY
        </h2>

        {!activeChunks && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', textAlign: 'center', padding: '2rem', fontSize: 13 }}>
            Wyślij pytanie, aby zobaczyć fragmenty dokumentów użyte do odpowiedzi.
          </div>
        )}

        {activeChunks && activeChunks.length === 0 && (
          <div style={{ color: '#64748b', fontSize: 13 }}>Brak pasujących fragmentów.</div>
        )}

        {activeChunks && activeChunks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activeChunks.map((chunk, idx) => {
              const score = Math.round(chunk.score * 100);
              const page  = chunk.metadata.page;
              return (
                <div
                  key={idx}
                  style={{
                    backgroundColor: '#1e293b',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #334155',
                    borderLeft: `3px solid ${score > 60 ? '#22c55e' : score > 40 ? '#eab308' : '#64748b'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600, wordBreak: 'break-all' }}>
                      {docIcon(chunk.metadata.source)} {chunk.metadata.source}
                      {page ? ` · s. ${page}` : ''}
                    </span>
                    <span style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 3,
                      flexShrink: 0,
                      background: score > 60 ? '#22c55e20' : '#eab30820',
                      color:      score > 60 ? '#4ade80'   : '#fbbf24',
                      fontWeight: 700,
                    }}>
                      {score}%
                    </span>
                  </div>
                  <p style={{ fontSize: 12, lineHeight: 1.6, color: '#cbd5e1', margin: 0, fontStyle: 'italic' }}>
                    "{chunk.text.slice(0, 280)}{chunk.text.length > 280 ? '…' : ''}"
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};

export default DocumentsContainer;
