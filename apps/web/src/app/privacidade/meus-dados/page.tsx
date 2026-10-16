'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import {
  CONSENT_TYPE_LABELS,
  DATA_REQUEST_RESPONSE_DAYS,
  LEGAL_COMPANY,
  LEGAL_ROUTES,
} from '@/lib/legal';

interface LegalStatus {
  termsVersion: string;
  privacyVersion: string;
  needsConsent: boolean;
  healthDataConsent: boolean | null;
  accepted: {
    termsVersion: string | null;
    privacyVersion: string | null;
    termsAcceptedAt: string | null;
    marketingOptIn: boolean;
  } | null;
}

interface ConsentRow {
  type: string;
  version: string;
  granted: boolean;
  createdAt: string;
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

async function errorMessage(err: any, fallback: string): Promise<string> {
  const data = err?.response?.data;
  try {
    if (data instanceof Blob) {
      const parsed = JSON.parse(await data.text());
      const m = parsed?.message;
      return (Array.isArray(m) ? m.join(' ') : m) || fallback;
    }
  } catch {
    /* ignora */
  }
  const m = data?.message;
  return (Array.isArray(m) ? m.join(' ') : m) || fallback;
}

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${checked ? 'bg-[#DC2626]' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function Card({ title, children, desc }: { title: string; desc?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200/70 bg-white p-5 sm:p-6">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {desc && <p className="mt-1 text-sm text-gray-500 leading-relaxed">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function MyDataPage() {
  const { user, isAuthenticated, isLoading, loadUser } = useAuthStore();
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [history, setHistory] = useState<ConsentRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [savingMarketing, setSavingMarketing] = useState(false);
  const [savingHealth, setSavingHealth] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletionResult, setDeletionResult] = useState<{ deadline: string; alreadyRequested: boolean } | null>(null);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const load = useCallback(async () => {
    setLoadingData(true);
    try {
      const [s, h] = await Promise.all([
        api.get<LegalStatus>('/legal/me'),
        api.get<ConsentRow[]>('/legal/me/history'),
      ]);
      setStatus(s.data);
      setHistory(h.data ?? []);
    } catch (err) {
      toast.error(await errorMessage(err, 'Não foi possível carregar seus dados de privacidade.'));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  const isAthlete = user?.role === 'ATHLETE';
  const backHref = isAthlete ? '/athlete' : '/dashboard';

  const toggleMarketing = async (granted: boolean) => {
    setSavingMarketing(true);
    try {
      await api.post('/legal/marketing', { granted });
      toast.success(granted ? 'Você vai receber nossas novidades.' : 'Comunicações de marketing desativadas.');
      await load();
    } catch (err) {
      toast.error(await errorMessage(err, 'Não foi possível salvar a preferência.'));
    } finally {
      setSavingMarketing(false);
    }
  };

  const toggleHealth = async (granted: boolean) => {
    if (
      !granted &&
      !window.confirm(
        'Revogar o consentimento de dados de saúde?\n\nSua assessoria deixará de poder usar anamnese, frequência cardíaca, avaliações e demais dados de saúde para acompanhar seu treino, o que pode limitar o serviço. Você pode autorizar de novo quando quiser.',
      )
    ) {
      return;
    }
    setSavingHealth(true);
    try {
      await api.post('/legal/health-data', { granted });
      toast.success(granted ? 'Consentimento de dados de saúde concedido.' : 'Consentimento de dados de saúde revogado.');
      await load();
    } catch (err) {
      toast.error(await errorMessage(err, 'Não foi possível salvar o consentimento.'));
    } finally {
      setSavingHealth(false);
    }
  };

  const downloadData = async () => {
    setExporting(true);
    try {
      const res = await api.get('/legal/me/export', { responseType: 'blob' });
      const blob = res.data instanceof Blob ? res.data : new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meus-dados-rr-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Download iniciado.');
    } catch (err) {
      toast.error(await errorMessage(err, 'Não foi possível gerar a exportação.'));
    } finally {
      setExporting(false);
    }
  };

  const requestDeletion = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const { data } = await api.post('/legal/me/deletion-request', { reason: deleteReason.trim() || undefined });
      setDeletionResult({ deadline: data?.deadline, alreadyRequested: !!data?.alreadyRequested });
      setShowDelete(false);
      toast.success('Solicitação registrada. Enviamos uma confirmação para o seu e-mail.');
    } catch (err) {
      toast.error(await errorMessage(err, 'Não foi possível registrar a solicitação.'));
    } finally {
      setDeleting(false);
    }
  };

  /* ─── Não autenticado ─── */
  if (!isLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-3xl bg-white border border-gray-200/70 p-7 text-center">
          <h1 className="text-xl font-bold text-gray-900">Meus dados (LGPD)</h1>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            Entre na sua conta para ver seus consentimentos, baixar seus dados ou solicitar a exclusão.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link href="/athlete-login" className="flex-1 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-black">
              Sou atleta
            </Link>
            <Link href="/login" className="flex-1 rounded-xl bg-[#DC2626] px-4 py-3 text-sm font-semibold text-white hover:bg-red-700">
              Sou treinador
            </Link>
          </div>
          <p className="mt-5 text-xs text-gray-400">
            Sem acesso à conta? Escreva para o encarregado: {LEGAL_COMPANY.dpoEmail}
          </p>
        </div>
      </div>
    );
  }

  const accepted = status?.accepted;

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link href={backHref} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Voltar
          </Link>
          <div className="flex-1" />
          <span className="text-sm font-bold text-gray-900">Meus dados (LGPD)</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-10">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900">Privacidade e meus dados</h1>
          <p className="mt-1 text-sm text-gray-500">
            Exerça aqui seus direitos previstos no art. 18 da LGPD. Pedidos são respondidos em até {DATA_REQUEST_RESPONSE_DAYS} dias.
          </p>
        </div>

        {loadingData && !status ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#DC2626]/30 border-t-[#DC2626]" />
          </div>
        ) : (
          <>
            {/* Documentos */}
            <Card title="Documentos aceitos">
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-gray-400">Termos de Uso</dt>
                  <dd className="font-medium text-gray-900">{accepted?.termsVersion ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">Política de Privacidade</dt>
                  <dd className="font-medium text-gray-900">{accepted?.privacyVersion ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">Último aceite</dt>
                  <dd className="font-medium text-gray-900">{fmtDate(accepted?.termsAcceptedAt)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <Link href={LEGAL_ROUTES.terms} target="_blank" className="text-[#DC2626] underline">Ler Termos de Uso</Link>
                <Link href={LEGAL_ROUTES.privacy} target="_blank" className="text-[#DC2626] underline">Ler Política de Privacidade</Link>
              </div>
            </Card>

            {/* Preferências */}
            <Card title="Consentimentos" desc="Você pode conceder ou revogar a qualquer momento. A revogação não afeta o que foi feito antes dela.">
              <div className="divide-y divide-gray-100">
                <div className="flex items-start justify-between gap-4 py-3 first:pt-0">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Comunicações de marketing</p>
                    <p className="text-xs text-gray-500">Novidades, conteúdos e ofertas por e-mail.</p>
                  </div>
                  <Toggle
                    label="Comunicações de marketing"
                    checked={!!accepted?.marketingOptIn}
                    disabled={savingMarketing || !status}
                    onChange={toggleMarketing}
                  />
                </div>
                {isAthlete && (
                  <div className="flex items-start justify-between gap-4 py-3 last:pb-0">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Dados de saúde (dados sensíveis)</p>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        Anamnese, frequência cardíaca, avaliações físicas e demais dados de saúde usados pela sua assessoria
                        para acompanhar seu treino (LGPD art. 11, I).
                      </p>
                    </div>
                    <Toggle
                      label="Dados de saúde"
                      checked={status?.healthDataConsent === true}
                      disabled={savingHealth || !status}
                      onChange={toggleHealth}
                    />
                  </div>
                )}
              </div>
            </Card>

            {/* Exportação */}
            <Card
              title="Baixar meus dados"
              desc="Gera um arquivo JSON com seus dados pessoais: cadastro, perfil esportivo, treinos, avaliações, nutrição, anamnese, inscrições, pedidos, pagamentos, consentimentos e notificações. Senhas e tokens nunca são incluídos. Limite: 3 exportações por hora."
            >
              <button
                type="button"
                onClick={downloadData}
                disabled={exporting}
                className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-black disabled:opacity-50 cursor-pointer"
              >
                {exporting ? 'Gerando arquivo...' : 'Baixar meus dados'}
              </button>
            </Card>

            {/* Correção */}
            <Card title="Corrigir dados" desc="Nome, foto, telefone e dados esportivos podem ser alterados no seu perfil. Dados de treino e avaliações registrados pela assessoria podem ser corrigidos com seu treinador.">
              <Link href="/dashboard/settings" className="text-sm text-[#DC2626] underline">
                Ir para o meu perfil
              </Link>
            </Card>

            {/* Histórico */}
            <Card title="Histórico de consentimentos" desc="Registro de cada aceite ou revogação, com data e versão do documento.">
              {history.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum registro.</p>
              ) : (
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full min-w-[440px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                        <th className="py-2 pr-3 font-medium">Data</th>
                        <th className="py-2 pr-3 font-medium">Item</th>
                        <th className="py-2 pr-3 font-medium">Versão</th>
                        <th className="py-2 font-medium">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={`${h.type}-${h.createdAt}-${i}`} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{fmtDate(h.createdAt)}</td>
                          <td className="py-2 pr-3 text-gray-900">{CONSENT_TYPE_LABELS[h.type] ?? h.type}</td>
                          <td className="py-2 pr-3 text-gray-500">{h.version}</td>
                          <td className="py-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${h.granted ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                              {h.granted ? (h.type === 'TERMS' || h.type === 'PRIVACY' ? 'Aceito' : 'Concedido') : 'Não concedido / revogado'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Exclusão */}
            <Card
              title="Solicitar exclusão da conta"
              desc={
                <>
                  Sua solicitação é registrada e enviada ao encarregado de dados. Ela é atendida manualmente em até{' '}
                  {DATA_REQUEST_RESPONSE_DAYS} dias. Alguns dados podem ser mantidos pelo prazo exigido em lei (como registros
                  fiscais e de pagamento), conforme a <Link href={`${LEGAL_ROUTES.privacy}#retencao`} className="underline">Política de Privacidade</Link>.
                </>
              }
            >
              {deletionResult ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  {deletionResult.alreadyRequested ? 'Você já tinha uma solicitação recente em andamento.' : 'Solicitação registrada.'}{' '}
                  Prazo de resposta: <strong>{deletionResult.deadline ? new Date(deletionResult.deadline).toLocaleDateString('pt-BR') : `${DATA_REQUEST_RESPONSE_DAYS} dias`}</strong>.
                  Enviamos uma confirmação para o seu e-mail.
                </div>
              ) : !showDelete ? (
                <button
                  type="button"
                  onClick={() => setShowDelete(true)}
                  className="rounded-xl border border-red-200 px-5 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 cursor-pointer"
                >
                  Solicitar exclusão da conta
                </button>
              ) : (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-500">Motivo (opcional)</span>
                    <textarea
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value.slice(0, 1000))}
                      rows={3}
                      className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
                      placeholder="Conte, se quiser, por que está saindo."
                    />
                  </label>
                  <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#DC2626]"
                    />
                    Entendo que, após o atendimento, perderei o acesso à conta, aos treinos e ao histórico, e que isso não pode ser desfeito.
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => { setShowDelete(false); setDeleteConfirm(false); }}
                      className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={requestDeletion}
                      disabled={!deleteConfirm || deleting}
                      className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {deleting ? 'Enviando...' : 'Confirmar solicitação'}
                    </button>
                  </div>
                </div>
              )}
            </Card>

            <p className="pb-10 text-center text-xs text-gray-400">
              Outras solicitações (confirmação, informação sobre compartilhamento, oposição, revisão de decisão automatizada):
              escreva para o encarregado em {LEGAL_COMPANY.dpoEmail}.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
