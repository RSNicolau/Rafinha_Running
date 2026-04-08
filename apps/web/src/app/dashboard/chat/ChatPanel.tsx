'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

// ─── CoachBrain AI Panel ─────────────────────────────────────────────────────

interface BrainMessage {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_ACTIONS = [
  'Quem dos meus atletas precisa de atenção hoje?',
  'Qual atleta teve o melhor desempenho esta semana?',
  'Há algum atleta com HRV abaixo do normal hoje?',
  'Resumo geral da semana',
  'Quais atletas têm questionário pendente?',
];

function CoachBrainPanel() {
  const [messages, setMessages] = useState<BrainMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef<string>('');

  useEffect(() => {
    api.get('/coach-brain/sessions').then(r => setSessions(r.data ?? [])).catch(() => {});
  }, []);

  const loadSession = async (id: string) => {
    try {
      const res = await api.get(`/coach-brain/sessions/${id}`);
      setMessages(res.data.messages ?? []);
      setSessionId(id);
    } catch {}
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    setInput('');
    setStreaming(true);

    const userMsg: BrainMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);

    streamingRef.current = '';
    const assistantIdx = messages.length + 1;

    // Optimistically add empty assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const token = localStorage.getItem('rr_access_token') || '';
      // Use the Next.js proxy path to avoid needing NEXT_PUBLIC_API_URL for SSE
      const res = await fetch(`/api/v1/coach-brain/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text, sessionId }),
      });

      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (!value) continue;

        const lines = decoder.decode(value).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.chunk) {
              streamingRef.current += payload.chunk;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: streamingRef.current };
                return updated;
              });
            }
            if (payload.sessionId) {
              setSessionId(payload.sessionId);
              // Refresh sessions list
              api.get('/coach-brain/sessions').then(r => setSessions(r.data ?? [])).catch(() => {});
            }
          } catch {}
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Erro ao conectar com a IA. Tente novamente.' };
        return updated;
      });
    } finally {
      setStreaming(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [messages.length, sessionId, streaming]);

  return (
    <div className="flex h-full">
      {/* Sessions sidebar */}
      <div className="w-56 shrink-0 border-r border-gray-100 flex flex-col">
        <div className="p-3 border-b border-gray-100">
          <button
            onClick={() => { setMessages([]); setSessionId(null); }}
            className="w-full py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold transition"
          >
            + Nova conversa
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => loadSession(s.id)}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs transition ${sessionId === s.id ? 'bg-red-50 text-red-700 font-medium' : 'hover:bg-gray-50 text-gray-600'}`}
            >
              <p className="truncate font-medium">{s.title || 'Conversa'}</p>
              <p className="text-gray-400 mt-0.5">{new Date(s.updatedAt).toLocaleDateString('pt-BR')}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-100">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-orange-400 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">IA do Coach</p>
            <p className="text-xs text-gray-400">Assistente inteligente com contexto completo dos seus atletas</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div>
              <p className="text-center text-sm text-gray-400 mb-4">Pergunte qualquer coisa sobre seus atletas</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action}
                    onClick={() => sendMessage(action)}
                    className="px-3 py-2 rounded-xl bg-gray-50 hover:bg-red-50 border border-gray-200 hover:border-red-200 text-xs text-gray-600 hover:text-red-700 transition text-left"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-500 to-orange-400 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
              )}
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-primary text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'}`}>
                {msg.content || (msg.role === 'assistant' && streaming ? (
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                ) : '')}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder="Pergunte sobre seus atletas, peça uma planilha, análise..."
              rows={2}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
              disabled={streaming}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || streaming}
              className="w-10 h-10 rounded-xl bg-primary hover:bg-red-700 text-white flex items-center justify-center shrink-0 transition disabled:opacity-40 cursor-pointer"
            >
              {streaming ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Message {
  id: string;
  senderId: string;
  content: string;
  readAt: string | null;
  createdAt: string;
}

interface Conversation {
  id: string;
  athleteId: string;
  coachId: string;
  lastMessageAt: string | null;
  athlete: { id: string; name: string; avatarUrl?: string | null };
  messages?: Message[];
}

function avatarColor(name: string) {
  const colors = ['#DC2626','#EA580C','#D97706','#16A34A','#2563EB','#7C3AED','#DB2777','#0D9488'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function ChatPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'athletes' | 'brain'>(user?.role === 'COACH' || user?.role === 'ADMIN' ? 'brain' : 'athletes');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/conversations')
      .then((r) => setConversations(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectConversation = async (conv: Conversation) => {
    setSelected(conv);
    setLoadingMsgs(true);
    try {
      const { data } = await api.get(`/conversations/${conv.id}/messages`);
      setMessages(data || []);
      // Mark as read
      api.post(`/conversations/${conv.id}/read`).catch(() => {});
    } catch {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !selected || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    try {
      const { data } = await api.post(`/conversations/${selected.id}/messages`, { content: text });
      setMessages((prev) => [...prev, data]);
      setConversations((prev) =>
        prev.map((c) => c.id === selected.id ? { ...c, lastMessageAt: new Date().toISOString() } : c)
      );
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const isCoach = user?.role === 'COACH' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Chat</h1>
          <p className="text-sm text-gray-400 mt-1">
            {tab === 'brain' ? 'Assistente IA com contexto completo dos atletas' : 'Mensagens com seus atletas'}
          </p>
        </div>
        {isCoach && (
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setTab('brain')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'brain' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              IA do Coach
            </button>
            <button
              onClick={() => setTab('athletes')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'athletes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Atletas
            </button>
          </div>
        )}
      </div>

      <div className="glass-card overflow-hidden" style={{ height: 'calc(100vh - 220px)', minHeight: 500 }}>
        {tab === 'brain' && isCoach && <CoachBrainPanel />}
        {tab !== 'brain' && <div className="flex h-full">
          {/* Sidebar */}
          <div className="w-72 shrink-0 border-r border-gray-100 flex flex-col">
            <div className="p-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Conversas</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-4 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-gray-200" />
                    <div className="flex-1"><div className="h-3 w-24 bg-gray-200 rounded mb-2" /><div className="h-2 w-16 bg-gray-200 rounded" /></div>
                  </div>
                ))
              ) : conversations.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-gray-400">Nenhuma conversa ainda</p>
                  <p className="text-xs text-gray-300 mt-1">As conversas aparecem quando atletas enviam mensagens</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => selectConversation(conv)}
                    className={`w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition text-left cursor-pointer ${selected?.id === conv.id ? 'bg-red-50/60' : ''}`}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold" style={{ backgroundColor: avatarColor(conv.athlete.name) }}>
                      {conv.athlete.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{conv.athlete.name}</p>
                      {conv.lastMessageAt && (
                        <p className="text-xs text-gray-400">{formatTime(conv.lastMessageAt)}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Chat area */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-500">Selecione uma conversa</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center gap-3 p-4 border-b border-gray-100">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: avatarColor(selected.athlete.name) }}>
                    {selected.athlete.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{selected.athlete.name}</p>
                    <p className="text-xs text-gray-400">Atleta</p>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingMsgs ? (
                    <div className="flex justify-center py-8">
                      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-400">Nenhuma mensagem ainda. Diga olá!</p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe = msg.senderId === user?.id;
                      return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${isMe ? 'bg-primary text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'}`}>
                            <p className="leading-relaxed">{msg.content}</p>
                            <p className={`text-xs mt-1 ${isMe ? 'text-white/60' : 'text-gray-400'}`}>{formatTime(msg.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="p-4 border-t border-gray-100">
                  <div className="flex items-end gap-3">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder="Escreva uma mensagem..."
                      rows={1}
                      className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 resize-none"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!input.trim() || sending}
                      className="w-10 h-10 rounded-xl bg-primary hover:bg-red-700 text-white flex items-center justify-center shrink-0 transition disabled:opacity-40 cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>}
      </div>
    </div>
  );
}
