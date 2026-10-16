import { applyDecorators, BadRequestException } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Política de senha: 8–128 caracteres, com pelo menos uma letra e um número. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_POLICY_MESSAGE =
  'A senha deve ter no mínimo 8 caracteres, com pelo menos uma letra e um número';
const LETTER_AND_DIGIT = /^(?=.*\p{L})(?=.*\d).*$/su;

/** Retorna a mensagem de erro (PT) ou null quando a senha atende à política. */
export function passwordPolicyError(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) return PASSWORD_POLICY_MESSAGE;
  if (password.length > PASSWORD_MAX_LENGTH) return `A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres`;
  if (!LETTER_AND_DIGIT.test(password)) return PASSWORD_POLICY_MESSAGE;
  return null;
}

/** Defesa em profundidade nos services (o DTO já valida). */
export function assertPasswordPolicy(password: unknown): void {
  const err = passwordPolicyError(password);
  if (err) throw new BadRequestException(err);
}

/** Decorator de DTO com a política de senha completa (mensagens em PT). */
export function IsStrongPassword() {
  return applyDecorators(
    IsString({ message: 'Senha é obrigatória' }),
    MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_POLICY_MESSAGE }),
    MaxLength(PASSWORD_MAX_LENGTH, { message: `A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres` }),
    Matches(LETTER_AND_DIGIT, { message: PASSWORD_POLICY_MESSAGE }),
  );
}
