import { decrypt, encrypt, isValidEncryptionKey } from './encryption';

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('encryption util', () => {
  const OLD = { key: process.env.ENCRYPTION_KEY, env: process.env.NODE_ENV };
  const KEY = 'a'.repeat(64);

  afterEach(() => {
    restore('ENCRYPTION_KEY', OLD.key);
    restore('NODE_ENV', OLD.env);
  });

  it('criptografa e descriptografa com chave válida', () => {
    process.env.ENCRYPTION_KEY = KEY;
    const c = encrypt('segredo');
    expect(c).not.toBe('segredo');
    expect(decrypt(c)).toBe('segredo');
  });

  it('em produção, sem chave, lança em vez de gravar texto puro', () => {
    delete process.env.ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
    expect(() => encrypt('segredo')).toThrow(/ENCRYPTION_KEY/);
  });

  it('em produção, chave inválida também lança', () => {
    process.env.ENCRYPTION_KEY = 'curta';
    process.env.NODE_ENV = 'production';
    expect(() => encrypt('segredo')).toThrow();
  });

  it('fora de produção, sem chave, mantém compatibilidade (texto puro)', () => {
    delete process.env.ENCRYPTION_KEY;
    process.env.NODE_ENV = 'development';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(encrypt('x')).toBe('x');
    warn.mockRestore();
  });

  it('isValidEncryptionKey exige 32 bytes hex', () => {
    expect(isValidEncryptionKey(KEY)).toBe(true);
    expect(isValidEncryptionKey('zz'.repeat(32))).toBe(false);
    expect(isValidEncryptionKey(undefined)).toBe(false);
  });
});
