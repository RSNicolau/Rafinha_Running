/**
 * Constantes legais do app móvel.
 * As versões DEVEM ser iguais às de apps/api/src/modules/legal/legal.constants.ts
 * e apps/web/src/lib/legal.ts.
 */
export const TERMS_VERSION = '2026-10-14';
export const PRIVACY_VERSION = '2026-10-14';

/** Base do site onde ficam /termos e /privacidade */
export const LEGAL_WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://rafinharunning.com.br').replace(/\/$/, '');

export const LEGAL_URLS = {
  terms: `${LEGAL_WEB_URL}/termos`,
  privacy: `${LEGAL_WEB_URL}/privacidade`,
  myData: `${LEGAL_WEB_URL}/privacidade/meus-dados`,
} as const;

export interface ConsentState {
  terms: boolean;
  health: boolean;
  age: boolean;
  marketing: boolean;
}

export const EMPTY_CONSENT: ConsentState = { terms: false, health: false, age: false, marketing: false };

export function isConsentComplete(c: ConsentState, requireHealth: boolean): boolean {
  return c.terms && c.age && (!requireHealth || c.health);
}

export function registerConsentPayload(marketingOptIn: boolean) {
  return {
    acceptTerms: true as const,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    marketingOptIn,
  };
}
