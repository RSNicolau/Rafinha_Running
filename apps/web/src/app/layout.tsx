import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Toaster } from 'sonner';
import './globals.css';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://rafinharunning.com.br';

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'RR - Rafinha Running | Plataforma de Treino de Corrida',
    template: '%s | Rafinha Running',
  },
  description:
    'Assessoria de corrida profissional com planos personalizados, sincronização com Garmin, Strava e Apple Health, e acompanhamento em tempo real.',
  keywords: [
    'corrida', 'treino', 'assessoria esportiva', 'running coach',
    'plano de treino', 'Garmin', 'Strava', 'Apple Health',
  ],
  authors: [{ name: 'Rafinha Running' }],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: baseUrl,
    siteName: 'Rafinha Running',
    title: 'RR - Rafinha Running | Plataforma de Treino de Corrida',
    description:
      'Assessoria de corrida profissional com planos personalizados e acompanhamento em tempo real.',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Rafinha Running' }],
  },
  twitter: {
    card: 'summary',
    title: 'RR - Rafinha Running',
    description: 'Plataforma de treino de corrida personalizada.',
    images: ['/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/logo.png',
    apple: '/icons/icon-192.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RR Running',
  },
};

export const viewport: Viewport = {
  themeColor: '#DC2626',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="antialiased font-sans bg-background text-gray-900">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
