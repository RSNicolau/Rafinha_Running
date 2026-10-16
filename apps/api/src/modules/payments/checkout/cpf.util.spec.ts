import { isValidCpf, isValidCnpj, isValidCpfCnpj } from './cpf.util';

describe('cpf.util', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])('valid CPF %s', (c) => expect(isValidCpf(c)).toBe(true));
  it.each(['529.982.247-24', '111.111.111-11', '123', '', null])('invalid CPF %s', (c) => expect(isValidCpf(c as any)).toBe(false));
  it('validates CNPJ', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
  });
  it('isValidCpfCnpj accepts both', () => {
    expect(isValidCpfCnpj('52998224725')).toBe(true);
    expect(isValidCpfCnpj('11222333000181')).toBe(true);
    expect(isValidCpfCnpj('1122233300018')).toBe(false);
  });
});
