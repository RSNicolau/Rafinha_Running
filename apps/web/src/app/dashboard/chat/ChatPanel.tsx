'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuthStore } from '@/stores/auth.store';
import { api, friendlyError } from '@/lib/api';

// ─── Training plan detection ──────────────────────────────────────────────────

function isTrainingPlan(text: string): boolean {
  const lines = text.split('\n').filter(l => l.trim());
  const planKeywords = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo', 'seg:', 'ter:', 'qui:', 'sex:', 'sáb:'];
  const matchCount = lines.filter(l => planKeywords.some(k => l.toLowerCase().includes(k))).length;
  return matchCount >= 3;
}

/**
 * GET /users/athletes devolve {data,total,...} com itens AthleteProfile:
 * { id: <id do perfil>, userId, user: { id, name, email, avatarUrl } }.
 * Para conversa/planilha usamos SEMPRE o id do usuário (user.id / userId).
 */
function mapAthleteList(raw: any): { id: string; name: string; email?: string; avatarUrl?: string | null }[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  return list
    .map((a: any) => ({
      id: a?.user?.id ?? a?.userId ?? a?.id,
      name: a?.user?.name ?? a?.name ?? '',
      email: a?.user?.email ?? a?.email,
      avatarUrl: a?.user?.avatarUrl ?? a?.avatarUrl ?? null,
    }))
    .filter((a: { id?: string }) => !!a.id);
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
      api.get('/users/athletes', { params: { limit: 100 } })
        .then(r => setAthletes(mapAthleteList(r.data).map(a => ({ id: a.id, name: a.name }))))
        .catch(() => {});
    }
  }, [open]);

  const handleApply = async () => {
    if (!athleteId) return;
    setApplying(true);
    try {
      const { data } = await api.post('/coach-brain/apply-plan', { athleteId, planText });
      setResult(data);
    } catch (e: any) {
      alert(friendlyError(e, 'Não foi possível aplicar o plano.'));
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
  const [currentModel, setCurrentModel] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth >= 768));
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
      // Só exibe o modelo quando a IA está realmente configurada (sem chave → sem selo)
      setCurrentModel(r.data?.configured === false ? '' : (r.data?.model ?? r.data?.defaultModel ?? ''));
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
          content: '⚠️ Não foi possível falar com a IA agora. Tente novamente em instantes.',
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
  const modelShort = currentModel ? currentModel.split('-').slice(0, 3).join('-') : '';

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

          {modelShort && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${providerInfo.color}`} title={currentModel}>
              {modelShort}
            </span>
          )}
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
                      {msg.model || msgProviderInfo.label}
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

interface ChatUser { id: string; name: string; email?: string; avatarUrl?: string | null }

interface Conversation {
  id: string;
  athleteId: string;
  coachId: string;
  lastMessageAt: string | null;
  athlete?: ChatUser;
  coach?: ChatUser;
  otherUser?: ChatUser | null;
  myRole?: 'COACH' | 'ATHLETE';
  unreadCount?: number;
  lastMessage?: Message | null;
}

interface MessagesPage { data: Message[]; total: number; page: number; totalPages: number }

/** A API devolve {data,total,page,totalPages}; versões antigas devolviam um array. */
function normalizeMessages(raw: any): MessagesPage {
  if (Array.isArray(raw)) return { data: raw, total: raw.length, page: 1, totalPages: 1 };
  const data = Array.isArray(raw?.data) ? raw.data : [];
  return {
    data,
    total: Number(raw?.total ?? data.length),
    page: Number(raw?.page ?? 1),
    totalPages: Number(raw?.totalPages ?? 1),
  };
}

/** Outro participante da conversa (título): nunca o próprio usuário. */
function otherParticipant(conv: Conversation, userId: string): ChatUser {
  if (conv.otherUser?.name) return conv.otherUser;
  const other = conv.coachId === userId ? conv.athlete : conv.coach;
  return other ?? { id: '', name: 'Conversa' };
}

function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) if (m?.id) map.set(m.id, m);
  return Array.from(map.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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

/** Base do servidor de websocket: origem da API quando absoluta; senão a própria origem (Caddy faz o proxy). */
function socketBase(): string {
  const env = process.env.NEXT_PUBLIC_API_URL || '';
  if (/^https?:\/\//.test(env)) {
    try { return new URL(env).origin; } catch {}
  }
  return typeof window !== 'undefined' ? window.location.origin : '';
}

const POLL_MS = 5000;

type BroadcastGroup = 'ALL' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ELITE';

const BROADCAST_GROUPS: { value: BroadcastGroup; label: string }[] = [
  { value: 'ALL', label: 'Todos os atletas' },
  { value: 'BEGINNER', label: 'Iniciantes' },
  { value: 'INTERMEDIATE', label: 'Intermediários' },
  { value: 'ADVANCED', label: 'Avançados' },
  { value: 'ELITE', label: 'Elite' },
];

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 text-white text-sm font-bold"
      style={{ width: size, height: size, backgroundColor: avatarColor(name || '?') }}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

function AthletesChatPanel({ userId, isCoach, initialAthleteId }: { userId: string; isCoach: boolean; initialAthleteId?: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgPage, setMsgPage] = useState(1);
  const [msgTotalPages, setMsgTotalPages] = useState(1);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [socketOk, setSocketOk] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null);
  const selectedRef = useRef<Conversation | null>(null);
  selectedRef.current = selected;

  // Nova conversa (coach escolhe atleta)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [athletes, setAthletes] = useState<ChatUser[]>([]);
  const [athleteSearch, setAthleteSearch] = useState('');
  const [loadingAthletes, setLoadingAthletes] = useState(false);
  const [athletesTotal, setAthletesTotal] = useState(0);
  const [searchResults, setSearchResults] = useState<ChatUser[] | null>(null);

  // Broadcast state
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastGroup, setBroadcastGroup] = useState<BroadcastGroup>('ALL');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ sent: number } | null>(null);

  const scrollToBottom = (delay = 50) => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), delay);

  const loadConversations = useCallback(async () => {
    try {
      const r = await api.get('/conversations');
      const list: Conversation[] = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.data) ? r.data.data : [];
      setConversations(list);
      return list;
    } catch (e) {
      setError(friendlyError(e, 'Não foi possível carregar as conversas.'));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // ─── Tempo real (socket.io) com fallback de polling a cada 5s ───
  useEffect(() => {
    let cancelled = false;
    let socket: any = null;
    (async () => {
      try {
        const { io } = await import('socket.io-client');
        if (cancelled) return;
        const token = localStorage.getItem('rr_access_token') || '';
        socket = io(`${socketBase()}/chat`, {
          transports: ['websocket'],
          auth: { token },
          reconnectionAttempts: 3,
          timeout: 5000,
        });
        socketRef.current = socket;
        socket.on('connect', () => {
          setSocketOk(true);
          const conv = selectedRef.current;
          if (conv) socket.emit('conversation:join', { conversationId: conv.id });
        });
        socket.on('disconnect', () => setSocketOk(false));
        socket.on('connect_error', () => setSocketOk(false));
        socket.on('message:received', (m: Message & { conversationId?: string }) => {
          const conv = selectedRef.current;
          if (conv && (!m.conversationId || m.conversationId === conv.id)) {
            setMessages((prev) => mergeMessages(prev, [m]));
            scrollToBottom();
          }
        });
        socket.on('conversation:updated', () => { loadConversations(); });
      } catch {
        setSocketOk(false);
      }
    })();
    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [loadConversations]);

  // Entra na sala da conversa selecionada
  useEffect(() => {
    if (selected && socketRef.current?.connected) {
      socketRef.current.emit('conversation:join', { conversationId: selected.id });
    }
  }, [selected]);

  // Polling quando o websocket não está disponível (ex.: dev sem proxy de WS)
  useEffect(() => {
    if (socketOk) return;
    const t = setInterval(async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const conv = selectedRef.current;
      if (conv) {
        try {
          const { data } = await api.get(`/conversations/${conv.id}/messages`, { params: { page: 1, limit: 50 } });
          const page = normalizeMessages(data);
          setMessages((prev) => {
            const merged = mergeMessages(prev, page.data);
            if (merged.length !== prev.length) {
              scrollToBottom();
              api.post(`/conversations/${conv.id}/read`).catch(() => {});
            }
            return merged;
          });
        } catch {}
      }
      loadConversations();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [socketOk, loadConversations]);

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
      loadConversations();
    } catch (e) {
      setError(friendlyError(e, 'Não foi possível enviar a mensagem para o grupo.'));
    } finally {
      setBroadcasting(false);
    }
  };

  const selectConversation = async (conv: Conversation) => {
    setSelected(conv);
    setMessages([]);
    setMsgPage(1);
    setMsgTotalPages(1);
    setLoadingMsgs(true);
    setError('');
    try {
      const { data } = await api.get(`/conversations/${conv.id}/messages`, { params: { page: 1, limit: 50 } });
      const page = normalizeMessages(data);
      setMessages(page.data);
      setMsgPage(page.page);
      setMsgTotalPages(page.totalPages);
      api.post(`/conversations/${conv.id}/read`).catch(() => {});
      setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c)));
    } catch (e) {
      setMessages([]);
      setError(friendlyError(e, 'Não foi possível carregar as mensagens.'));
    } finally {
      setLoadingMsgs(false);
      scrollToBottom(100);
    }
  };

  const loadOlder = async () => {
    if (!selected || loadingOlder || msgPage >= msgTotalPages) return;
    setLoadingOlder(true);
    try {
      const next = msgPage + 1;
      const { data } = await api.get(`/conversations/${selected.id}/messages`, { params: { page: next, limit: 50 } });
      const page = normalizeMessages(data);
      setMessages((prev) => mergeMessages(prev, page.data));
      setMsgPage(next);
      setMsgTotalPages(page.totalPages);
    } catch (e) {
      setError(friendlyError(e, 'Não foi possível carregar mensagens anteriores.'));
    } finally {
      setLoadingOlder(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !selected || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    try {
      const { data } = await api.post(`/conversations/${selected.id}/messages`, { content: text });
      setMessages((prev) => mergeMessages(prev, [data]));
      setConversations((prev) =>
        prev.map((c) => (c.id === selected.id ? { ...c, lastMessageAt: new Date().toISOString(), lastMessage: data } : c)),
      );
      scrollToBottom();
    } catch (e) {
      setInput(text);
      setError(friendlyError(e, 'Não foi possível enviar a mensagem.'));
    } finally {
      setSending(false);
    }
  };

  /** Atleta: abre (ou cria) a conversa com o próprio treinador. Coach: com o atleta escolhido. */
  const startConversation = async (athleteId?: string) => {
    if (starting) return;
    setStarting(true);
    setError('');
    try {
      const { data } = await api.post('/conversations', athleteId ? { athleteId } : {});
      const list = await loadConversations();
      const conv = list.find((c) => c.id === data?.id) ?? (data as Conversation);
      setPickerOpen(false);
      await selectConversation(conv);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(
        typeof msg === 'string' && /vinculado/i.test(msg)
          ? 'Você ainda não tem um treinador vinculado. Assim que sua equipe definir seu treinador, você poderá conversar por aqui.'
          : friendlyError(e, 'Não foi possível iniciar a conversa.'),
      );
    } finally {
      setStarting(false);
    }
  };

  const openPicker = async () => {
    setPickerOpen(true);
    setAthleteSearch('');
    setSearchResults(null);
    if (athletes.length) return;
    setLoadingAthletes(true);
    try {
      // A API limita a 100 por página; acima disso a busca vai para o servidor (?q=)
      const r = await api.get('/users/athletes', { params: { limit: 100 } });
      setAthletes(mapAthleteList(r.data));
      setAthletesTotal(Number(r.data?.total ?? 0));
    } catch (e) {
      setError(friendlyError(e, 'Não foi possível carregar seus atletas.'));
    } finally {
      setLoadingAthletes(false);
    }
  };

  // Busca no servidor quando a equipe tem mais atletas do que a primeira página carregada
  useEffect(() => {
    const term = athleteSearch.trim();
    if (!pickerOpen || term.length < 2 || athletesTotal <= athletes.length) { setSearchResults(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api.get('/users/athletes', { params: { limit: 50, q: term } });
        setSearchResults(mapAthleteList(r.data));
      } catch { setSearchResults(null); }
    }, 300);
    return () => clearTimeout(t);
  }, [athleteSearch, pickerOpen, athletesTotal, athletes.length]);

  // Deep link: /dashboard/chat?athleteId=<id do usuário> abre/cria a conversa direto (a cada novo id)
  const router = useRouter();
  const deepLinkDone = useRef<string | null>(null);
  useEffect(() => {
    if (!initialAthleteId) { deepLinkDone.current = null; return; }
    if (!isCoach || loading || deepLinkDone.current === initialAthleteId) return;
    deepLinkDone.current = initialAthleteId;
    startConversation(initialAthleteId).finally(() => {
      router.replace('/dashboard/chat', { scroll: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCoach, initialAthleteId, loading]);

  const searchTerm = athleteSearch.trim().toLowerCase();
  const filteredAthletes = searchResults ?? athletes.filter((a) =>
    (a.name || '').toLowerCase().includes(searchTerm) || (a.email || '').toLowerCase().includes(searchTerm),
  );
  const myCoachConv = !isCoach ? conversations.find((c) => c.athleteId === userId) : undefined;
  const selectedOther = selected ? otherParticipant(selected, userId) : null;
  const selectedOtherLabel = selected ? (selected.coachId === userId ? 'Atleta' : 'Treinador') : '';

  return (
    <div className="flex h-full relative">
      {/* Broadcast Modal */}
      {broadcastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 w-full max-w-md shadow-xl mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900">Mensagem para o Grupo</h2>
              <button
                onClick={() => { setBroadcastOpen(false); setBroadcastResult(null); setBroadcastMsg(''); }}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400"
                aria-label="Fechar"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {broadcastResult ? (
              <div className="text-center py-4">
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

      {/* Escolher atleta (coach) */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl border border-gray-100 p-5 w-full sm:max-w-md shadow-xl sm:mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-900">Nova conversa</h2>
              <button onClick={() => setPickerOpen(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400" aria-label="Fechar">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <input
              value={athleteSearch}
              onChange={(e) => setAthleteSearch(e.target.value)}
              placeholder="Buscar atleta..."
              className="w-full px-3.5 py-2.5 mb-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20"
            />
            <div className="flex-1 overflow-y-auto -mx-2">
              {loadingAthletes ? (
                <p className="text-sm text-gray-400 text-center py-6">Carregando atletas...</p>
              ) : filteredAthletes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhum atleta encontrado</p>
              ) : (
                filteredAthletes.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => startConversation(a.id)}
                    disabled={starting}
                    className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-50 text-left disabled:opacity-50"
                  >
                    <Avatar name={a.name || a.email || '?'} size={36} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900 truncate">{a.name || 'Atleta sem nome'}</span>
                      {a.email && <span className="block text-xs text-gray-400 truncate">{a.email}</span>}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lista de conversas — no celular some quando uma conversa está aberta */}
      <div className={`${selected ? 'hidden md:flex' : 'flex'} w-full md:w-72 shrink-0 md:border-r border-gray-100 flex-col min-h-0`}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Conversas</p>
          {isCoach ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={openPicker}
                className="px-3 py-1.5 rounded-xl bg-[#DC2626] text-white text-xs font-semibold hover:bg-[#B91C1C] transition"
              >
                + Nova
              </button>
              <button
                onClick={() => { setBroadcastOpen(true); setBroadcastResult(null); }}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition"
                title="Enviar mensagem para grupo"
              >
                Broadcast
              </button>
            </div>
          ) : (
            !myCoachConv && !loading && (
              <button
                onClick={() => startConversation()}
                disabled={starting}
                className="px-3 py-1.5 rounded-xl bg-[#DC2626] text-white text-xs font-semibold hover:bg-[#B91C1C] transition disabled:opacity-50"
              >
                {starting ? 'Abrindo...' : 'Falar com meu treinador'}
              </button>
            )
          )}
        </div>
        {error && !selected && (
          <p className="mx-4 mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
        )}
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
              <p className="text-xs text-gray-300 mt-1">
                {isCoach
                  ? 'Toque em “+ Nova” para conversar com um atleta.'
                  : 'Toque em “Falar com meu treinador” para enviar sua primeira mensagem.'}
              </p>
            </div>
          ) : (
            conversations.map(conv => {
              const other = otherParticipant(conv, userId);
              return (
                <button
                  key={conv.id}
                  onClick={() => selectConversation(conv)}
                  className={`w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition text-left cursor-pointer ${selected?.id === conv.id ? 'bg-red-50/60' : ''}`}
                >
                  <Avatar name={other.name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{other.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {conv.lastMessage?.content
                        ? conv.lastMessage.content
                        : conv.coachId === userId ? 'Atleta' : 'Treinador'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {conv.lastMessageAt && <span className="text-[10px] text-gray-400">{formatTime(conv.lastMessageAt)}</span>}
                    {!!conv.unreadCount && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Conversa */}
      <div className={`${selected ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 min-h-0`}>
        {!selected || !selectedOther ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <p className="text-sm font-medium text-gray-500">Selecione uma conversa</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 p-3 md:p-4 border-b border-gray-100">
              <button
                onClick={() => { setSelected(null); setMessages([]); setError(''); }}
                className="md:hidden w-9 h-9 -ml-1 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500"
                aria-label="Voltar para as conversas"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <Avatar name={selectedOther.name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{selectedOther.name}</p>
                <p className="text-xs text-gray-400">{selectedOtherLabel}</p>
              </div>
              {!socketOk && (
                <span className="text-[10px] text-gray-400" title="Atualizando a cada 5 segundos">atualização automática</span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 min-h-0">
              {msgPage < msgTotalPages && !loadingMsgs && (
                <div className="flex justify-center">
                  <button onClick={loadOlder} disabled={loadingOlder} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg bg-gray-100">
                    {loadingOlder ? 'Carregando...' : 'Carregar mensagens anteriores'}
                  </button>
                </div>
              )}
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
                      <div className={`max-w-[85%] md:max-w-[70%] px-4 py-2.5 rounded-2xl text-sm break-words ${isMe ? 'bg-[#DC2626] text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'}`}>
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        <p className={`text-xs mt-1 ${isMe ? 'text-white/60' : 'text-gray-400'}`}>{formatTime(msg.createdAt)}</p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {error && (
              <p className="mx-3 mb-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
            )}
            <div className="p-3 md:p-4 border-t border-gray-100 bg-white">
              <div className="flex items-end gap-2 md:gap-3">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Escreva uma mensagem..."
                  rows={1}
                  maxLength={5000}
                  className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-gray-200 text-base md:text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626]/40 resize-none"
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  aria-label="Enviar"
                  className="w-11 h-11 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white flex items-center justify-center shrink-0 transition disabled:opacity-40 cursor-pointer"
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
  // ?athleteId=… (link do detalhe do atleta) abre direto a aba Atletas com a conversa.
  // useSearchParams reage à navegação client-side (window.location ainda não mudou no 1º render).
  const searchParams = useSearchParams();
  const initialAthleteId = searchParams?.get('athleteId') || undefined;
  const [tab, setTab] = useState<'athletes' | 'brain'>(initialAthleteId || !isCoach ? 'athletes' : 'brain');
  useEffect(() => {
    if (initialAthleteId) setTab('athletes');
  }, [initialAthleteId]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Chat</h1>
          <p className="text-sm text-gray-400 mt-1">
            {tab === 'brain'
              ? 'Assistente IA com contexto completo dos atletas'
              : isCoach ? 'Mensagens com seus atletas' : 'Mensagens com seu treinador'}
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

      <div className="glass-card overflow-hidden" style={{ height: 'calc(100dvh - 200px)', minHeight: 420 }}>
        {tab === 'brain' && isCoach && <CoachBrainPanel />}
        {tab === 'athletes' && <AthletesChatPanel userId={user?.id ?? ''} isCoach={isCoach} initialAthleteId={initialAthleteId} />}
      </div>
    </div>
  );
}
