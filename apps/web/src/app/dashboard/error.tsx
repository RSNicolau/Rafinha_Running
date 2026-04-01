'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console (replace with Sentry when available)
    console.error('[Dashboard Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-5">
        <svg className="w-7 h-7 text-[#DC2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <h2 className="text-lg font-bold text-gray-900 mb-2">Algo deu errado</h2>
      <p className="text-sm text-gray-500 mb-6 max-w-sm">
        Ocorreu um erro inesperado nesta página. Se o problema persistir, entre em contato com o suporte.
      </p>
      <button
        onClick={reset}
        className="px-5 py-2.5 rounded-xl bg-primary hover:bg-red-700 text-white text-sm font-medium transition"
      >
        Tentar novamente
      </button>
    </div>
  );
}
