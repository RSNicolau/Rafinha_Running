'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

interface AppointmentSettings {
  appointmentUrl: string | null;
}

export default function SchedulePage() {
  const user = useAuthStore((s) => s.user);
  const [settings, setSettings] = useState<AppointmentSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        // Try to get coach appointment URL — first via athlete's coach, then fallback to generic endpoint
        const { data } = await api.get<AppointmentSettings>('/appointments/settings');
        setSettings(data);
      } catch {
        setSettings({ appointmentUrl: null });
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Agendar Sessão com o Coach</h1>
        <p className="text-sm text-gray-500 mt-1">
          Agende uma conversa ou sessão de acompanhamento com seu treinador
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 animate-pulse h-64" />
      ) : settings?.appointmentUrl ? (
        <div className="space-y-6">
          {/* Info card */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-indigo-900">Agende sua sessão</p>
              <p className="text-xs text-indigo-700 mt-0.5">
                Escolha o melhor horário disponível no calendário do seu coach. Após confirmar, você receberá uma confirmação por e-mail.
              </p>
            </div>
          </div>

          {/* Calendly / embed */}
          <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
            <iframe
              src={settings.appointmentUrl}
              width="100%"
              height="700"
              frameBorder="0"
              title="Agendamento com o coach"
              className="block"
              allow="camera; microphone; fullscreen"
            />
          </div>

          {/* Direct link fallback */}
          <p className="text-xs text-gray-400 text-center">
            Caso o calendário não carregue,{' '}
            <a
              href={settings.appointmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline font-medium"
            >
              clique aqui para abrir diretamente
            </a>
            .
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-gray-900 mb-2">Agendamento não disponível</h2>
          <p className="text-sm text-gray-400 max-w-sm mx-auto leading-relaxed">
            Agendamento não disponível. Fale com seu coach pelo chat.
          </p>
          <a
            href="/dashboard/chat"
            className="inline-flex items-center gap-2 mt-6 bg-indigo-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            Ir para o Chat
          </a>
        </div>
      )}
    </div>
  );
}
