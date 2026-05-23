import React, { useState } from 'react';

// Mock Types
type Document = {
  id: string;
  name: string;
  date: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'agent';
  content: string;
};

type ProcedureMatch = {
  docName: string;
  snippet: string;
};

type UnitCommand = {
  unitId: string;
  commandText: string;
  procedures: ProcedureMatch[];
};

export const DocumentsContainer: React.FC = () => {
  // State for Column 1: Documents
  const [documents, setDocuments] = useState<Document[]>([
    { id: '1', name: 'Procedura Ewakuacji Medycznej (MEDEVAC).pdf', date: '2026-05-20' },
    { id: '2', name: 'Zasady Rozpoznania Dronami (UAV).docx', date: '2026-05-21' },
    { id: '3', name: 'Regulamin Zespołu Inżynieryjnego.pdf', date: '2026-05-22' }
  ]);
  const [newDocName, setNewDocName] = useState('');

  // State for Column 2: Chat
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'agent', content: 'Cześć! Wprowadź polecenie operacyjne, a ja przygotuję rozkazy i znajdę odpowiednie procedury.' }
  ]);
  const [chatInput, setChatInput] = useState('');

  // State for Column 3: Generated Commands & Procedures
  const [activeCommand, setActiveCommand] = useState<UnitCommand | null>(null);

  const handleAddDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocName.trim()) return;
    const newDoc: Document = {
      id: Date.now().toString(),
      name: newDocName,
      date: new Date().toISOString().split('T')[0]
    };
    setDocuments([...documents, newDoc]);
    setNewDocName('');
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput
    };
    
    setMessages(prev => [...prev, userMessage]);
    setChatInput('');

    // Mock AI Processing Delay
    setTimeout(() => {
      const agentMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: `Przeanalizowałem polecenie operacyjne. Wydaję rozkaz dla jednostki oraz załączam wymagane procedury na podstawie dokumentacji z bazy RAG.`
      };
      setMessages(prev => [...prev, agentMessage]);

      // Mock Generated Command for the 3rd column
      setActiveCommand({
        unitId: 'Zespół Bravo',
        commandText: 'Przygotować się do ewakuacji z rejonu operacyjnego. Zabezpieczyć punkt zborny i oczekiwać na drona Delta w celu weryfikacji trasy.',
        procedures: [
          {
            docName: 'Procedura Ewakuacji Medycznej (MEDEVAC).pdf',
            snippet: 'Podczas ewakuacji należy zabezpieczyć punkt zborny przed przybyciem jednostek wsparcia i oczekiwać na zwiad lotniczy.'
          },
          {
            docName: 'Zasady Rozpoznania Dronami (UAV).docx',
            snippet: 'Drony wsparcia (np. Dron Delta) przeprowadzają weryfikację trasy ewakuacyjnej, oznaczając potencjalne zagrożenia.'
          }
        ]
      });
    }, 1500);
  };

  return (
    <div style={{ display: 'flex', height: '100%', backgroundColor: '#0f172a', color: '#e2e8f0' }}>
      
      {/* Column 1: Document List */}
      <div style={{ flex: 1, borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', padding: '1rem', overflowY: 'auto' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 600 }}>Baza Dokumentów</h2>
        
        <form onSubmit={handleAddDocument} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <input
            type="text"
            value={newDocName}
            onChange={(e) => setNewDocName(e.target.value)}
            placeholder="Nazwa nowego pliku..."
            style={{ flex: 1, padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #475569', backgroundColor: '#1e293b', color: 'white' }}
          />
          <button type="submit" style={{ padding: '0.5rem 1rem', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}>
            Dodaj
          </button>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {documents.map(doc => (
            <div key={doc.id} style={{ padding: '0.75rem', backgroundColor: '#1e293b', borderRadius: '0.5rem', border: '1px solid #334155' }}>
              <div style={{ fontWeight: 500, wordBreak: 'break-word' }}>{doc.name}</div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>Dodano: {doc.date}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Column 2: AI Chat */}
      <div style={{ flex: 1.5, borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid #334155', backgroundColor: '#1e293b' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 600 }}>Agent Dowodzenia (AI)</h2>
        </div>
        
        <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {messages.map(msg => (
            <div key={msg.id} style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              backgroundColor: msg.role === 'user' ? '#3b82f6' : '#334155',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              maxWidth: '85%',
              wordWrap: 'break-word'
            }}>
              <div style={{ fontSize: '0.8rem', marginBottom: '0.25rem', color: msg.role === 'user' ? '#bfdbfe' : '#94a3b8' }}>
                {msg.role === 'user' ? 'Operator' : 'AI Agent'}
              </div>
              <div>{msg.content}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '1rem', borderTop: '1px solid #334155', backgroundColor: '#1e293b' }}>
          <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Wprowadź polecenie operacyjne..."
              style={{ flex: 1, padding: '0.75rem', borderRadius: '0.25rem', border: '1px solid #475569', backgroundColor: '#0f172a', color: 'white' }}
            />
            <button type="submit" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontWeight: 'bold' }}>
              Wyślij
            </button>
          </form>
        </div>
      </div>

      {/* Column 3: Generated Procedures & Commands */}
      <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 600 }}>Rozkazy i Procedury (RAG)</h2>
        
        {activeCommand ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Command Section */}
            <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '0.5rem', borderLeft: '4px solid #ef4444' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#f87171' }}>Rozkaz dla: {activeCommand.unitId}</h3>
              <p style={{ lineHeight: 1.5 }}>{activeCommand.commandText}</p>
              <button style={{ marginTop: '1rem', padding: '0.5rem 1rem', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', width: '100%' }}>
                Zatwierdź i Wyślij Rozkaz
              </button>
            </div>

            {/* Procedures Section */}
            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: '#94a3b8' }}>Dopasowane Procedury</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {activeCommand.procedures.map((proc, idx) => (
                  <div key={idx} style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                    <div style={{ fontSize: '0.85rem', color: '#10b981', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                      📄 {proc.docName}
                    </div>
                    <p style={{ fontSize: '0.9rem', fontStyle: 'italic', color: '#cbd5e1' }}>
                      "{proc.snippet}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
            
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', textAlign: 'center', padding: '2rem' }}>
            Wyślij polecenie w czacie, aby wygenerować rozkazy dla jednostek i odnaleźć procedury w dokumentacji RAG.
          </div>
        )}
      </div>

    </div>
  );
};
