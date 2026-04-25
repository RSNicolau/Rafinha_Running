'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

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

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/athlete-documents/athlete/${athleteId}`);
      setDocs(data ?? []);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [athleteId]);

  const handleAnalyze = async (docId: string) => {
    setAnalyzingId(docId);
    try {
      const { data } = await api.post(`/athlete-documents/${docId}/analyze`);
      setDocs(prev =>
        prev.map(d =>
          d.id === docId
            ? { ...d, aiAnalysis: data.aiAnalysis ?? d.aiAnalysis, aiStatus: 'DONE' }
            : d
        )
      );
    } catch {
      alert('Erro ao solicitar análise');
    } finally {
      setAnalyzingId(null);
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

  if (docs.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-2xl mb-2">📂</p>
        <p className="text-sm text-gray-400">Nenhum documento enviado ainda</p>
        <p className="text-xs text-gray-300 mt-1">O atleta pode enviar documentos pela aba &quot;Meus Documentos&quot;</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {docs.map(doc => (
        <div key={doc.id} className="border border-gray-100 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl shrink-0">
              {doc.fileType === 'image' ? '🖼️' : doc.fileType === 'pdf' ? '📄' : doc.fileType === 'excel' ? '📊' : '📎'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-gray-900 hover:text-primary truncate transition-colors"
                >
                  {doc.fileName}
                </a>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  doc.aiStatus === 'DONE' ? 'bg-emerald-100 text-emerald-700' :
                  doc.aiStatus === 'PROCESSING' ? 'bg-blue-100 text-blue-700' :
                  doc.aiStatus === 'FAILED' ? 'bg-red-100 text-red-600' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {doc.aiStatus === 'DONE' ? 'Concluído' :
                   doc.aiStatus === 'PROCESSING' ? 'Analisando...' :
                   doc.aiStatus === 'FAILED' ? 'Erro' : 'Pendente'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-400 capitalize">
                  {doc.category}
                </span>
              </div>

              {doc.description && (
                <p className="text-xs text-gray-400 mt-0.5">{doc.description}</p>
              )}
              <p className="text-xs text-gray-300 mt-1">
                {new Date(doc.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>

              {doc.aiAnalysis && (
                <div className="mt-3 p-3 rounded-xl bg-gradient-to-br from-red-50 to-orange-50 border border-red-100">
                  <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Análise IA</p>
                  <p className="text-xs text-gray-700 leading-relaxed">{doc.aiAnalysis}</p>
                </div>
              )}

              {doc.aiStatus !== 'DONE' && doc.aiStatus !== 'PROCESSING' && (
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
                    'Analisar com IA'
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
