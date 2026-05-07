'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface ReferralData {
  code: string;
  shareLink: string;
  referrerRewardCents: number;
  refereeRewardCents: number;
  currentCreditCents: number;
  totalEarnedCents: number;
  stats: { total: number; pending: number; paid: number };
  referrals: Array<{
    id: string;
    status: 'PENDING' | 'PAID' | 'CREDITED' | 'CANCELLED';
    refereeName: string;
    refereeEmail?: string;
    rewardCents: number;
    createdAt: string;
    paidAt?: string;
  }>;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Cadastrou', color: 'bg-amber-50 text-amber-700' },
  PAID: { label: 'Pagou ✓', color: 'bg-emerald-50 text-emerald-700' },
  CREDITED: { label: 'Creditado', color: 'bg-blue-50 text-blue-700' },
  CANCELLED: { label: 'Cancelado', color: 'bg-gray-100 text-gray-500' },
};

function formatBRL(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get('/referrals/me')
      .then(({ data }) => setData(data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const copyLink = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const shareWhatsapp = () => {
    if (!data) return;
    const msg = encodeURIComponent(
      `🏃 Vem treinar com a gente! Tô na assessoria do Rafinha e tá fazendo a diferença.\n\nUsa meu link e ganha ${formatBRL(data.refereeRewardCents)} de desconto na primeira mensalidade:\n${data.shareLink}`,
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Não foi possível carregar suas indicações. Recarregue a página.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Indique amigos, ganhe descontos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cada amigo que se inscrever via seu link e pagar a 1ª mensalidade te dá <strong>{formatBRL(data.referrerRewardCents)}</strong> de crédito. Seu amigo também ganha <strong>{formatBRL(data.refereeRewardCents)}</strong> de desconto na 1ª mensalidade.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Crédito disponível', value: formatBRL(data.currentCreditCents), color: 'text-emerald-600' },
          { label: 'Total ganho', value: formatBRL(data.totalEarnedCents), color: 'text-gray-900' },
          { label: 'Pagaram', value: data.stats.paid, color: 'text-emerald-600' },
          { label: 'Pendentes', value: data.stats.pending, color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Share card */}
      <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-100 rounded-2xl p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-red-600 mb-3">SEU LINK ÚNICO</p>
        <div className="bg-white rounded-xl p-4 flex items-center gap-3 mb-4">
          <code className="flex-1 text-xs sm:text-sm font-mono text-gray-700 truncate">
            {data.shareLink}
          </code>
          <button
            onClick={copyLink}
            className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              copied ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {copied ? '✓ Copiado!' : 'Copiar'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={shareWhatsapp}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Compartilhar no WhatsApp
          </button>
          <a
            href={`mailto:?subject=${encodeURIComponent('Vem treinar comigo!')}&body=${encodeURIComponent(`Tô na assessoria do Rafinha e tá fazendo a diferença. Usa meu link e ganha ${formatBRL(data.refereeRewardCents)} de desconto: ${data.shareLink}`)}`}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            Enviar por email
          </a>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-sm font-bold text-gray-900 mb-4">Como funciona</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { num: '1', title: 'Compartilhe', desc: 'Envie seu link único pra amigos por WhatsApp ou email.' },
            { num: '2', title: 'Amigo se inscreve', desc: 'Ele preenche o questionário e paga a 1ª mensalidade.' },
            { num: '3', title: 'Vocês dois ganham', desc: `Você ${formatBRL(data.referrerRewardCents)} de crédito · Ele ${formatBRL(data.refereeRewardCents)} de desconto.` },
          ].map(s => (
            <div key={s.num} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-sm shrink-0">
                {s.num}
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900">{s.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Referrals list */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Suas indicações</h2>
        </div>
        {data.referrals.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📢</div>
            <p className="text-sm text-gray-500">Nenhuma indicação ainda</p>
            <p className="text-xs text-gray-400 mt-1">Compartilhe seu link e comece a ganhar!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.referrals.map(r => (
              <div key={r.id} className="px-6 py-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 font-bold text-sm">
                  {(r.refereeName ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.refereeName}</p>
                  {r.refereeEmail && <p className="text-xs text-gray-400 truncate">{r.refereeEmail}</p>}
                </div>
                <div className="text-right">
                  <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_LABEL[r.status]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[r.status]?.label ?? r.status}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">
                    {r.status === 'PAID' || r.status === 'CREDITED' ? `+${formatBRL(r.rewardCents)}` : '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
