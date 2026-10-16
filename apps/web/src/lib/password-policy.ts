/** Mesma política da API (apps/api/src/common/validators/password-policy.ts). */
export const PASSWORD_POLICY_HINT = 'Mínimo 8 caracteres, com letras e números';
export const PASSWORD_POLICY_MESSAGE =
  'A senha deve ter no mínimo 8 caracteres, com pelo menos uma letra e um número';

export function passwordPolicyError(password: string): string | null {
  if (!password) return 'Senha é obrigatória';
  if (password.length < 8 || !/\p{L}/u.test(password) || !/\d/.test(password)) return PASSWORD_POLICY_MESSAGE;
  if (password.length > 128) return 'A senha deve ter no máximo 128 caracteres';
  return null;
}
