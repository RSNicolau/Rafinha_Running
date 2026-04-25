'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

// Categorias
const CATEGORIES = [
  { value: 'exam', label: '🔬 Exame Médico', desc: 'Hemograma, cardíaco, hormonal' },
  { value: 'assessment', label: '📏 Avaliação Física', desc: 'Composição corporal, VO2max' },
  { value: 'photo', label: '📸 Foto de Progresso', desc: 'Antes/depois, postura' },
  { value: 'general', label: '📎 Outro', desc: 'Qualquer documento relevante' },
];

// Interface para documento
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

export default function AthleteDocumentsPage() {
  const [docs, setDocs] = useState<AthleteDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('exam');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const fetchDocs = () => {
    api.get('/athlete-documents/my').then(r => setDocs(r.data)).catch(() => {});
  };

  useEffect(() => { fetchDocs(); }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('category', selectedCategory);
      if (description) fd.append('description', description);
      await api.post('/athlete-documents/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setUploadSuccess(true);
      setSelectedFile(null);
      setDescription('');
      fetchDocs();
      setTimeout(() => setUploadSuccess(false), 4000);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erro ao enviar documento');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Meus Documentos</h1>
      <p className="text-sm text-gray-500 mb-8">
        Envie exames, avaliações físicas e fotos. Seu coach e a IA irão analisar e personalizar seus treinos.
      </p>

      {/* Upload form */}
      <div className="glass-card p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Enviar novo documento</h2>
        <form onSubmit={handleUpload} className="space-y-4">
          {/* Category selector */}
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setSelectedCategory(c.value)}
                className={`p-3 rounded-xl text-left border transition ${
                  selectedCategory === c.value
                    ? 'border-primary bg-red-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{c.desc}</p>
              </button>
            ))}
          </div>

          {/* File picker */}
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
              selectedFile ? 'border-primary bg-red-50' : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => document.getElementById('doc-file-input')?.click()}
          >
            {selectedFile ? (
              <div>
                <p className="text-sm font-medium text-primary">{selectedFile.name}</p>
                <p className="text-xs text-gray-400 mt-1">{(selectedFile.size / 1024).toFixed(0)} KB</p>
              </div>
            ) : (
              <div>
                <p className="text-2xl mb-2">📎</p>
                <p className="text-sm text-gray-600">Clique para selecionar arquivo</p>
                <p className="text-xs text-gray-400 mt-1">PDF, imagem, Excel — até 20MB</p>
              </div>
            )}
            <input
              id="doc-file-input"
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.csv"
              onChange={e => setSelectedFile(e.target.files?.[0] || null)}
            />
          </div>

          {/* Description */}
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Descrição opcional (ex: 'Hemograma de abril 2026')"
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
          />

          {uploadSuccess && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
              Documento enviado! Seu coach será notificado e a IA irá analisar em breve.
            </div>
          )}

          <button
            type="submit"
            disabled={!selectedFile || uploading}
            className="w-full py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition disabled:opacity-40"
          >
            {uploading ? 'Enviando...' : 'Enviar para o Coach'}
          </button>
        </form>
      </div>

      {/* Document list */}
      {docs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Documentos enviados</h2>
          {docs.map(doc => (
            <div key={doc.id} className="glass-card p-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl shrink-0">
                  {doc.fileType === 'image' ? '🖼️' : doc.fileType === 'pdf' ? '📄' : doc.fileType === 'excel' ? '📊' : '📎'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.fileName}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      doc.aiStatus === 'DONE' ? 'bg-emerald-100 text-emerald-700' :
                      doc.aiStatus === 'PROCESSING' ? 'bg-blue-100 text-blue-700' :
                      doc.aiStatus === 'FAILED' ? 'bg-red-100 text-red-600' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {doc.aiStatus === 'DONE' ? 'Analisado' :
                       doc.aiStatus === 'PROCESSING' ? 'Analisando...' :
                       doc.aiStatus === 'FAILED' ? 'Erro' : 'Aguardando'}
                    </span>
                  </div>
                  {doc.description && <p className="text-xs text-gray-400 mt-0.5">{doc.description}</p>}
                  <p className="text-xs text-gray-300 mt-1">{new Date(doc.createdAt).toLocaleDateString('pt-BR')}</p>
                  {doc.aiAnalysis && (
                    <div className="mt-3 p-3 rounded-xl bg-gradient-to-br from-red-50 to-orange-50 border border-red-100">
                      <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">Análise do Coach IA</p>
                      <p className="text-xs text-gray-700 leading-relaxed">{doc.aiAnalysis}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
