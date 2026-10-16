import { BadRequestException } from '@nestjs/common';

/** Slugs públicos (ex.: /onboarding/<slug>, /loja/<slug>): minúsculas, dígitos e hífen, 3–40 caracteres. */
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Palavras reservadas — colidem com rotas do app/API ou induzem a erro. */
export const RESERVED_SLUGS = new Set([
  'admin', 'administrador', 'api', 'app', 'auth', 'login', 'logout', 'register', 'cadastro',
  'dashboard', 'super-admin', 'superadmin', 'athlete', 'athlete-login', 'athlete-register',
  'atleta', 'coach', 'treinador', 'join', 'convite', 'onboarding', 'loja', 'store', 'eventos',
  'events', 'pricing', 'planos', 'subscribe', 'pedido', 'checkout', 'termos', 'privacidade',
  'legal', 'suporte', 'support', 'help', 'ajuda', 'static', 'assets', 'public', 'health',
  'metrics', 'docs', 'www', 'mail', 'root', 'system', 'null', 'undefined',
  'offline', 'landing', 'agendar', 'white-label', 'forgot-password', 'reset-password',
]);

/**
 * Normaliza (trim + minúsculas) e valida um slug. Lança 400 com mensagem em PT se inválido.
 * Não "conserta" silenciosamente caracteres inválidos — o admin precisa ver o erro.
 */
export function sanitizeSlug(raw: unknown): string {
  if (typeof raw !== 'string') throw new BadRequestException('Slug é obrigatório');
  const slug = raw.trim().toLowerCase();
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    throw new BadRequestException(`O slug deve ter entre ${SLUG_MIN_LENGTH} e ${SLUG_MAX_LENGTH} caracteres`);
  }
  if (!SLUG_REGEX.test(slug)) {
    throw new BadRequestException(
      'O slug deve conter apenas letras minúsculas sem acento, números e hífens (sem hífen no início/fim ou repetido)',
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new BadRequestException('Este slug é reservado. Escolha outro.');
  }
  return slug;
}
