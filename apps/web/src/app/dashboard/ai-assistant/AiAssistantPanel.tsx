'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

interface Athlete {
  id: string;
  name: string;
}

interface AiConfig {
  assistantName: string;
  voiceEnabled: boolean;
}

const hasSpeechRecognition =
  typeof window !== 'undefined' &&
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

export default function AiAssistantPanel() {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>('');
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [config, setConfig] = useState<AiConfig>({ assistantName: 'Rafinha', voiceEnabled: false });
  const [toolIndicator, setToolIndicator] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Load athletes and config
    Promise.all([
      api.get('/users/me/athletes').catch(() => ({ data: [] })),
      api.get('/ai-assistant/config').catch(() => ({ data: { assistantName: 'Rafinha', voiceEnabled: false } })),
    ]).then(([athletesRes, configRes]) => {
      setAthletes(athletesRes.data?.athletes ?? athletesRes.data ?? []);
      setConfig(configRes.data);
    });
  }, []);

  const speak = useCallback((text: string) => {
    if (!config.voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }, [config.voiceEnabled]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text };
    const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '', streaming: true }]);
    setInput('');
    setLoading(true);
    setToolIndicator(null);

    try {
      const token = (api.defaults.headers.common['Authorization'] as string)?.replace('Bearer ', '') ?? '';
      const res = await fetch('/api/v1/ai-assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text, athleteId: selectedAthleteId || undefined, history }),
      });

      if (!res.ok || !res.body) throw new Error('Erro na resposta');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text') {
              fullText += data.content;
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: fullText, streaming: true };
                return next;
              });
            } else if (data.type === 'tool_call') {
              setToolIndicator(data.tool);
            } else if (data.type === 'done') {
              setToolIndicator(null);
            }
          } catch {}
        }
      }

      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: fullText, streaming: false };
        return next;
      });
      speak(fullText);
    } catch {
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: 'Desculpe, ocorreu um erro. Tente novamente.', streaming: false };
        return next;
      });
    } finally {
      setLoading(false);
      setToolIndicator(null);
    }
  }, [loading, messages, selectedAthleteId, speak]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const startVoice = () => {
    if (!hasSpeechRecognition) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      setInput(e.results[0][0].transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
  };

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const quickActions = [
    { label: 'Analisar performance', prompt: `Analise a performance do atleta selecionado nas últimas 4 semanas.` },
    { label: 'Sugerir treino', prompt: `Sugira um treino para amanhã com base no histórico recente.` },
    { label: 'Gerar plano 8 semanas', prompt: `Crie um plano de treino de 8 semanas para o atleta selecionado.` },
  ];

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm">
      {/* Sidebar */}
      <aside className="w-52 border-r border-gray-100 bg-gray-50 flex flex-col p-4 gap-4 shrink-0">
        {/* Avatar */}
        <div className="text-center pt-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-[#DC2626] to-red-800 flex items-center justify-center mb-2 shadow-lg shadow-red-200">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
          </div>
          <p className="font-bold text-gray-900 text-sm">{config.assistantName}</p>
          <p className="text-xs text-gray-400">IA Assistente</p>
        </div>

        {/* Athlete selector */}
        {athletes.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Atleta</p>
            <select
              value={selectedAthleteId}
              onChange={e => setSelectedAthleteId(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-[#DC2626]"
            >
              <option value="">Geral</option>
              {athletes.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Quick actions */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Ações rápidas</p>
          <div className="flex flex-col gap-1.5">
            {quickActions.map(a => (
              <button
                key={a.label}
                onClick={() => sendMessage(a.prompt)}
                disabled={loading}
                className="text-left text-xs px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-[#DC2626] hover:text-[#DC2626] transition-colors disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-3">
          <div className="flex-1">
            <p className="font-semibold text-gray-900 text-sm">IA Assistente — {config.assistantName}</p>
            {toolIndicator && (
              <p className="text-xs text-[#DC2626] animate-pulse">
                Consultando: {toolIndicator.replace(/_/g, ' ')}...
              </p>
            )}
          </div>
          <button
            onClick={() => setMessages([])}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Limpar
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
                <svg className="w-6 h-6 text-[#DC2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-600 text-sm">Olá, sou {config.assistantName}!</p>
                <p className="text-xs mt-1 max-w-xs">Posso ajudar a criar planilhas, analisar performance e responder dúvidas sobre seus atletas.</p>
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#DC2626] text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}
              >
                {msg.content || (msg.streaming ? (
                  <span className="flex gap-1 items-center py-0.5">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                ) : '')}
                {msg.streaming && msg.content && (
                  <span className="inline-block w-0.5 h-4 bg-gray-500 ml-0.5 animate-pulse align-middle" />
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-gray-100 flex items-end gap-2">
          {hasSpeechRecognition && (
            <button
              type="button"
              onClick={listening ? stopVoice : startVoice}
              className={`p-2.5 rounded-xl border transition-colors flex-shrink-0 ${
                listening
                  ? 'bg-[#DC2626] border-[#DC2626] text-white'
                  : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
              }`}
              title={listening ? 'Parar gravação' : 'Falar'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                {listening ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                )}
              </svg>
            </button>
          )}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Digite sua mensagem..."
            rows={1}
            className="flex-1 resize-none border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#DC2626] transition-colors max-h-32 overflow-y-auto"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2.5 rounded-xl bg-[#DC2626] text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
