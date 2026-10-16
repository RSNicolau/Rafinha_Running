import { AsaasService } from './asaas.service';

function jsonRes(body: any, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as any;
}

describe('AsaasService', () => {
  const OLD_ENV = process.env;
  let fetchMock: jest.Mock;
  let svc: AsaasService;

  beforeEach(() => {
    process.env = { ...OLD_ENV, ASAAS_API_KEY: 'key_test', ASAAS_BASE_URL: 'https://asaas.test/v3/', ASAAS_WEBHOOK_TOKEN: 'whk_secret' };
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    svc = new AsaasService();
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('reuses an existing customer found by CPF (no POST)', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ data: [{ id: 'cus_existing', email: 'M@x.com' }] }));
    const id = await svc.findOrCreateCustomer({ name: 'Maria', cpfCnpj: '529.982.247-25', email: 'm@x.com' });
    expect(id).toBe('cus_existing');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://asaas.test/v3/customers?cpfCnpj=52998224725');
    expect(init.headers.access_token).toBe('key_test');
    expect(init.headers['User-Agent']).toBe('rr-rafinha-running');
  });

  it("does not reuse someone else's customer when the e-mail differs (creates a new one)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ data: [{ id: 'cus_victim', email: 'dono@x.com' }] }))
      .mockResolvedValueOnce(jsonRes({ id: 'cus_new' }));
    expect(await svc.findOrCreateCustomer({ name: 'Visitante', cpfCnpj: '52998224725', email: 'outro@x.com' })).toBe('cus_new');
  });

  it('never logs the CPF from the query string', async () => {
    const errSpy = jest.spyOn((svc as any).logger, 'error').mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(jsonRes({ errors: [{ description: 'falha' }] }, 500));
    await expect(svc.findOrCreateCustomer({ name: 'M', cpfCnpj: '52998224725', email: 'm@x.com' })).rejects.toThrow();
    const logged = errSpy.mock.calls.map((c) => String(c[0])).join(' ');
    expect(logged).not.toContain('52998224725');
    expect(logged).toContain('cpfCnpj=***');
  });

  it('creates a customer when none exists (skipping deleted ones)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ data: [{ id: 'cus_old', deleted: true }] }))
      .mockResolvedValueOnce(jsonRes({ id: 'cus_new' }));
    const id = await svc.findOrCreateCustomer({ name: 'Maria', cpfCnpj: '52998224725', email: 'm@x.com', mobilePhone: '(21) 99999-0000' });
    expect(id).toBe('cus_new');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://asaas.test/v3/customers');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ name: 'Maria', cpfCnpj: '52998224725', email: 'm@x.com', mobilePhone: '21999990000' });
  });

  it('creates a payment sending value in reais with 2 decimals', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ id: 'pay_1', status: 'PENDING', invoiceUrl: 'https://inv' }));
    const p = await svc.createPayment({
      customer: 'cus_1', billingType: 'PIX', valueInCents: 12990, dueDate: '2026-10-14', description: 'Camisa', externalReference: 'our-uuid',
    });
    expect(p.id).toBe('pay_1');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      customer: 'cus_1', billingType: 'PIX', value: 129.9, dueDate: '2026-10-14', description: 'Camisa', externalReference: 'our-uuid',
    });
  });

  it('fetches the pix QR code', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ encodedImage: 'BASE64', payload: '000201...', expirationDate: '2026-10-15 23:59:59' }));
    const qr = await svc.getPixQrCode('pay_1');
    expect(qr.payload).toBe('000201...');
    expect(fetchMock.mock.calls[0][0]).toBe('https://asaas.test/v3/payments/pay_1/pixQrCode');
  });

  it('maps gateway errors to a 502 with the Asaas description', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ errors: [{ description: 'CPF inválido' }] }, 400));
    await expect(svc.getPayment('x')).rejects.toThrow('Asaas: CPF inválido');
  });

  it('refuses to call the API without ASAAS_API_KEY (503)', async () => {
    delete process.env.ASAAS_API_KEY;
    await expect(svc.getPayment('x')).rejects.toThrow('ASAAS_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancelPayment is best-effort (never throws)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await expect(svc.cancelPayment('pay_1')).resolves.toBe(false);
  });

  describe('verifyWebhookToken', () => {
    it('accepts the configured token', () => expect(svc.verifyWebhookToken('whk_secret')).toBe(true));
    it('rejects a wrong token', () => expect(svc.verifyWebhookToken('whk_secreX')).toBe(false));
    it('rejects a missing header', () => expect(svc.verifyWebhookToken(undefined)).toBe(false));
    it('rejects everything when ASAAS_WEBHOOK_TOKEN is unset (fail-closed)', () => {
      delete process.env.ASAAS_WEBHOOK_TOKEN;
      expect(svc.verifyWebhookToken('whk_secret')).toBe(false);
      expect(svc.verifyWebhookToken('')).toBe(false);
    });
  });
});
