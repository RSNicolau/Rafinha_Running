import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';

export const locales = ['pt-BR', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'pt-BR';

export default getRequestConfig(async () => {
  // Detect locale from Accept-Language header, defaulting to pt-BR
  const headersList = await headers();
  const acceptLanguage = headersList.get('accept-language') || '';
  const locale: Locale = acceptLanguage.includes('en') && !acceptLanguage.startsWith('pt')
    ? 'en'
    : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
