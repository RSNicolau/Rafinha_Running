import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

/** Resposta normalizada de erros que não são HttpException (Prisma, erros inesperados). */
export interface MappedError {
  status: number;
  message: string;
  error: string;
}

const PRISMA_KNOWN = 'PrismaClientKnownRequestError';
const PRISMA_VALIDATION = 'PrismaClientValidationError';

function isPrismaKnownError(e: any): e is { code: string; meta?: Record<string, unknown> } {
  return !!e && typeof e === 'object' && (e.name === PRISMA_KNOWN || e.constructor?.name === PRISMA_KNOWN) && typeof e.code === 'string';
}

/**
 * Rede de segurança: converte erros conhecidos do Prisma em 4xx com mensagem em PT,
 * em vez de 500. Retorna null quando o erro não é mapeável.
 */
export function mapPrismaError(exception: unknown): MappedError | null {
  const e: any = exception;
  if (isPrismaKnownError(e)) {
    switch (e.code) {
      case 'P2002':
        return { status: HttpStatus.CONFLICT, message: 'Já existe um registro com esses dados.', error: 'Conflict' };
      case 'P2025':
      case 'P2001':
        return { status: HttpStatus.NOT_FOUND, message: 'Registro não encontrado.', error: 'Not Found' };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Referência inválida: o registro relacionado não existe.',
          error: 'Bad Request',
        };
      case 'P2000':
        return { status: HttpStatus.BAD_REQUEST, message: 'Valor muito longo para um dos campos.', error: 'Bad Request' };
      case 'P2006':
      case 'P2007':
      case 'P2023':
        return { status: HttpStatus.BAD_REQUEST, message: 'Dados inválidos.', error: 'Bad Request' };
      default:
        return null;
    }
  }
  if (e && typeof e === 'object' && (e.name === PRISMA_VALIDATION || e.constructor?.name === PRISMA_VALIDATION)) {
    // Ex.: findUnique({ where: { token: undefined } }) — entrada ausente/inválida que escapou da validação
    return { status: HttpStatus.BAD_REQUEST, message: 'Requisição inválida.', error: 'Bad Request' };
  }
  return null;
}

/**
 * Erros 4xx no estilo http-errors (body-parser, multer etc.: têm `status`/`statusCode` numérico).
 * Mantém o status em vez de virar 500, com mensagem em PT (nunca o texto técnico em inglês).
 */
export function mapClientError(exception: unknown): MappedError | null {
  const e: any = exception;
  if (!e || typeof e !== 'object') return null;
  const status = Number(e.status ?? e.statusCode);
  if (!Number.isInteger(status) || status < 400 || status > 499) return null;
  if (e.type === 'entity.parse.failed') {
    return { status, message: 'Corpo da requisição inválido (JSON malformado).', error: 'Bad Request' };
  }
  if (e.type === 'entity.too.large' || status === 413) {
    return { status: 413, message: 'Conteúdo muito grande.', error: 'Payload Too Large' };
  }
  const generic: Record<number, [string, string]> = {
    400: ['Requisição inválida.', 'Bad Request'],
    401: ['Não autenticado.', 'Unauthorized'],
    403: ['Acesso negado.', 'Forbidden'],
    404: ['Não encontrado.', 'Not Found'],
    409: ['Conflito com o estado atual do registro.', 'Conflict'],
    415: ['Tipo de conteúdo não suportado.', 'Unsupported Media Type'],
    429: ['Muitas requisições. Aguarde um pouco e tente novamente.', 'Too Many Requests'],
  };
  const [message, error] = generic[status] ?? ['Requisição inválida.', 'Bad Request'];
  return { status, message, error };
}

/** Mensagens do multer (repassadas pelo FileInterceptor do Nest como HttpException) → PT. */
const MULTER_MESSAGES: Record<string, string> = {
  'File too large': 'Arquivo muito grande',
  'Too many files': 'Arquivos demais no envio',
  'Too many parts': 'Envio com partes demais',
  'Too many fields': 'Campos demais no envio',
  'Field name too long': 'Nome de campo muito longo',
  'Field value too long': 'Valor de campo muito longo',
  'Unexpected field': 'Campo de arquivo inesperado',
  'Field name missing': 'Nome do campo de arquivo ausente',
};

export function translateMulterBody(status: number, body: Record<string, unknown>): Record<string, unknown> {
  const msg = typeof body?.message === 'string' ? body.message : null;
  if (!msg || !MULTER_MESSAGES[msg]) return body;
  return { ...body, statusCode: status, message: MULTER_MESSAGES[msg] };
}

/**
 * Filtro global. HttpException mantém exatamente o corpo que o Nest já devolvia
 * ({ statusCode, message, error }) — o front depende desse formato. Erros do Prisma
 * viram 4xx em PT; o resto vira 500 genérico (sem stack), registrado no log/Sentry.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      // WebSocket/RPC têm seus próprios filtros; não interferir
      throw exception;
    }
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<any>();
    const request = ctx.getRequest<any>();
    if (!response || typeof response.status !== 'function' || response.headersSent) return;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const body =
        typeof res === 'string'
          ? { statusCode: status, message: res }
          : (res as Record<string, unknown>);
      if (status >= 500) this.report(exception, request);
      response.status(status).json(translateMulterBody(status, body as Record<string, unknown>));
      return;
    }

    const mapped = mapPrismaError(exception);
    if (mapped) {
      const e: any = exception;
      this.logger.warn(
        `${request?.method ?? ''} ${request?.url ?? ''} → ${mapped.status} (Prisma ${e?.code ?? e?.name ?? ''})`,
      );
      response.status(mapped.status).json({ statusCode: mapped.status, message: mapped.message, error: mapped.error });
      return;
    }

    const client = mapClientError(exception);
    if (client) {
      response.status(client.status).json({ statusCode: client.status, message: client.message, error: client.error });
      return;
    }

    this.report(exception, request);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor',
      error: 'Internal Server Error',
    });
  }

  private report(exception: unknown, request: any) {
    const e: any = exception;
    this.logger.error(
      `${request?.method ?? ''} ${request?.url ?? ''} → ${e?.message ?? String(exception)}`,
      e?.stack,
    );
    try {
      Sentry.captureException(exception);
    } catch {
      /* Sentry desabilitado */
    }
  }
}
