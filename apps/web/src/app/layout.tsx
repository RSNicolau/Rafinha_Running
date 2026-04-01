import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RR - Rafinha Running | Painel',
  description: 'Plataforma de assessoria de corrida — Painel do Coach',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased font-sans bg-background text-gray-900">
        {children}
      </body>
    </html>
  );
}
