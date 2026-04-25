'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

// ─── Training plan detection ──────────────────────────────────────────────────

function isTrainingPlan(text: string): boolean {
  const lines = text.split('\n').filter(l => l.trim());
  const planKeywords = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo', 'seg:', 'ter:', 'qui:', 'sex:', 'sáb:'];
  const matchCount = lines.filter(l => planKeywords.some(k => l.toLowerCase().includes(k))).length;
  return matchCount >= 3;
}

// ─── Apply Plan Button ────────────────────────────────────────────────────────

function ApplyPlanButton({ planText }: { planText: string }) {
  const [athleteId, setAthleteId] = useState('');
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ created: number } | null>(null);
  const [athletes, setAthletes] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      api.get('/users/athletes').then(r => setAthletes(r.data?.data ?? r.data ?? [])).catch(() => {});
    }
  }, [open]);

  const handleApply = async () => {
    if (!athleteId) return;
    setApplying(true);
    try {
      const { data } = await api.post('/coach-brain/apply-plan', { athleteId, planText });
      setResult(data);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erro ao aplicar plano');
    } finally { setApplying(false); }
  };

  if (result) return (
    <div className="mt-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
      ✅ {result.created} treinos criados com sucesso!
    </div>
  );

  return (
    <div className="mt-2">
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-xs font-medium px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition">
          📋 Aplicar este plano
        </button>
      ) : (
        <div className="flex gap-2 items-center mt-1">
          <select
            value={athleteId}
            onChange={e => setAthleteId(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 flex-1 focus:outline-none focus:border-emerald-500"
          >
            <option value="">Selecionar atleta...</option>
            {athletes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button
            onClick={handleApply}
            disabled={!athleteId || applying}
            className="text-xs font-medium px-3 py-1.5 bg-emerald-600 text-white rounded-lg disabled:opacity-40 hover:bg-emerald-700 transition"
          >
            {applying ? '...' : 'Aplicar'}
          </button>
          <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────────

interface BrainMessage {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  provider?: string;
}

interface Session {
  id: string;
  title: string;
  updatedAt: string;
}

// ─── Quick Actions ───────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { icon: '🚨', label: 'Atletas que precisam de atenção hoje' },
  { icon: '📊', label: 'Resumo geral da semana' },
  { icon: '❤️', label: 'Atletas com HRV abaixo do normal' },
  { icon: '🏆', label: 'Melhor desempenho desta semana' },
  { icon: '📋', label: 'Questionários pendentes de revisão' },
  { icon: '📅', label: 'Gere um plano semanal para meu atleta mais avançado' },
];

// ─── Markdown renderer ───────────────────────────────────────────────────────────

function MarkdownContent({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mb-1.5 mt-3 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>,
        code: ({ inline, children }: any) =>
          inline
            ? <code className="bg-gray-200/70 text-gray-800 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
            : <pre className="bg-gray-900 text-gray-100 rounded-xl p-3 text-xs font-mono overflow-x-auto my-2 whitespace-pre-wrap"><code>{children}</code></pre>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-red-300 pl-3 text-gray-600 italic my-2">{children}</blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="text-xs border-collapse w-full">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-gray-200 px-2 py-1 bg-gray-100 font-semibold text-left">{children}</th>,
        td: ({ children }) => <td className="border border-gray-200 px-2 py-1">{children}</td>,
        hr: () => <hr className="border-gray-200 my-3" />,
      }}
    >
      {content + (streaming ? '▋' : '')}
    </ReactMarkdown>
  );
}

// ─── AI Provider badge ────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, { label: string; color: string }> = {
  anthropic: { label: 'Claude', color: 'bg-orange-100 text-orange-700' },
  openai:    { label: 'GPT-4o', color: 'bg-emerald-100 text-emerald-700' },
  gemini:    { label: 'Gemini', color: 'bg-blue-100 text-blue-700' },
  grok:      { label: 'Grok',   color: 'bg-purple-100 text-purple-700' },
};

// ─── CoachBrain Panel ─────────────────────────────────────────────────────────────

function CoachBrainPanel() {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<BrainMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentProvider, setCurrentProvider] = useState<string>('anthropic');
  const [currentModel, setCurrentModel] = useState<string>('claude-opus-4-6');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    api.get('/coach-brain/sessions').then(r => setSessions(r.data ?? [])).catch(() => {});
    api.get('/coach-brain/settings').then(r => {
      setCurrentProvider(r.data?.provider ?? 'anthropic');
      setCurrentModel(r.data?.model ?? r.data?.defaultModel ?? 'claude-opus-4-6');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSession = async (id: string) => {
    try {
      const res = await api.get(`/coach-brain/sessions/${id}`);
      setMessages(res.data.messages ?? []);
      setSessionId(id);
    } catch {}
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await api.delete(`/coach-brain/sessions/${id}`);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (sessionId === id) {
        setMessages([]);
        setSessionId(null);
      }
    } catch {}
  };

  const newSession = () => {
    setMessages([]);
    setSessionId(null);
    textareaRef.current?.focus();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm' });
        setAttachedFiles(prev => {
          if (prev.length >= 5) return prev;
          return [...prev, file];
        });
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      alert('Não foi possível acessar o microfone');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setAttachedFiles(prev => {
      const combined = [...prev, ...files];
      return combined.slice(0, 5);
    });
    e.target.value = '';
  };

  const sendMessage = useCallback(async (text: string) => {
    if ((!text.trim() && attachedFiles.length === 0) || streaming) return;
    const filesToSend = [...attachedFiles];
    setInput('');
    setAttachedFiles([]);
    setStreaming(true);

    const userMsg: BrainMessage = { role: 'user', content: text || '[Arquivo(s) anexado(s)]' };
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }]);
    streamingRef.current = '';

    let finalProvider = currentProvider;
    let finalModel = currentModel;

    try {
      const token = localStorage.getItem('rr_access_token') || localStorage.getItem('accessToken') || '';
      let res: Response;

      if (filesToSend.length > 0) {
        const fd = new FormData();
        fd.append('message', text);
        if (sessionId) fd.append('sessionId', sessionId);
        filesToSend.forEach(f => fd.append('files', f));
        res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/coach-brain/chat`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
      } else {
        res = await fetch(`/api/v1/coach-brain/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ message: text, sessionId }),
        });
      }

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));

            if (payload.error) {
              streamingRef.current = `⚠️ ${payload.error}`;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: streamingRef.current };
                return updated;
              });
            }

            if (payload.chunk) {
              streamingRef.current += payload.chunk;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: streamingRef.current };
                return updated;
              });
            }

            if (payload.done) {
              if (payload.sessionId) {
                setSessionId(payload.sessionId);
                api.get('/coach-brain/sessions').then(r => setSessions(r.data ?? [])).catch(() => {});
              }
              if (payload.provider) { finalProvider = payload.provider; setCurrentProvider(payload.provider); }
              if (payload.model) { finalModel = payload.model; setCurrentModel(payload.model); }

              // Tag the final assistant message with provider/model
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: streamingRef.current,
                  provider: finalProvider,
                  model: finalModel,
                };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `⚠️ Erro ao conectar com a IA: ${err.message ?? 'Tente novamente.'}`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }, [sessionId, streaming, currentProvider, currentModel, attachedFiles]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const providerInfo = PROVIDER_LABELS[currentProvider] ?? PROVIDER_LABELS.anthropic;
  const modelShort = currentModel?.split('-').slice(0, 3).join('-') ?? currentModel;

  return (
    <div className="flex h-full">
      {/* Sessions Sidebar */}
      {sidebarOpen && (
        <div className="w-56 shrink-0 border-r border-gray-100 flex flex-col bg-gray-50/50">
          <div className="p-3 border-b border-gray-100">
            <button
              onClick={newSession}
              className="w-full py-2 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold transition flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Nova conversa
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {sessions.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4 px-2">Nenhuma conversa ainda</p>
            )}
            {sessions.map(s => (
              <button
                key={s.id}
                onClick={() => loadSession(s.id)}
                className={`group w-full text-left px-3 py-2.5 rounded-xl text-xs transition flex items-start justify-between gap-1 ${
                  sessionId === s.id
                    ? 'bg-[#DC2626]/10 text-[#DC2626]'
                    : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium leading-tight">{s.title || 'Conversa'}</p>
                  <p className="text-gray-400 mt-0.5 text-[10px]">
                    {new Date(s.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
                <button
                  onClick={(e) => deleteSession(e, s.id)}
                  className="opacity-0 group-hover:opacity-100 shrink-0 w-5 h-5 rounded-md hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition mt-0.5"
                  title="Excluir"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white/80">
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition text-gray-400"
            title={sidebarOpen ? 'Fechar histórico' : 'Ver histórico'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          </button>

          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#DC2626] to-orange-400 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight">IA do Coach</p>
            <p className="text-xs text-gray-400 leading-tight truncate">Assistente com contexto completo dos seus atletas</p>
          </div>

          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${providerInfo.color}`}>
            {modelShort}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center py-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#DC2626]/10 to-orange-100 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-[#DC2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Olá! Como posso ajudar?</p>
              <p className="text-xs text-gray-400 mb-5 text-center max-w-xs">
                Tenho acesso completo aos seus atletas, treinos, dados Garmin e avaliações físicas.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action.label}
                    onClick={() => sendMessage(action.label)}
                    disabled={streaming}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white hover:bg-red-50 border border-gray-200 hover:border-[#DC2626]/30 text-xs text-gray-600 hover:text-[#DC2626] transition text-left disabled:opacity-50"
                  >
                    <span className="text-base shrink-0">{action.icon}</span>
                    <span className="leading-tight">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            const isLastAssistant = !isUser && i === messages.length - 1;
            const isStreamingThis = isLastAssistant && streaming;
            const msgProviderInfo = msg.provider ? (PROVIDER_LABELS[msg.provider] ?? PROVIDER_LABELS.anthropic) : null;

            return (
              <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`}>
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#DC2626] to-orange-400 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                )}

                <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[80%]`}>
                  <div className={`px-4 py-3 rounded-2xl text-sm ${
                    isUser
                      ? 'bg-[#DC2626] text-white rounded-br-sm'
                      : 'bg-white border border-gray-100 shadow-sm text-gray-800 rounded-bl-sm'
                  }`}>
                    {isUser ? (
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    ) : msg.content ? (
                      <div className="prose-sm">
                        <MarkdownContent content={msg.content} streaming={isStreamingThis} />
                      </div>
                    ) : isStreamingThis ? (
                      <span className="inline-flex gap-1 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    ) : null}
                  </div>

                  {/* Apply plan button for training plan messages */}
                  {!isUser && msg.content && !isStreamingThis && isTrainingPlan(msg.content) && (user?.role === 'COACH' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
                    <ApplyPlanButton planText={msg.content} />
                  )}

                  {/* Provider badge below AI message */}
                  {!isUser && msg.content && msgProviderInfo && (
                    <span className={`text-[10px] font-medium mt-1 px-2 py-0.5 rounded-full ${msgProviderInfo.color}`}>
                      {msg.model ?? msgProviderInfo.label}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 bg-white/80">
          {/* File previews */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-gray-100">
              {attachedFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-2.5 py-1.5 text-xs">
                  {file.type.startsWith('image/') ? (
                    <img src={URL.createObjectURL(file)} className="w-6 h-6 rounded object-cover" alt="" />
                  ) : (
                    <span>{file.type.includes('pdf') ? '📄' : file.type.includes('audio') ? '🎵' : file.type.includes('sheet') || file.name.match(/\.xlsx?|\.csv$/) ? '📊' : '📎'}</span>
                  )}
                  <span className="max-w-[100px] truncate text-gray-700">{file.name}</span>
                  <button onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">×</button>
                </div>
              ))}
            </div>
          )}

          <div className="px-4 py-3">
            {streaming && (
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <div className="w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                Gerando resposta...
              </div>
            )}
            <div className="flex items-end gap-2">
              {/* File upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={streaming || attachedFiles.length >= 5}
                className="w-9 h-9 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 flex items-center justify-center shrink-0 transition disabled:opacity-40 cursor-pointer text-gray-400"
                title="Anexar arquivo"
              >
                📎
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/*,application/pdf,.xlsx,.xls,.csv,audio/*,video/*"
                onChange={handleFileSelect}
              />

              {/* Voice recording button */}
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={streaming || attachedFiles.length >= 5}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition disabled:opacity-40 cursor-pointer ${
                  recording
                    ? 'border-red-300 bg-red-50 text-red-500 animate-pulse'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-400'
                }`}
                title={recording ? 'Parar gravação' : 'Gravar áudio'}
              >
                🎤
              </button>

              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  // auto-resize
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte sobre seus atletas, peça análise, planilha de treino..."
                rows={1}
                disabled={streaming}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]/40 disabled:opacity-50 overflow-y-hidden"
                style={{ minHeight: 44, maxHeight: 120 }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={(!input.trim() && attachedFiles.length === 0) || streaming}
                className="w-10 h-10 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white flex items-center justify-center shrink-0 transition disabled:opacity-40 cursor-pointer shadow-[0_2px_8px_rgba(220,38,38,0.3)]"
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
            <p className="text-[10px] text-gray-300 mt-1.5 text-center">Enter para enviar · Shift+Enter para nova linha</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Athletes Chat ────────────────────────────────────────────────────────────────

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
  const colors = ['#DC2626', '#EA580C', '#D97706', '#16A34A', '#2563EB', '#7C3AED', '#DB2777', '#0D9488'];
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

type BroadcastGroup = 'ALL' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ELITE';

const BROADCAST_GROUPS: { value: BroadcastGroup; label: string }[] = [
  { value: 'ALL', label: 'Todos os atletas' },
  { value: 'BEGINNER', label: 'Iniciantes' },
  { value: 'INTERMEDIATE', label: 'Intermediários' },
  { value: 'ADVANCED', label: 'Avançados' },
  { value: 'ELITE', label: 'Elite' },
];

function AthletesChatPanel({ userId, isCoach }: { userId: string; isCoach: boolean }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Broadcast state
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastGroup, setBroadcastGroup] = useState<BroadcastGroup>('ALL');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ sent: number } | null>(null);

  useEffect(() => {
    api.get('/conversations')
      .then(r => setConversations(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim() || broadcasting) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    try {
      const { data } = await api.post('/conversations/broadcast', {
        message: broadcastMsg.trim(),
        targetGroup: broadcastGroup,
      });
      setBroadcastResult(data);
      setBroadcastMsg('');
    } catch {
      // ignore
    } finally {
      setBroadcasting(false);
    }
  };

  const selectConversation = async (conv: Conversation) => {
    setSelected(conv);
    setLoadingMsgs(true);
    try {
      const { data } = await api.get(`/conversations/${conv.id}/messages`);
      setMessages(data || []);
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
      setMessages(prev => [...prev, data]);
      setConversations(prev =>
        prev.map(c => c.id === selected.id ? { ...c, lastMessageAt: new Date().toISOString() } : c)
      );
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Broadcast Modal */}
      {broadcastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 w-full max-w-md shadow-xl mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900">Mensagem para o Grupo</h2>
              <button
                onClick={() => { setBroadcastOpen(false); setBroadcastResult(null); setBroadcastMsg(''); }}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {broadcastResult ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  Mensagem enviada para {broadcastResult.sent} atleta{broadcastResult.sent !== 1 ? 's' : ''}
                </p>
                <button
                  onClick={() => { setBroadcastOpen(false); setBroadcastResult(null); }}
                  className="mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Para quem?</label>
                  <select
                    value={broadcastGroup}
                    onChange={e => setBroadcastGroup(e.target.value as BroadcastGroup)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition"
                  >
                    {BROADCAST_GROUPS.map(g => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Mensagem <span className="text-gray-300">({broadcastMsg.length}/500)</span>
                  </label>
                  <textarea
                    value={broadcastMsg}
                    onChange={e => setBroadcastMsg(e.target.value.slice(0, 500))}
                    rows={4}
                    placeholder="Escreva a mensagem para seus atletas..."
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition resize-none"
                  />
                </div>
                <button
                  onClick={handleBroadcast}
                  disabled={!broadcastMsg.trim() || broadcasting}
                  className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {broadcasting && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Enviar para atletas
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-72 shrink-0 border-r border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Conversas</p>
          {isCoach && (
            <button
              onClick={() => { setBroadcastOpen(true); setBroadcastResult(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition"
              title="Enviar mensagem para grupo"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
              Broadcast
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1">
                  <div className="h-3 w-24 bg-gray-200 rounded mb-2" />
                  <div className="h-2 w-16 bg-gray-200 rounded" />
                </div>
              </div>
            ))
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-gray-400">Nenhuma conversa ainda</p>
              <p className="text-xs text-gray-300 mt-1">As conversas aparecem quando atletas enviam mensagens</p>
            </div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition text-left cursor-pointer ${selected?.id === conv.id ? 'bg-red-50/60' : ''}`}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold"
                  style={{ backgroundColor: avatarColor(conv.athlete.name) }}
                >
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
            <div className="flex items-center gap-3 p-4 border-b border-gray-100">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ backgroundColor: avatarColor(selected.athlete.name) }}
              >
                {selected.athlete.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{selected.athlete.name}</p>
                <p className="text-xs text-gray-400">Atleta</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMsgs ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-[#DC2626]/30 border-t-[#DC2626] rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">Nenhuma mensagem ainda. Diga olá!</p>
                </div>
              ) : (
                messages.map(msg => {
                  const isMe = msg.senderId === userId;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm ${isMe ? 'bg-[#DC2626] text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'}`}>
                        <p className="leading-relaxed">{msg.content}</p>
                        <p className={`text-xs mt-1 ${isMe ? 'text-white/60' : 'text-gray-400'}`}>{formatTime(msg.createdAt)}</p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <div className="p-4 border-t border-gray-100">
              <div className="flex items-end gap-3">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Escreva uma mensagem..."
                  rows={1}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]/40 resize-none"
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className="w-10 h-10 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white flex items-center justify-center shrink-0 transition disabled:opacity-40 cursor-pointer"
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
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const { user } = useAuthStore();
  const isCoach = user?.role === 'COACH' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const [tab, setTab] = useState<'athletes' | 'brain'>(isCoach ? 'brain' : 'athletes');

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
        {tab === 'athletes' && <AthletesChatPanel userId={user?.id ?? ''} isCoach={isCoach} />}
      </div>
    </div>
  );
}
