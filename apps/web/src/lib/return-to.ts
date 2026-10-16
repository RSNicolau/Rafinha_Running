/**
 * "Voltar para onde estava" após o login.
 *
 * Fontes (em ordem): query `?redirect=`, query `?next=` e a chave `rr_return_to` do localStorage
 * (gravada, por exemplo, pela página pública de evento antes de mandar o visitante para o login).
 *
 * Só aceitamos caminhos RELATIVOS do mesmo site (começando com "/" e não com "//" ou "/\")
 * para evitar open redirect.
 */

export const RETURN_TO_STORAGE_KEY = 'rr_return_to';

/** Áreas para onde o retorno tem prioridade sobre o roteamento por assinatura/perfil. */
const PRIORITY_PREFIXES = ['/eventos', '/loja', '/pedido', '/join', '/onboarding'];

/** Retorna o caminho se for um destino interno seguro; caso contrário, null. */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > 2048) return null;
  if (!value.startsWith('/')) return null;
  // "//host" e "/\host" são interpretados pelo navegador como URL de outro domínio
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  // Caracteres de controle/espacos podem ser normalizados pelo navegador em algo perigoso
  if (/[\u0000-\u001F\u007F\\]/.test(value)) return null;
  // Confirma que, resolvido contra a origem atual, continua na mesma origem
  if (typeof window !== 'undefined') {
    try {
      const url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin) return null;
    } catch {
      return null;
    }
  }
  return value;
}

/**
 * Lê (e consome) o destino de retorno. A chave do localStorage é sempre removida, mesmo quando
 * a query string tem precedência, para não "vazar" para um login futuro.
 */
export function consumeReturnTo(searchParams?: { get(name: string): string | null } | null): string | null {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(RETURN_TO_STORAGE_KEY);
    localStorage.removeItem(RETURN_TO_STORAGE_KEY);
  } catch {
    stored = null;
  }
  return (
    sanitizeReturnTo(searchParams?.get('redirect')) ??
    sanitizeReturnTo(searchParams?.get('next')) ??
    sanitizeReturnTo(stored)
  );
}

/** true quando o retorno deve vencer o roteamento padrão (assinatura/perfil). */
export function isPriorityReturnTo(path: string | null | undefined): path is string {
  if (!path) return false;
  const pathname = path.split(/[?#]/)[0];
  return PRIORITY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
