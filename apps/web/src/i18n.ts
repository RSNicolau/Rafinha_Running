import { getRequestConfig } from 'next-intl/server';

export const locales = ['pt-BR', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'pt-BR';

/**
 * As páginas públicas e o app são PT-BR. Por enquanto o locale é fixo em pt-BR,
 * sem negociar pelo Accept-Language (evita <html lang="en"> sobre conteúdo em português).
 * Quando houver tradução real, reintroduzir a negociação aqui.
 */
export default getRequestConfig(async () => {
  const locale: Locale = defaultLocale;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
