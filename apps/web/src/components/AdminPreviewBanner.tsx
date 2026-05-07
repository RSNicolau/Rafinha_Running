'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';

export function AdminPreviewBanner() {
  const { user } = useAuthStore();
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flag = localStorage.getItem('rr_view_as_athlete') === 'true';
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
    setPreviewing(flag && isAdmin);
  }, [user?.role]);

  if (!previewing) return null;

  const exit = () => {
    localStorage.removeItem('rr_view_as_athlete');
    window.location.href = '/dashboard';
  };

  return (
    <div className="sticky top-0 z-50 bg-amber-400 text-amber-950 px-4 py-2.5 flex items-center justify-center gap-3 text-xs font-semibold shadow-md">
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span className="hidden sm:inline">Modo preview — você está visualizando a interface do atleta</span>
      <span className="sm:hidden">Preview Atleta</span>
      <button
        onClick={exit}
        className="ml-2 px-3 py-1 rounded-md bg-amber-950 text-amber-50 hover:bg-amber-900 transition text-[11px]"
      >
        ← Voltar ao Painel
      </button>
    </div>
  );
}
