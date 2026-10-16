'use client';

import { useState } from 'react';
import { api, friendlyError } from '@/lib/api';

// Mês corrente (parcial) + 12 meses anteriores
const MONTHS = Array.from({ length: 13 }, (_, i) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
  const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) + (i === 0 ? ' (até hoje)' : '');
  return { value, label };
});

export default function AthleteReportsPage() {
  const [month, setMonth] = useState(MONTHS[1].value);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function downloadReport() {
    setLoading(true);
    setError('');
    try {
      // Mesmo cliente HTTP do app (token, refresh e proxy /api) — evita URL absoluta e erros técnicos
      const res = await api.get('/reports/monthly/me', { params: { month }, responseType: 'blob' });
      const blob: Blob = res.data;
      if (blob.type && blob.type.includes('json')) {
        const data = JSON.parse(await blob.text().catch(() => '{}'));
        throw new Error(typeof data?.message === 'string' ? data.message : 'Não foi possível gerar o relatório.');
      }
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `relatorio-${month}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err: any) {
      let message = friendlyError(err, 'Não foi possível gerar o relatório. Tente novamente.');
      // Erro da API em blob: tenta extrair a mensagem em português
      const data = err?.response?.data;
      if (data instanceof Blob) {
        try {
          const parsed = JSON.parse(await data.text());
          if (typeof parsed?.message === 'string') message = parsed.message;
        } catch {}
      } else if (!err?.response && err instanceof Error && err.message && !/fetch|network/i.test(err.message)) {
        message = err.message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Relatório Mensal</h1>
      <p className="text-sm text-gray-500 mb-8">
        Baixe seu relatório completo em PDF com treinos, distância, saúde e avaliações físicas do mês.
      </p>

      <div className="glass-card p-6 space-y-5">
        {/* Month selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Selecione o mês</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* What's included */}
        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 space-y-1">
          <p className="font-semibold text-gray-800 mb-2">O relatório inclui:</p>
          <p>✅ Total de treinos, distância e tempo acumulado</p>
          <p>✅ Histórico completo de cada sessão (pace, FC, distância)</p>
          <p>✅ Médias de HRV, sono e frequência cardíaca</p>
          <p>✅ Avaliações físicas do mês com análise de IA</p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          onClick={downloadReport}
          disabled={loading}
          className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Gerando PDF...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Baixar Relatório PDF
            </>
          )}
        </button>
      </div>
    </div>
  );
}
