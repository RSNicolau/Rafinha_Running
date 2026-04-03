'use client';
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif', textAlign: 'center', padding: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111', marginBottom: '8px' }}>Algo deu errado</h2>
          <p style={{ color: '#666', marginBottom: '24px' }}>Ocorreu um erro inesperado. Nossa equipe foi notificada.</p>
          <button onClick={reset} style={{ padding: '10px 20px', background: '#DC2626', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
