'use client';

import { useCallback, useState } from 'react';
import { api } from '@/lib/api';
import QrScanner from '../../../kit-entrega/QrScanner';
import { errMsg, inputCls } from './shared';

type Result = { success: boolean; message: string; requiresConfirmation?: boolean; registration?: { bibNumber?: string | null; user?: { name: string }; distance?: { name: string } | null } };

/** Check-in no dia da prova: QR da inscrição (câmera ou leitor USB) ou número de peito. */
export default function CheckinPanel({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [last, setLast] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async (value: string) => {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    try {
      let { data } = await api.post(`/events/${eventId}/checkin-scan`, { code: v });
      // B6: antes de 1 dia da prova o servidor pede confirmação do organizador
      if (data?.requiresConfirmation && window.confirm(`${data.message}\n\nRegistrar o check-in agora?`)) {
        ({ data } = await api.post(`/events/${eventId}/checkin-scan`, { code: v, force: true }));
      }
      setLast(data);
      if (data.success) onChanged();
    } catch (e) {
      setLast({ success: false, message: errMsg(e, 'Inscrição não encontrada') });
    } finally {
      setBusy(false);
      setCode('');
    }
  }, [eventId, onChanged]);

  return (
    <div className="glass-card p-4 space-y-3">
      <p className="text-sm font-semibold text-gray-800">Check-in do dia da prova</p>
      <div className="flex gap-2">
        <input
          className={inputCls}
          placeholder="Nº de peito ou leia o QR (leitor USB)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit(code)}
          autoFocus
        />
        <button onClick={() => submit(code)} disabled={busy} className="px-4 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50">OK</button>
        <button onClick={() => setScanning(true)} className="px-4 rounded-xl bg-gray-900 text-white text-sm font-semibold">📷</button>
      </div>
      {scanning && <QrScanner onResult={(t) => { setScanning(false); submit(t); }} onClose={() => setScanning(false)} />}
      {last && (
        <div className={`rounded-xl p-3 text-sm font-semibold ${last.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          {last.success ? '✅ ' : '⚠️ '}{last.message}
          {last.registration?.distance?.name && <span className="font-normal"> · {last.registration.distance.name}</span>}
        </div>
      )}
      <p className="text-[11px] text-gray-400">O atleta mostra o QR Code da inscrição no app. A câmera do navegador só funciona em HTTPS; na rede local use um leitor USB/Bluetooth ou digite o número de peito.</p>
    </div>
  );
}
