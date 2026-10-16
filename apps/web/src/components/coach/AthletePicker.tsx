'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export interface PickedAthlete {
  id: string; // userId do atleta
  name: string;
  email?: string;
}

interface Props {
  value: string;
  onChange: (athlete: PickedAthlete | null) => void;
  /** Nome exibido quando o valor vem de fora (ex.: ?athleteId= na URL). */
  initialLabel?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
}

const PAGE = 20;

/** Seletor de atleta com busca e paginação no servidor (/users/athletes?q=&page=). */
export default function AthletePicker({ value, onChange, initialLabel, disabled, required, id }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PickedAthlete[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState(initialLabel ?? '');
  const boxRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  useEffect(() => { if (initialLabel) setLabel(initialLabel); }, [initialLabel]);

  const load = (p: number, term: string) => {
    const rid = ++reqId.current;
    setLoading(true);
    api.get('/users/athletes', { params: { page: p, limit: PAGE, ...(term ? { q: term } : {}) } })
      .then(({ data }) => {
        if (rid !== reqId.current) return;
        const rows: any[] = Array.isArray(data) ? data : data?.data ?? [];
        const mapped = rows.map((a) => ({ id: a.user?.id ?? a.userId ?? a.id, name: a.user?.name ?? 'Atleta', email: a.user?.email }));
        setItems((prev) => (p === 1 ? mapped : [...prev, ...mapped]));
        setPage(p);
        setTotalPages(data?.totalPages ?? 1);
        setTotal(data?.total ?? mapped.length);
      })
      .catch(() => { if (rid === reqId.current && p === 1) setItems([]); })
      .finally(() => { if (rid === reqId.current) setLoading(false); });
  };

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(1, q.trim()), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-left focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
      >
        <span className={value ? 'text-gray-900 truncate' : 'text-gray-400'}>{value ? label || 'Atleta selecionado' : 'Selecione um atleta'}</span>
        <span className="text-gray-400 text-xs">▼</span>
      </button>
      {/* input oculto para validação nativa de formulário */}
      {required && <input tabIndex={-1} aria-hidden required value={value} onChange={() => {}} className="sr-only" />}

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome ou e-mail…"
              aria-label="Buscar atleta"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {items.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={a.id === value}
                  onClick={() => { setLabel(a.name); onChange(a); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${a.id === value ? 'bg-primary/5 text-primary' : 'text-gray-800'}`}
                >
                  <span className="block truncate font-medium">{a.name}</span>
                  {a.email && <span className="block truncate text-xs text-gray-400">{a.email}</span>}
                </button>
              </li>
            ))}
            {!loading && items.length === 0 && (
              <li className="px-3 py-3 text-sm text-gray-400">{q ? 'Nenhum atleta encontrado' : 'Nenhum atleta cadastrado'}</li>
            )}
            {loading && <li className="px-3 py-3 text-sm text-gray-400">Carregando…</li>}
          </ul>
          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 text-xs text-gray-400">
            <span>{items.length} de {total}</span>
            {page < totalPages && !loading && (
              <button type="button" onClick={() => load(page + 1, q.trim())} className="text-primary font-medium hover:underline">
                Carregar mais
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
