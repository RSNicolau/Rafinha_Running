import { IntegrationProvider } from '@prisma/client';

/**
 * Configuração por ambiente das integrações (VPS/docker — nada específico de Vercel/Railway).
 * Lido a cada chamada para refletir o env atual (e facilitar testes).
 */

const has = (name: string) => !!(process.env[name] && process.env[name]!.trim());

/** URL pública do front (mesma origem que faz proxy de /api/* para a API). Sem barra final. */
export function appUrl(): string {
  return (process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3001').trim().replace(/\/+$/, '');
}

/** Base pública da API como vista de fora (por padrão: APP_URL + /api/v1 via rewrite do Next). */
export function publicApiBaseUrl(): string {
  const explicit = process.env.API_PUBLIC_URL || process.env.API_BASE_URL;
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/+$/, '');
  return `${appUrl()}/api/v1`;
}

/** Página do front para onde o callback OAuth devolve o usuário (sempre APP_URL — sem open redirect). */
export function integrationsPageUrl(): string {
  return `${appUrl()}/dashboard/integrations`;
}

/** Esquema de deep link do app mobile (app.json → "scheme"). */
export function mobileScheme(): string {
  const s = (process.env.MOBILE_APP_SCHEME || 'rrrafinha').trim();
  return /^[a-z][a-z0-9+.-]*$/i.test(s) ? s : 'rrrafinha';
}

export function isStravaConfigured(): boolean {
  return has('STRAVA_CLIENT_ID') && has('STRAVA_CLIENT_SECRET');
}

export function isGarminConfigured(): boolean {
  return has('GARMIN_CLIENT_ID') && has('GARMIN_CLIENT_SECRET');
}

export function isCorosConfigured(): boolean {
  return has('COROS_CLIENT_ID') && has('COROS_CLIENT_SECRET');
}

export function isGoogleFitConfigured(): boolean {
  return has('GOOGLE_FIT_CLIENT_ID') && has('GOOGLE_FIT_CLIENT_SECRET');
}

export interface ProviderAvailability {
  provider: IntegrationProvider;
  available: boolean;
  primary?: boolean;
  /** Plataformas onde o conector pode ser oferecido. */
  platforms: Array<'web' | 'ios' | 'android'>;
  reason?: string;
}

export function providerAvailability(): ProviderAvailability[] {
  const all: Array<'web' | 'ios' | 'android'> = ['web', 'ios', 'android'];
  const viaStrava = 'Use Strava: conecte seu relógio à Strava e ele sincroniza aqui automaticamente.';
  return [
    {
      provider: IntegrationProvider.STRAVA,
      available: isStravaConfigured(),
      primary: true,
      platforms: all,
      ...(isStravaConfigured() ? {} : { reason: 'Strava ainda não configurado pelo administrador.' }),
    },
    {
      provider: IntegrationProvider.GARMIN,
      available: isGarminConfigured(),
      platforms: all,
      ...(isGarminConfigured() ? {} : { reason: `Integração direta Garmin indisponível. ${viaStrava}` }),
    },
    {
      provider: IntegrationProvider.COROS,
      available: isCorosConfigured(),
      platforms: all,
      ...(isCorosConfigured() ? {} : { reason: `Integração direta COROS indisponível. ${viaStrava}` }),
    },
    {
      provider: IntegrationProvider.GOOGLE_FIT,
      available: isGoogleFitConfigured(),
      platforms: all,
      ...(isGoogleFitConfigured() ? {} : { reason: `Google Fit indisponível. ${viaStrava}` }),
    },
    {
      provider: IntegrationProvider.POLAR,
      available: false,
      platforms: all,
      reason: `Integração direta Polar não disponível. ${viaStrava}`,
    },
    {
      provider: IntegrationProvider.APPLE_HEALTH,
      // HealthKit só existe no app iOS nativo — nunca no web/PWA.
      available: true,
      platforms: ['ios'],
      reason: 'Disponível apenas no app iOS. No navegador, conecte o Apple Watch à Strava.',
    },
  ];
}

export function isProviderConnectable(provider: IntegrationProvider): boolean {
  switch (provider) {
    case IntegrationProvider.STRAVA: return isStravaConfigured();
    case IntegrationProvider.GARMIN: return isGarminConfigured();
    case IntegrationProvider.COROS: return isCorosConfigured();
    case IntegrationProvider.GOOGLE_FIT: return isGoogleFitConfigured();
    default: return false;
  }
}
