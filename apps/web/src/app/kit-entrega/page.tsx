'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

interface EventInfo {
  eventId: string;
  event: {
    id: string;
    title: string;
    eventDate: string;
    kitPickupLocation?: string;
  };
  volunteerLabel: string;
  expiresAt: string;
}

interface Registration {
  id: string;
  bibNumber?: string;
  name: string;
  email: string;
  avatarUrl?: string;
  shirtSize?: string;
  kitType?: string;
  paymentStatus: string;
  status: string;
  kitDeliveredAt?: string;
  kitDeliveredBy?: string;
  indicator: 'GREEN' | 'YELLOW' | 'RED';
}

type Screen = 'loading' | 'error' | 'main' | 'confirm' | 'result';

export default function KitEntregaPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [screen, setScreen] = useState<Screen>('loading');
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Registration[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Registration | null>(null);
  const [delivering, setDelivering] = useState(false);
  const [deliveryResult, setDeliveryResult] = useState<{ success: boolean; message: string } | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load session on mount
  useEffect(() => {
    if (!token) {
      setErrorMsg('Token de acesso não fornecido. Peça ao organizador do evento um link válido.');
      setScreen('error');
      return;
    }

    api.get(`/events/kit-delivery?token=${token}`)
      .then((r) => {
        setEventInfo(r.data);
        setScreen('main');
      })
      .catch((err) => {
        const msg = err?.response?.data?.message ?? 'Token inválido ou expirado.';
        setErrorMsg(msg);
        setScreen('error');
      });
  }, [token]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (!eventInfo || q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const r = await api.get(`/events/kit-delivery/search?token=${token}&q=${encodeURIComponent(q)}`);
      setResults(r.data);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [eventInfo, token]);

  const handleQueryChange = (v: string) => {
    setQuery(v);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => doSearch(v), 400);
  };

  const handleSelect = (reg: Registration) => {
    setSelected(reg);
    setScreen('confirm');
  };

  const handleDeliver = async () => {
    if (!selected) return;
    setDelivering(true);
    try {
      const r = await api.post('/events/kit-delivery/scan', {
        registrationId: selected.id,
        token,
        volunteerLabel: eventInfo?.volunteerLabel,
      });
      setDeliveryResult({ success: r.data.success, message: r.data.message });
      setScreen('result');
      // Refresh search results
      setQuery('');
      setResults([]);
    } catch (err: any) {
      setDeliveryResult({ success: false, message: err?.response?.data?.message ?? 'Erro ao registrar entrega.' });
      setScreen('result');
    } finally {
      setDelivering(false);
    }
  };

  const indicatorStyle = (indicator: 'GREEN' | 'YELLOW' | 'RED') => {
    const map = {
      GREEN: 'bg-green-100 border-green-300 text-green-800',
      YELLOW: 'bg-yellow-100 border-yellow-300 text-yellow-800',
      RED: 'bg-red-100 border-red-300 text-red-800',
    };
    return map[indicator];
  };

  const indicatorLabel = (reg: Registration) => {
    if (reg.indicator === 'GREEN') return '🟢 Pronto para retirada';
    if (reg.indicator === 'YELLOW') return `🟡 Já retirado em ${new Date(reg.kitDeliveredAt!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} por ${reg.kitDeliveredBy}`;
    return '🔴 Pagamento pendente / inscrição inválida';
  };

  // ===== SCREENS =====

  if (screen === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Verificando acesso...</p>
        </div>
      </div>
    );
  }

  if (screen === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
          <div className="text-4xl mb-3">⛔</div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Acesso Negado</h1>
          <p className="text-sm text-gray-600">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (screen === 'confirm' && selected) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <button
            onClick={() => { setSelected(null); setScreen('main'); }}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            ← Voltar
          </button>

          <h2 className="text-lg font-bold text-gray-900 mb-4">Confirmar Entrega</h2>

          {/* Athlete card */}
          <div className={`border rounded-xl p-4 mb-4 ${indicatorStyle(selected.indicator)}`}>
            <div className="flex items-center gap-3 mb-2">
              {selected.avatarUrl ? (
                <img src={selected.avatarUrl} alt={selected.name} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-white/60 flex items-center justify-center text-lg font-bold">
                  {selected.name.charAt(0)}
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-900">{selected.name}</p>
                <p className="text-xs text-gray-500">{selected.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs opacity-70">Nº Peito</p>
                <p className="font-bold text-lg">{selected.bibNumber ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs opacity-70">Tamanho</p>
                <p className="font-medium">{selected.shirtSize ?? '—'}</p>
              </div>
              {selected.kitType && (
                <div>
                  <p className="text-xs opacity-70">Kit</p>
                  <p className="font-medium">{selected.kitType}</p>
                </div>
              )}
            </div>
            <p className="text-xs mt-2 font-medium">{indicatorLabel(selected)}</p>
          </div>

          {selected.indicator === 'RED' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
              ⚠️ Este atleta tem pagamento pendente ou inscrição inválida. Consulte o organizador antes de entregar o kit.
            </div>
          )}

          {selected.indicator === 'YELLOW' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 text-sm text-yellow-800">
              ⚠️ Kit já entregue! Confirmar novamente sobrescreverá o registro.
            </div>
          )}

          <button
            onClick={handleDeliver}
            disabled={delivering}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {delivering ? 'Registrando...' : '✅ Confirmar Entrega do Kit'}
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'result' && deliveryResult) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
          <div className="text-5xl mb-3">{deliveryResult.success ? '✅' : '❌'}</div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            {deliveryResult.success ? 'Kit Entregue!' : 'Atenção'}
          </h2>
          <p className="text-sm text-gray-600 mb-6">{deliveryResult.message}</p>
          <button
            onClick={() => { setSelected(null); setDeliveryResult(null); setScreen('main'); }}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
          >
            Próximo Atleta
          </button>
        </div>
      </div>
    );
  }

  // MAIN screen
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary text-white px-4 py-4 shadow-sm">
        <p className="text-xs opacity-80 mb-0.5">Entrega de Kits — Voluntário</p>
        <h1 className="text-lg font-bold">{eventInfo?.event.title}</h1>
        <p className="text-xs opacity-70 mt-0.5">
          {eventInfo?.volunteerLabel} · Sessão expira às{' '}
          {eventInfo ? new Date(eventInfo.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Search */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            🔍 Buscar Atleta
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Nome ou número de peito..."
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            autoFocus
          />
          {searching && (
            <p className="text-xs text-gray-400 mt-2">Buscando...</p>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-2">
            {results.map((reg) => (
              <button
                key={reg.id}
                onClick={() => handleSelect(reg)}
                className={`w-full text-left border rounded-xl p-4 transition-all hover:shadow-md ${indicatorStyle(reg.indicator)}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {reg.avatarUrl ? (
                      <img src={reg.avatarUrl} alt={reg.name} className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-white/60 flex items-center justify-center font-bold text-sm">
                        {reg.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{reg.name}</p>
                      <p className="text-xs text-gray-500">
                        Nº {reg.bibNumber ?? '?'} · {reg.shirtSize ?? '—'} {reg.kitType ? `· ${reg.kitType}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-lg">
                    {reg.indicator === 'GREEN' ? '🟢' : reg.indicator === 'YELLOW' ? '🟡' : '🔴'}
                  </div>
                </div>
                <p className="text-xs mt-1.5 opacity-80">{indicatorLabel(reg)}</p>
              </button>
            ))}
          </div>
        )}

        {!searching && query.length >= 2 && results.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-500">
            Nenhum atleta encontrado para &quot;{query}&quot;
          </div>
        )}

        {query.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
            <p className="text-2xl mb-2">📦</p>
            <p className="text-sm text-gray-500">
              Digite o nome ou número de peito do atleta para buscar.
            </p>
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">Legenda</p>
          <div className="space-y-1 text-xs">
            <p>🟢 <span className="text-gray-700">Pronto para retirada — entregar o kit</span></p>
            <p>🟡 <span className="text-gray-700">Kit já entregue anteriormente</span></p>
            <p>🔴 <span className="text-gray-700">Pagamento pendente — consultar organizador</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
