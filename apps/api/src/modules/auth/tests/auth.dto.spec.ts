import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto, ResetPasswordDto, MfaLoginDto, LogoutDto } from '../dto/auth.dto';
import { PASSWORD_POLICY_MESSAGE } from '../../../common/validators/password-policy';

async function errorsFor<T extends object>(cls: new () => T, body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(cls, body) as object, { whitelist: true, forbidNonWhitelisted: true });
  return errors.reduce<Record<string, string[]>>((acc, e) => {
    acc[e.property] = Object.values(e.constraints ?? {});
    return acc;
  }, {});
}

const base = {
  email: 'a@b.com',
  password: 'senhaforte1',
  name: 'Fulano',
  acceptTerms: true,
  termsVersion: '2026-10-14',
  privacyVersion: '2026-10-14',
};

describe('RegisterDto', () => {
  it('aceita payload válido de ATHLETE e COACH', async () => {
    expect(await errorsFor(RegisterDto, { ...base, role: 'ATHLETE' })).toEqual({});
    expect(await errorsFor(RegisterDto, { ...base, role: 'COACH', marketingOptIn: true })).toEqual({});
    expect(await errorsFor(RegisterDto, base)).toEqual({});
  });

  it.each(['SUPER_ADMIN', 'ADMIN', 'ROOT'])('rejeita role %s no auto-cadastro', async (role) => {
    const errs = await errorsFor(RegisterDto, { ...base, role });
    expect(errs.role).toBeDefined();
  });

  it('exige acceptTerms = true com mensagem em pt-BR', async () => {
    const missing = await errorsFor(RegisterDto, { ...base, acceptTerms: undefined });
    expect(missing.acceptTerms).toContain('É necessário aceitar os Termos de Uso e a Política de Privacidade');
    const falsy = await errorsFor(RegisterDto, { ...base, acceptTerms: false });
    expect(falsy.acceptTerms).toBeDefined();
  });

  it('exige termsVersion e privacyVersion', async () => {
    const errs = await errorsFor(RegisterDto, { ...base, termsVersion: undefined, privacyVersion: '' });
    expect(errs.termsVersion).toBeDefined();
    expect(errs.privacyVersion).toBeDefined();
  });
});

describe('ResetPasswordDto', () => {
  it('rejeita newPassword ausente ou curta', async () => {
    expect((await errorsFor(ResetPasswordDto, { email: 'a@b.com', token: 't' })).newPassword).toBeDefined();
    expect((await errorsFor(ResetPasswordDto, { email: 'a@b.com', token: 't', newPassword: '123' })).newPassword).toBeDefined();
    expect(await errorsFor(ResetPasswordDto, { email: 'a@b.com', token: 't', newPassword: 'senha1234' })).toEqual({});
  });

  it('rejeita senha sem letra ou sem número (B1), com mensagem em PT', async () => {
    const onlyDigits = await errorsFor(ResetPasswordDto, { email: 'a@b.com', token: 't', newPassword: '12345678' });
    expect(onlyDigits.newPassword).toContain(PASSWORD_POLICY_MESSAGE);
    const onlyLetters = await errorsFor(ResetPasswordDto, { email: 'a@b.com', token: 't', newPassword: 'abcdefgh' });
    expect(onlyLetters.newPassword).toContain(PASSWORD_POLICY_MESSAGE);
  });
});

describe('RegisterDto — política de senha (B1)', () => {
  it.each(['12345678', 'abcdefgh', 'abc123', ''])('rejeita senha fraca %p', async (password) => {
    const errs = await errorsFor(RegisterDto, { ...base, password });
    expect(errs.password).toBeDefined();
  });
  it.each(['senhaforte1', 'Ab3defgh', 'çãoáéí9x'])('aceita %p', async (password) => {
    expect(await errorsFor(RegisterDto, { ...base, password })).toEqual({});
  });
});

describe('LogoutDto', () => {
  it('aceita corpo vazio, refreshToken e allDevices', async () => {
    expect(await errorsFor(LogoutDto, {})).toEqual({});
    expect(await errorsFor(LogoutDto, { refreshToken: 'x', allDevices: true })).toEqual({});
    expect((await errorsFor(LogoutDto, { allDevices: 'sim' })).allDevices).toBeDefined();
  });
});

describe('MfaLoginDto', () => {
  it('exige código de 6 dígitos', async () => {
    expect((await errorsFor(MfaLoginDto, { mfaToken: 'x', code: '12ab56' })).code).toBeDefined();
    expect(await errorsFor(MfaLoginDto, { mfaToken: 'x', code: '123456' })).toEqual({});
  });
});
