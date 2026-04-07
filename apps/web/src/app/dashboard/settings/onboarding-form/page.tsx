'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

const QUESTION_TYPE_LABELS: Record<string, string> = {
  TEXT: 'Texto curto',
  TEXTAREA: 'Texto longo',
  SELECT: 'Seleção única',
  MULTISELECT: 'Múltipla escolha',
  NUMBER: 'Número',
  TIME: 'Tempo (mm:ss)',
  DATE: 'Data',
  SCALE: 'Escala 1-10',
  BOOLEAN: 'Sim / Não',
};

interface Question {
  id: string;
  order: number;
  question: string;
  type: string;
  options?: string[] | null;
  required: boolean;
  placeholder?: string | null;
  isActive: boolean;
}

interface Form {
  id: string;
  title: string;
  description?: string | null;
  isActive: boolean;
  questions: Question[];
}

const BLANK_Q = {
  question: '',
  type: 'TEXT',
  options: '',
  required: true,
  placeholder: '',
};

export default function OnboardingFormEditorPage() {
  const { user } = useAuthStore();
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingQ, setEditingQ] = useState<Question | null>(null);
  const [newQ, setNewQ] = useState({ ...BLANK_Q });
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const formUrl = user?.id ? `${baseUrl}/onboarding/${user.id}` : '';

  useEffect(() => {
    api.get('/onboarding/form')
      .then(r => setForm(r.data))
      .catch(() => toast.error('Erro ao carregar formulário'))
      .finally(() => setLoading(false));
  }, []);

  const copyLink = () => {
    navigator.clipboard.writeText(formUrl);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
    toast.success('Link copiado!');
  };

  const handleAddQuestion = async () => {
    if (!newQ.question.trim()) { toast.error('Informe o texto da pergunta'); return; }
    setSaving(true);
    try {
      const opts = newQ.type === 'SELECT' || newQ.type === 'MULTISELECT'
        ? newQ.options.split('\n').map(o => o.trim()).filter(Boolean)
        : undefined;
      const { data } = await api.post('/onboarding/form/questions', {
        question: newQ.question,
        type: newQ.type,
        options: opts,
        required: newQ.required,
        placeholder: newQ.placeholder || undefined,
      });
      setForm(prev => prev ? { ...prev, questions: [...prev.questions, data] } : prev);
      setNewQ({ ...BLANK_Q });
      setShowAddModal(false);
      toast.success('Pergunta adicionada');
    } catch {
      toast.error('Erro ao adicionar pergunta');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateQuestion = async () => {
    if (!editingQ) return;
    setSaving(true);
    try {
      const opts = editingQ.type === 'SELECT' || editingQ.type === 'MULTISELECT'
        ? (typeof editingQ.options === 'string'
          ? (editingQ.options as unknown as string).split('\n').map(o => o.trim()).filter(Boolean)
          : editingQ.options)
        : undefined;
      const { data } = await api.put(`/onboarding/form/questions/${editingQ.id}`, {
        question: editingQ.question,
        type: editingQ.type,
        options: opts,
        required: editingQ.required,
        placeholder: editingQ.placeholder || undefined,
      });
      setForm(prev => prev ? { ...prev, questions: prev.questions.map(q => q.id === data.id ? data : q) } : prev);
      setEditingQ(null);
      toast.success('Pergunta atualizada');
    } catch {
      toast.error('Erro ao atualizar pergunta');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleQuestion = async (q: Question) => {
    try {
      await api.put(`/onboarding/form/questions/${q.id}`, { isActive: !q.isActive });
      setForm(prev => prev ? { ...prev, questions: prev.questions.map(qq => qq.id === q.id ? { ...qq, isActive: !q.isActive } : qq) } : prev);
    } catch {
      toast.error('Erro ao atualizar pergunta');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (!form) return null;

  const activeQ = form.questions.filter(q => q.isActive).sort((a, b) => a.order - b.order);
  const inactiveQ = form.questions.filter(q => !q.isActive);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/settings" className="text-gray-400 hover:text-gray-600 transition cursor-pointer">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">Questionário de Anamnese</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure as perguntas que seus novos atletas irão responder</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition cursor-pointer"
        >
          + Pergunta
        </button>
      </div>

      {/* Share link */}
      <div className="glass-card p-4 mb-6 border border-dashed border-primary/30">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Link do Formulário</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={formUrl}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 bg-gray-50 focus:outline-none"
          />
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-300 transition cursor-pointer"
          >
            {copying ? '✓ Copiado' : 'Copiar'}
          </button>
          <a
            href={formUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-100 text-sm font-medium text-gray-600 hover:bg-gray-200 transition"
          >
            Preview →
          </a>
        </div>
      </div>

      {/* Active questions */}
      <div className="glass-card p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Perguntas Ativas ({activeQ.length})
          </h2>
        </div>

        {activeQ.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhuma pergunta ativa</p>
        ) : (
          <div className="space-y-2">
            {activeQ.map((q, idx) => (
              <div key={q.id} className="flex items-start gap-3 p-3.5 rounded-xl border border-gray-100 hover:border-gray-200 group">
                <span className="text-xs font-bold text-gray-400 mt-0.5 w-5 shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 mb-0.5">{q.question}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      {QUESTION_TYPE_LABELS[q.type] || q.type}
                    </span>
                    {q.required && (
                      <span className="text-[10px] text-red-400">obrigatória</span>
                    )}
                    {q.options && q.options.length > 0 && (
                      <span className="text-[10px] text-gray-400">{q.options.length} opções</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditingQ({ ...q, options: q.options ?? null })}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                    title="Editar"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleToggleQuestion(q)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-50 transition cursor-pointer"
                    title="Desativar"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inactive questions */}
      {inactiveQ.length > 0 && (
        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Perguntas Desativadas ({inactiveQ.length})
          </h2>
          <div className="space-y-2">
            {inactiveQ.map(q => (
              <div key={q.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 opacity-50 group">
                <p className="text-sm text-gray-500 flex-1">{q.question}</p>
                <button
                  onClick={() => handleToggleQuestion(q)}
                  className="text-xs text-primary font-medium hover:underline cursor-pointer"
                >
                  Ativar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Question Modal */}
      {showAddModal && (
        <QuestionModal
          title="Nova Pergunta"
          q={newQ}
          setQ={setNewQ as any}
          onSave={handleAddQuestion}
          onClose={() => { setShowAddModal(false); setNewQ({ ...BLANK_Q }); }}
          saving={saving}
        />
      )}

      {/* Edit Question Modal */}
      {editingQ && (
        <QuestionModal
          title="Editar Pergunta"
          q={{
            question: editingQ.question,
            type: editingQ.type,
            options: Array.isArray(editingQ.options) ? editingQ.options.join('\n') : '',
            required: editingQ.required,
            placeholder: editingQ.placeholder || '',
          }}
          setQ={(u: any) => setEditingQ(prev => prev ? { ...prev, ...u } : prev)}
          onSave={handleUpdateQuestion}
          onClose={() => setEditingQ(null)}
          saving={saving}
        />
      )}
    </div>
  );
}

function QuestionModal({ title, q, setQ, onSave, onClose, saving }: {
  title: string;
  q: any;
  setQ: (u: any) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  const needsOptions = q.type === 'SELECT' || q.type === 'MULTISELECT';
  const optionsValue = Array.isArray(q.options) ? q.options.join('\n') : (q.options || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Texto da Pergunta *</label>
            <textarea
              value={q.question}
              onChange={e => setQ({ question: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none"
              placeholder="Digite o texto da pergunta..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo de Resposta</label>
            <select
              value={q.type}
              onChange={e => setQ({ type: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary"
            >
              {Object.entries(QUESTION_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {needsOptions && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Opções (uma por linha)
              </label>
              <textarea
                value={optionsValue}
                onChange={e => setQ({ options: e.target.value })}
                rows={5}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none font-mono"
                placeholder={'Opção 1\nOpção 2\nOpção 3'}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Placeholder (opcional)</label>
            <input
              type="text"
              value={q.placeholder}
              onChange={e => setQ({ placeholder: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-primary"
              placeholder="Texto de exemplo..."
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={q.required}
              onChange={e => setQ({ required: e.target.checked })}
              className="w-4 h-4 rounded accent-primary"
            />
            <span className="text-sm text-gray-700">Pergunta obrigatória</span>
          </label>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-300 transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
