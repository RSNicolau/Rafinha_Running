import { ArgumentsHost, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter, mapClientError, mapPrismaError } from './http-exception.filter';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

function prismaKnown(code: string, meta?: any) {
  const e: any = new Error(`prisma ${code}`);
  e.name = 'PrismaClientKnownRequestError';
  e.code = code;
  e.meta = meta;
  return e;
}

function hostFor() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, headersSent: false };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ method: 'GET', url: '/x' }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('mapPrismaError', () => {
  it('P2002 → 409 em PT', () => {
    expect(mapPrismaError(prismaKnown('P2002', { target: ['slug'] }))).toEqual({
      status: 409,
      message: 'Já existe um registro com esses dados.',
      error: 'Conflict',
    });
  });
  it('P2025 → 404', () => {
    expect(mapPrismaError(prismaKnown('P2025'))?.status).toBe(404);
    expect(mapPrismaError(prismaKnown('P2025'))?.message).toBe('Registro não encontrado.');
  });
  it('P2003 → 400', () => {
    expect(mapPrismaError(prismaKnown('P2003'))?.status).toBe(400);
  });
  it('PrismaClientValidationError (ex.: where token undefined) → 400', () => {
    const e: any = new Error('Argument `where` ... needs at least one of `id` or `token`');
    e.name = 'PrismaClientValidationError';
    expect(mapPrismaError(e)?.status).toBe(400);
  });
  it('código desconhecido / erro comum → null', () => {
    expect(mapPrismaError(prismaKnown('P1001'))).toBeNull();
    expect(mapPrismaError(new Error('boom'))).toBeNull();
    expect(mapPrismaError(undefined)).toBeNull();
  });
});

describe('mapClientError', () => {
  it('JSON malformado do body-parser mantém 400 com mensagem em PT', () => {
    const e: any = new SyntaxError(`Unexpected token 'n', "null" is not valid JSON`);
    e.status = 400;
    e.type = 'entity.parse.failed';
    const m = mapClientError(e);
    expect(m?.status).toBe(400);
    expect(m?.message).not.toMatch(/Unexpected token/);
  });
  it('erro sem status 4xx → null', () => {
    expect(mapClientError(new Error('x'))).toBeNull();
    expect(mapClientError(Object.assign(new Error('x'), { status: 500 }))).toBeNull();
  });
});

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  beforeAll(() => jest.spyOn((filter as any).logger, 'error').mockImplementation(() => undefined));
  beforeAll(() => jest.spyOn((filter as any).logger, 'warn').mockImplementation(() => undefined));

  it('HttpException mantém o corpo original do Nest (formato que o front usa)', () => {
    const { host, status, json } = hostFor();
    filter.catch(new BadRequestException(['email deve ser um e-mail válido']), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ statusCode: 400, message: ['email deve ser um e-mail válido'], error: 'Bad Request' });

    const h2 = hostFor();
    filter.catch(new ConflictException('E-mail já cadastrado'), h2.host);
    expect(h2.json).toHaveBeenCalledWith({ statusCode: 409, message: 'E-mail já cadastrado', error: 'Conflict' });

    const h3 = hostFor();
    filter.catch(new NotFoundException(), h3.host);
    expect(h3.status).toHaveBeenCalledWith(404);
  });

  it('Prisma P2002 → 409, P2025 → 404, P2003 → 400 (sem 500)', () => {
    for (const [code, expected] of [['P2002', 409], ['P2025', 404], ['P2003', 400]] as const) {
      const { host, status, json } = hostFor();
      filter.catch(prismaKnown(code), host);
      expect(status).toHaveBeenCalledWith(expected);
      expect(json.mock.calls[0][0].statusCode).toBe(expected);
    }
  });

  it('erro inesperado → 500 genérico, sem vazar mensagem/stack', () => {
    const { host, status, json } = hostFor();
    filter.catch(new Error('segredo interno: senha do banco'), host);
    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body.message).toBe('Erro interno do servidor');
    expect(JSON.stringify(body)).not.toContain('segredo');
  });
});

describe('AllExceptionsFilter — multer (reteste)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AllExceptionsFilter: Filter } = require('./http-exception.filter');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PayloadTooLargeException: TooLarge, BadRequestException: BadReq } = require('@nestjs/common');
  function run(ex: any) {
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host: any = { getType: () => 'http', switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({}) }) };
    new Filter().catch(ex, host);
    return res;
  }
  it("'File too large' → 413 'Arquivo muito grande'", () => {
    const res = run(new TooLarge('File too large'));
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json.mock.calls[0][0].message).toBe('Arquivo muito grande');
  });
  it("'Unexpected field' → 400 em PT; outras mensagens intactas", () => {
    expect(run(new BadReq('Unexpected field')).json.mock.calls[0][0].message).toBe('Campo de arquivo inesperado');
    expect(run(new BadReq('Arquivo não enviado')).json.mock.calls[0][0].message).toBe('Arquivo não enviado');
  });
});
