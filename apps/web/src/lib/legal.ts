/**
 * Dados legais da plataforma — FONTE ÚNICA para Termos de Uso, Política de Privacidade,
 * consentimentos e rodapés.
 *
 * ⚠️ PREENCHA os campos marcados "não informado" antes do lançamento. Enquanto houver
 * placeholders, as páginas /termos e /privacidade exibem um aviso no topo (apenas em desenvolvimento).
 *
 * As versões abaixo DEVEM ser iguais às de apps/api/src/modules/legal/legal.constants.ts.
 * Ao alterar o texto de qualquer documento, atualize a versão (data AAAA-MM-DD) nos dois lugares:
 * usuários com versão antiga serão solicitados a aceitar novamente.
 */

export const TERMS_VERSION = '2026-10-14';
export const PRIVACY_VERSION = '2026-10-14';
/** Data de início de vigência exibida nos documentos (dd/mm/aaaa). */
export const LEGAL_EFFECTIVE_DATE = '14/10/2026';

export const LEGAL_COMPANY = {
  /** Nome comercial exibido ao usuário */
  tradeName: 'RR — Rafinha Running',
  /** Razão social da empresa controladora (pessoa jurídica de Rodrigo Nicolau) */
  legalName: '[RAZÃO SOCIAL — não informado]',
  cnpj: '[CNPJ — não informado]',
  address: '[ENDEREÇO — não informado]',
  /** E-mail de suporte geral */
  supportEmail: '[E-MAIL DE SUPORTE — não informado]',
  /** Encarregado pelo tratamento de dados pessoais (DPO) — LGPD art. 41 */
  dpoName: '[NOME DO ENCARREGADO/DPO — não informado]',
  dpoEmail: '[E-MAIL DO ENCARREGADO/DPO — não informado]',
  /** Foro eleito nos Termos de Uso (consumidores podem sempre litigar no próprio domicílio — CDC art. 101, I) */
  forumCity: '[FORO/CIDADE — não informado]',
  /** Provedor de hospedagem (VPS) e país dos servidores */
  hostingProvider: '[PROVEDOR DE HOSPEDAGEM/VPS — não informado]',
  hostingCountry: '[PAÍS DOS SERVIDORES — não informado]',
} as const;

/** Prazo (dias) para responder solicitações do titular — deve bater com DATA_REQUEST_RESPONSE_DAYS na API. */
export const DATA_REQUEST_RESPONSE_DAYS = 15;

export const LEGAL_ROUTES = {
  terms: '/termos',
  privacy: '/privacidade',
  myData: '/privacidade/meus-dados',
} as const;

/** true se algum dado da empresa ainda é placeholder. */
export function hasLegalPlaceholders(): boolean {
  return Object.values(LEGAL_COMPANY).some((v) => /não informado/i.test(v));
}

export function listLegalPlaceholders(): string[] {
  return Object.entries(LEGAL_COMPANY)
    .filter(([, v]) => /não informado/i.test(v))
    .map(([k]) => k);
}

/** Campos de consentimento enviados no cadastro (POST /auth/register). */
export function registerConsentPayload(marketingOptIn: boolean) {
  return {
    acceptTerms: true as const,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    marketingOptIn,
  };
}

export const CONSENT_LABELS = {
  terms: 'Li e aceito os Termos de Uso e a Política de Privacidade',
  health:
    'Autorizo o tratamento dos meus dados de saúde (anamnese, frequência cardíaca, avaliações físicas) para acompanhamento do meu treino pela minha assessoria',
  healthHint: 'Dados pessoais sensíveis — consentimento específico e destacado (LGPD art. 11, I). Você pode revogar quando quiser em "Meus dados".',
  age: 'Tenho 18 anos ou mais, ou tenho autorização do meu responsável legal',
  marketing: 'Quero receber novidades, conteúdos e ofertas por e-mail (opcional)',
} as const;

export const CONSENT_TYPE_LABELS: Record<string, string> = {
  TERMS: 'Termos de Uso',
  PRIVACY: 'Política de Privacidade',
  MARKETING: 'Comunicações de marketing',
  HEALTH_DATA: 'Dados de saúde',
};
