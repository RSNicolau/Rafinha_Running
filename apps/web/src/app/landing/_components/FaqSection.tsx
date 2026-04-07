'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'Preciso de cartão de crédito para começar?',
    a: 'Não. O período de teste de 14 dias é completamente gratuito, sem necessidade de cartão de crédito. Você só precisa fornecer dados de pagamento ao final do período.',
  },
  {
    q: 'Como funciona a integração com Garmin e Strava?',
    a: 'O atleta conecta sua conta Garmin ou Strava uma única vez. Após isso, todos os treinos são sincronizados automaticamente após cada atividade registrada.',
  },
  {
    q: 'Posso mudar de plano a qualquer momento?',
    a: 'Sim. Você pode fazer upgrade ou downgrade do seu plano a qualquer momento. O valor é calculado proporcionalmente ao período restante.',
  },
  {
    q: 'O app mobile é white-label. O que isso significa?',
    a: 'No plano Pro e Elite, o app mobile leva o nome, logo e cores da sua assessoria — não da Rafinha Running. Seus atletas baixam um app com sua identidade visual.',
  },
  {
    q: 'Como funciona o live tracking?',
    a: 'Durante uma corrida, o atleta ativa o tracking no app. Você vê em tempo real a posição no mapa, o pace atual e a frequência cardíaca diretamente no dashboard.',
  },
  {
    q: 'Tenho suporte em português?',
    a: 'Sim. Todo o suporte é em português. No plano Básico via chat; no Pro via chat prioritário; no Elite temos suporte dedicado com reuniões de onboarding.',
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="py-24 px-6 bg-white">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs font-bold text-[#DC2626] uppercase tracking-widest">FAQ</span>
          <h2 className="text-4xl font-black text-gray-900 mt-2 mb-4">Perguntas frequentes</h2>
        </div>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="border border-gray-200 rounded-2xl overflow-hidden hover:border-gray-300 transition-colors">
              <button
                className="w-full px-6 py-4 flex items-center justify-between text-left gap-4"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="font-semibold text-gray-900 text-sm">{faq.q}</span>
                <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open === i ? 'rotate-180' : ''}`} />
              </button>
              {open === i && (
                <div className="px-6 pb-5">
                  <p className="text-gray-500 text-sm leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
