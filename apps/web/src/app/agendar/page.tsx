'use client';
import { useEffect } from 'react';
import Image from 'next/image';

const HERO   = '#CC1F1A';
const PAGE   = '#F4F4F5';
const WHITE  = '#FFFFFF';
const DARK   = '#18181B';
const GRAY   = '#71717A';
const LIGHT  = '#E4E4E7';
const RED    = '#CC1F1A';

// URL de agendamento Calendly — Consultoria 1:1 com Rafinha
const CALENDLY_URL = 'https://calendly.com/rodrigonicolau1981/consultoria-1-1-com-rafinha';

export default function AgendarPage() {
  // Injeta o script do widget Calendly inline
  useEffect(() => {
    const existing = document.getElementById('calendly-script');
    if (existing) return;
    const s = document.createElement('script');
    s.id = 'calendly-script';
    s.src = 'https://assets.calendly.com/assets/external/widget.js';
    s.async = true;
    document.head.appendChild(s);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: PAGE }}>

      {/* ── Hero ── */}
      <div className="py-10 text-center" style={{ background: HERO }}>
        <div className="inline-block" style={{ isolation: 'isolate', background: HERO }}>
          <Image
            src="/logo.png"
            alt="RR Rafinha Running"
            width={130}
            height={94}
            style={{ display: 'block', filter: 'saturate(0) brightness(0.6) contrast(100)', mixBlendMode: 'screen' }}
          />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-100 mt-4 mb-1">
          Sessão Presencial ou Online
        </p>
        <h1 className="text-3xl font-black uppercase tracking-tight text-white leading-tight">
          Consultoria 1:1<br />
          <span className="text-red-200">com Rafinha</span>
        </h1>
        <p className="text-sm text-red-100 mt-2">
          Alta demanda · Vagas limitadas · Treino desenhado à mão
        </p>
      </div>

      {/* ── Info cards ── */}
      <div className="px-4 py-6 max-w-lg mx-auto">
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { icon: '⏱', label: '1 hora', sub: 'de sessão' },
            { icon: '💰', label: 'R$300', sub: 'por hora' },
            { icon: '📅', label: 'Seg–Dom', sub: '9h às 18h' },
          ].map(c => (
            <div key={c.label} className="rounded-2xl border p-4 text-center shadow-sm"
              style={{ background: WHITE, borderColor: LIGHT }}>
              <div className="text-2xl mb-1">{c.icon}</div>
              <p className="font-black text-sm" style={{ color: DARK }}>{c.label}</p>
              <p className="text-[11px]" style={{ color: GRAY }}>{c.sub}</p>
            </div>
          ))}
        </div>

        {/* O que está incluído */}
        <div className="rounded-2xl border p-5 shadow-sm mb-6" style={{ background: WHITE, borderColor: LIGHT }}>
          <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: GRAY }}>
            O que você recebe:
          </p>
          <ul className="space-y-2.5">
            {[
              'Análise completa do seu perfil de corrida',
              'Planilha de treino desenhada à mão pelo Rafinha',
              'Ajustes de técnica de corrida (se presencial)',
              'Consultoria de corrida e estratégia de provas',
              'Gravação da sessão para referência futura',
              'Suporte via WhatsApp por 7 dias após a sessão',
            ].map(item => (
              <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: DARK }}>
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke={RED} strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA mobile: link direto */}
        <a
          href={CALENDLY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-4 rounded-2xl text-white text-sm font-black uppercase tracking-widest text-center shadow-md mb-3 sm:hidden transition hover:opacity-90"
          style={{ background: `linear-gradient(135deg, ${RED}, #8B0000)` }}
        >
          Agendar Agora →
        </a>

        {/* Widget Calendly inline — desktop/tablet */}
        <div
          className="hidden sm:block calendly-inline-widget rounded-2xl overflow-hidden shadow-sm border"
          data-url={`${CALENDLY_URL}?hide_gdpr_banner=1&primary_color=cc1f1a`}
          style={{ minWidth: 320, height: 700, borderColor: LIGHT }}
        />

        <p className="text-center text-xs mt-4 mb-6" style={{ color: GRAY }}>
          🔒 Confirmação automática por e-mail · Sincroniza com Google Calendar e Apple Calendar
        </p>

        <div className="rounded-2xl border p-4 text-center" style={{ background: WHITE, borderColor: LIGHT }}>
          <p className="text-sm font-semibold mb-1" style={{ color: DARK }}>Prefere falar antes de agendar?</p>
          <p className="text-xs mb-3" style={{ color: GRAY }}>Envie uma mensagem no WhatsApp</p>
          <a
            href="https://wa.me/5511999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition hover:opacity-90"
            style={{ background: '#25D366' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
