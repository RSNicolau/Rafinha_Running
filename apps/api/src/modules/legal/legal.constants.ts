/**
 * Versões vigentes dos documentos legais.
 * Ao alterar o texto de /termos ou /privacidade (apps/web), atualize a versão aqui
 * e em apps/web/src/lib/legal.ts — usuários com versão antiga serão solicitados a aceitar de novo.
 */
export const TERMS_VERSION = '2026-10-14';
export const PRIVACY_VERSION = '2026-10-14';

/** Prazo (dias) para responder solicitações do titular — compromisso da Política de Privacidade. */
export const DATA_REQUEST_RESPONSE_DAYS = 15;

/** Exportação de dados ("Baixar meus dados"): máximo de 3 por hora por usuário. */
export const EXPORT_RATE_LIMIT_MAX = 3;
export const EXPORT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
