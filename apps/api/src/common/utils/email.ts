/**
 * E-mails são case-insensitive em todo o sistema: SEMPRE gravar/consultar a forma normalizada
 * (trim + minúsculas). A migração 20261015000200_email_lowercase normaliza as linhas existentes;
 * as consultas ainda usam `mode: 'insensitive'` como fallback para linhas legadas com maiúsculas.
 */
export function normalizeEmail(email: string | null | undefined): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/** Filtro Prisma de igualdade case-insensitive para campos de e-mail. */
export function emailEquals(email: string | null | undefined) {
  return { equals: normalizeEmail(email), mode: 'insensitive' as const };
}

/**
 * Busca usuário por e-mail: primeiro pelo índice único (forma normalizada); se não achar,
 * fallback case-insensitive (linha legada com maiúsculas). `args` = select/include opcionais.
 */
export async function findUserByEmail<T = any>(prisma: any, email: string | null | undefined, args: Record<string, any> = {}): Promise<T | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const exact = await prisma.user.findUnique({ where: { email: normalized }, ...args });
  if (exact) return exact;
  if (!prisma.user.findFirst) return null;
  return prisma.user.findFirst({ where: { email: emailEquals(normalized) }, ...args });
}

/** Chaves de objeto cujo valor string é tratado como e-mail (normalização global no ValidationPipe). */
export const EMAIL_KEY_RE = /^(email|[a-z]+Email)$/;

/** Normaliza recursivamente propriedades de e-mail (email, customerEmail, buyer.email...) de um DTO já transformado. */
export function normalizeEmailFields<T>(value: T, depth = 0): T {
  if (!value || typeof value !== 'object' || depth > 5) return value;
  if (Array.isArray(value)) {
    for (const v of value) normalizeEmailFields(v, depth + 1);
    return value;
  }
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  for (const key of Object.keys(value as any)) {
    const v = (value as any)[key];
    if (typeof v === 'string' && EMAIL_KEY_RE.test(key)) (value as any)[key] = normalizeEmail(v);
    else if (v && typeof v === 'object') normalizeEmailFields(v, depth + 1);
  }
  return value;
}
