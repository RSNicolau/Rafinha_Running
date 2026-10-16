import { BadRequestException } from '@nestjs/common';
import { sanitizeSlug } from './slug';
import { assertPasswordPolicy, passwordPolicyError, PASSWORD_POLICY_MESSAGE } from './password-policy';

describe('sanitizeSlug (B1 plataforma / B6)', () => {
  it('normaliza para minúsculas e remove espaços nas pontas', () => {
    expect(sanitizeSlug('  Rafinha-Run ')).toBe('rafinha-run');
    expect(sanitizeSlug('equipe-2026')).toBe('equipe-2026');
  });
  it.each([
    '../<script>alert(1)</script>',
    'ab',
    'a'.repeat(41),
    'com espaço',
    'acentuação',
    '-inicio',
    'fim-',
    'duplo--hifen',
    'under_score',
  ])('rejeita %p com 400', (slug) => {
    expect(() => sanitizeSlug(slug)).toThrow(BadRequestException);
  });
  it.each(['admin', 'api', 'dashboard', 'login', 'super-admin', 'loja'])('rejeita palavra reservada %p', (slug) => {
    expect(() => sanitizeSlug(slug)).toThrow('Este slug é reservado. Escolha outro.');
  });
  it('rejeita não-string', () => {
    expect(() => sanitizeSlug(undefined)).toThrow(BadRequestException);
    expect(() => sanitizeSlug(123)).toThrow(BadRequestException);
  });
});

describe('política de senha (atleta B1)', () => {
  it.each(['12345678', 'abcdefgh', 'abc123', '', '        '])('rejeita %p', (p) => {
    expect(passwordPolicyError(p)).toBe(PASSWORD_POLICY_MESSAGE);
    expect(() => assertPasswordPolicy(p)).toThrow(BadRequestException);
  });
  it('rejeita acima de 128', () => {
    expect(passwordPolicyError('a1'.repeat(65))).toMatch(/no máximo 128/);
  });
  it.each(['corrida2026', 'A1bcdefg', 'senha com espaço 9', 'ção12345'])('aceita %p', (p) => {
    expect(passwordPolicyError(p)).toBeNull();
    expect(() => assertPasswordPolicy(p)).not.toThrow();
  });
});
