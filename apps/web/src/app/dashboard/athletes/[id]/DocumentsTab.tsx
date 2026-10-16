'use client';

import { useState, useEffect } from 'react';
import { api, friendlyError } from '@/lib/api';
import AiUnavailableNotice from '@/components/coach/AiUnavailableNotice';
import { formatInstant, isAiNotConfigured } from '@/lib/coach-format';

const STATUS_LABEL: Record<string, string> = {
  DONE: 'Análise concluída',
  PROCESSING: 'Analisando…',
  FAILED: 'Análise falhou',
  UNAVAILABLE: 'IA indisponível',
  PENDING: 'Aguardando análise',
};
const STATUS_CLASS: Record<string, string> = {
  DONE: 'bg-emerald-100 text-emerald-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  FAILED: 'bg-red-100 text-red-600',
  UNAVAILABLE: 'bg-amber-100 text-amber-700',
  PENDING: 'bg-gray-100 text-gray-500',
};
const CATEGORY_LABEL: Record<string, string> = {
  exam: 'Exame', assessment: 'Avaliação', photo: 'Foto', general: 'Geral',
};

interface AthleteDoc {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  category: string;
  description: string | null;
  aiAnalysis: string | null;
  aiStatus: string;
  createdAt: string;
}

export default function DocumentsTab({ athleteId }: { athleteId: string }) {
  const [docs, setDocs] = useState<AthleteDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [aiUnavailable, setAiUnavailable] = useState<string | null>(null);
  const [docError, setDocError] = useState<Record<string, string>>({});

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/athlete-documents/athlete/${athleteId}`);
      setDocs(Array.isArray(data) ? data : []);
      setLoadError('');
    } catch (e) {
      setDocs([]);
      setLoadError(friendlyError(e, 'Não foi possível carregar os documentos.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [athleteId]);

  const handleAnalyze = async (docId: string) => {
    setAnalyzingId(docId);
    setDocError((p) => { const n = { ...p }; delete n[docId]; return n; });
    try {
      const { data } = await api.post(`/athlete-documents/${docId}/analyze`);
      setDocs(prev =>
        prev.map(d =>
          d.id === docId
            ? { ...d, aiAnalysis: data?.aiAnalysis ?? d.aiAnalysis, aiStatus: data?.aiStatus ?? 'DONE' }
            : d
        )
      );
    } catch (e) {
      if (isAiNotConfigured(e)) {
        setAiUnavailable((e as any)?.response?.data?.message ?? null);
      } else {
        setDocError((p) => ({ ...p, [docId]: friendlyError(e, 'Não foi possível analisar o documento.') }));
      }
    } finally {
      setAnalyzingId(null);
    }
  };

  // Download autenticado (o storage é privado — nada de URL pública)
  const handleDownload = async (doc: AthleteDoc) => {
    setDownloadingId(doc.id);
    try {
      const res = await api.get(`/athlete-documents/${doc.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName || 'documento';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setDocError((p) => ({ ...p, [doc.id]: friendlyError(e, 'Não foi possível baixar o arquivo.') }));
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-gray-50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (loadError) {
    return <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">{loadError}</div>;
  }

  if (docs.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-2xl mb-2">📂</p>
        <p className="text-sm text-gray-400">Nenhum documento enviado ainda</p>
        <p className="text-xs text-gray-300 mt-1">O atleta pode enviar documentos pela aba &quot;Meus Documentos&quot;</p>
      </div>
    );
  }

  const anyUnavailable = aiUnavailable !== null || docs.some((d) => d.aiStatus === 'UNAVAILABLE');

  return (
    <div className="space-y-4">
      {anyUnavailable && <AiUnavailableNotice message={aiUnavailable ?? undefined} compact />}
      {docs.map(doc => (
        <div key={doc.id} className="border border-gray-100 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl shrink-0">
              {doc.fileType === 'image' ? '🖼️' : doc.fileType === 'pdf' ? '📄' : doc.fileType === 'excel' ? '📊' : '📎'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-900 break-all">{doc.fileName}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASS[doc.aiStatus] ?? STATUS_CLASS.PENDING}`}>
                  {STATUS_LABEL[doc.aiStatus] ?? 'Aguardando análise'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-400">
                  {CATEGORY_LABEL[doc.category] ?? doc.category}
                </span>
              </div>

              {doc.description && (
                <p className="text-xs text-gray-400 mt-0.5">{doc.description}</p>
              )}
              <p className="text-xs text-gray-300 mt-1">
                {formatInstant(doc.createdAt)}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => handleDownload(doc)}
                  disabled={downloadingId === doc.id}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 cursor-pointer"
                >
                  {downloadingId === doc.id ? 'Baixando…' : 'Baixar arquivo'}
                </button>
              </div>
              {docError[doc.id] && <p className="mt-2 text-xs text-red-600">{docError[doc.id]}</p>}

              {doc.aiAnalysis && (
                <div className="mt-3 p-3 rounded-xl bg-gradient-to-br from-red-50 to-orange-50 border border-red-100">
                  <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Análise IA</p>
                  <p className="text-xs text-gray-700 leading-relaxed">{doc.aiAnalysis}</p>
                </div>
              )}

              {doc.aiStatus !== 'DONE' && doc.aiStatus !== 'PROCESSING' && !(anyUnavailable && doc.aiStatus === 'UNAVAILABLE' && aiUnavailable !== null) && (
                <button
                  onClick={() => handleAnalyze(doc.id)}
                  disabled={analyzingId === doc.id}
                  className="mt-3 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[#DC2626]/30 text-[#DC2626] hover:bg-red-50 transition disabled:opacity-50 cursor-pointer"
                >
                  {analyzingId === doc.id ? (
                    <>
                      <span className="w-3 h-3 border border-red-300 border-t-red-600 rounded-full animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    doc.aiStatus === 'FAILED' ? 'Tentar análise novamente' : 'Analisar com IA'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
