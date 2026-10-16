'use client';

import { useEffect, useState } from 'react';
import { api, friendlyError } from '@/lib/api';

type Step = 'idle' | 'setup' | 'disable';

/** Ativar/desativar 2FA (TOTP) — usa /users/me/2fa/{status,setup,enable,disable}. */
export default function TwoFactorSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api.get('/users/me/2fa/status')
      .then(({ data }) => setEnabled(!!data?.enabled))
      .catch(() => setEnabled(false));
  }, []);

  const reset = () => { setStep('idle'); setCode(''); setQr(''); setSecret(''); };

  const startSetup = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api.post('/users/me/2fa/setup');
      setQr(data.qrCodeDataUrl);
      setSecret(data.secret);
      setStep('setup');
    } catch (e) {
      setMsg({ type: 'error', text: friendlyError(e, 'Não foi possível iniciar a configuração do 2FA.') });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!/^\d{6}$/.test(code)) { setMsg({ type: 'error', text: 'Digite o código de 6 dígitos do app autenticador.' }); return; }
    setBusy(true);
    setMsg(null);
    try {
      if (step === 'setup') {
        await api.post('/users/me/2fa/enable', { token: code });
        setEnabled(true);
        setMsg({ type: 'success', text: 'Verificação em duas etapas ativada. No próximo login o código será pedido.' });
      } else {
        await api.post('/users/me/2fa/disable', { token: code });
        setEnabled(false);
        setMsg({ type: 'success', text: 'Verificação em duas etapas desativada.' });
      }
      reset();
    } catch (e) {
      setMsg({ type: 'error', text: friendlyError(e, 'Código inválido.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Verificação em duas etapas (2FA)</h2>
          <p className="text-xs text-gray-400">Proteja sua conta com um código do Google Authenticator, Authy ou similar.</p>
        </div>
        {enabled !== null && (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
            {enabled ? 'Ativada' : 'Desativada'}
          </span>
        )}
      </div>

      {enabled === null ? (
        <div className="h-10 bg-gray-50 rounded-xl animate-pulse" />
      ) : step === 'idle' ? (
        enabled ? (
          <button
            onClick={() => { setStep('disable'); setMsg(null); }}
            className="px-5 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition cursor-pointer"
          >
            Desativar 2FA
          </button>
        ) : (
          <button
            onClick={startSetup}
            disabled={busy}
            className="px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition cursor-pointer"
          >
            {busy ? 'Gerando…' : 'Ativar 2FA'}
          </button>
        )
      ) : (
        <div className="space-y-4">
          {step === 'setup' && (
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR Code para o app autenticador" className="w-40 h-40 rounded-xl border border-gray-100 bg-white" />
              )}
              <div className="text-sm text-gray-600 space-y-2 min-w-0">
                <p>1. Escaneie o QR Code no seu app autenticador.</p>
                <p>2. Se preferir, digite a chave manualmente:</p>
                <code className="block break-all text-xs bg-gray-50 border border-gray-100 rounded-lg px-2 py-1.5 font-mono select-all">{secret}</code>
                <p>3. Informe o código de 6 dígitos para confirmar.</p>
              </div>
            </div>
          )}
          {step === 'disable' && (
            <p className="text-sm text-gray-600">Para desativar, informe o código atual do seu app autenticador.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              aria-label="Código de 6 dígitos"
              className="w-32 px-3.5 py-2.5 text-center tracking-[0.3em] font-mono text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={confirm}
              disabled={busy || code.length !== 6}
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition cursor-pointer"
            >
              {busy ? 'Verificando…' : step === 'setup' ? 'Confirmar e ativar' : 'Desativar'}
            </button>
            <button onClick={() => { reset(); setMsg(null); }} className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 cursor-pointer">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p role="status" className={`mt-3 text-sm ${msg.type === 'success' ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>
      )}
    </div>
  );
}
