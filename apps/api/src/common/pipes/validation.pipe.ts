import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { EMAIL_KEY_RE, normalizeEmail, normalizeEmailFields } from '../utils/email';

/**
 * Traduções das mensagens PADRÃO (inglês) do class-validator. Mensagens customizadas
 * (passadas em { message }) não casam com os padrões abaixo e são mantidas como estão.
 * Cada entrada: regex da mensagem padrão (sem o nome do campo) → tradutor.
 */
type Translator = (field: string, m: RegExpMatchArray) => string;

const DEFAULT_MESSAGES: Record<string, { re: RegExp; pt: Translator }> = {
  isEmail: { re: /must be an email$/, pt: (f) => `${f} deve ser um e-mail válido` },
  isNotEmpty: { re: /should not be empty$/, pt: (f) => `${f} é obrigatório` },
  isDefined: { re: /should not be null or undefined$/, pt: (f) => `${f} é obrigatório` },
  minLength: {
    re: /must be longer than or equal to (\d+) characters?$/,
    pt: (f, m) => `${f} deve ter no mínimo ${m[1]} caracteres`,
  },
  maxLength: {
    re: /must be shorter than or equal to (\d+) characters?$/,
    pt: (f, m) => `${f} deve ter no máximo ${m[1]} caracteres`,
  },
  isInt: { re: /must be an integer number$/, pt: (f) => `${f} deve ser um número inteiro` },
  isNumber: { re: /must be a number conforming to the specified constraints$/, pt: (f) => `${f} deve ser um número` },
  min: { re: /must not be less than (-?[\d.]+)$/, pt: (f, m) => `${f} deve ser no mínimo ${m[1]}` },
  max: { re: /must not be greater than (-?[\d.]+)$/, pt: (f, m) => `${f} deve ser no máximo ${m[1]}` },
  isEnum: { re: /must be one of the following values: (.*)$/, pt: (f, m) => `${f} deve ser um dos valores: ${m[1]}` },
  isIn: { re: /must be one of the following values: (.*)$/, pt: (f, m) => `${f} deve ser um dos valores: ${m[1]}` },
  isUuid: { re: /must be a UUID$/, pt: (f) => `${f} deve ser um identificador (UUID) válido` },
  isUUID: { re: /must be a UUID$/, pt: (f) => `${f} deve ser um identificador (UUID) válido` },
  isString: { re: /must be a string$/, pt: (f) => `${f} deve ser um texto` },
  isBoolean: { re: /must be a boolean value$/, pt: (f) => `${f} deve ser verdadeiro ou falso` },
  isDateString: { re: /must be a valid ISO 8601 date string$/, pt: (f) => `${f} deve ser uma data válida` },
  isIso8601: { re: /must be a valid ISO 8601 date string$/, pt: (f) => `${f} deve ser uma data válida` },
  isDate: { re: /must be a Date instance$/, pt: (f) => `${f} deve ser uma data válida` },
  isArray: { re: /must be an array$/, pt: (f) => `${f} deve ser uma lista` },
  isObject: { re: /must be an object$/, pt: (f) => `${f} deve ser um objeto` },
  isUrl: { re: /must be a URL address$/, pt: (f) => `${f} deve ser uma URL válida` },
  isPositive: { re: /must be a positive number$/, pt: (f) => `${f} deve ser um número positivo` },
  matches: { re: /must match .* regular expression$/, pt: (f) => `${f} está em formato inválido` },
  equals: { re: /must be equal to (.*)$/, pt: (f, m) => `${f} deve ser igual a ${m[1]}` },
  arrayMinSize: { re: /must contain at least (\d+) elements?$/, pt: (f, m) => `${f} deve ter pelo menos ${m[1]} itens` },
  arrayMaxSize: { re: /must contain no more than (\d+) elements?$/, pt: (f, m) => `${f} deve ter no máximo ${m[1]} itens` },
  isNumberString: { re: /must be a number string$/, pt: (f) => `${f} deve conter apenas números` },
};

/**
 * Rótulos em PT dos campos mais comuns dos DTOs (as mensagens padrão citam o nome do campo).
 * Campo aninhado usa o rótulo do último segmento ("buyer.email" → "E-mail"); campo sem rótulo fica como está.
 */
export const FIELD_LABELS: Record<string, string> = {
  name: 'Nome', email: 'E-mail', password: 'Senha', newPassword: 'Nova senha', currentPassword: 'Senha atual',
  phone: 'Telefone', cpf: 'CPF', title: 'Título', description: 'Descrição', message: 'Mensagem', content: 'Conteúdo',
  text: 'Texto', notes: 'Observações', note: 'Observação', coachNotes: 'Observações do treinador', reason: 'Motivo',
  question: 'Pergunta', type: 'Tipo', status: 'Status', role: 'Papel', category: 'Categoria', code: 'Código',
  date: 'Data', startDate: 'Data de início', endDate: 'Data de término', scheduledDate: 'Data agendada',
  eventDate: 'Data do evento', dateOfBirth: 'Data de nascimento', price: 'Preço', priceInCents: 'Preço',
  amount: 'Valor', value: 'Valor', quantity: 'Quantidade', totalStock: 'Estoque', stock: 'Estoque',
  platformFeePercent: 'Taxa da plataforma', discountPercent: 'Desconto', maxUses: 'Limite de usos',
  maxParticipants: 'Máximo de participantes', preOrderLimit: 'Limite de encomendas', preOrderDeadline: 'Prazo da encomenda',
  sizes: 'Tamanhos', size: 'Tamanho', color: 'Cor', primaryColor: 'Cor principal', secondaryColor: 'Cor secundária',
  logoUrl: 'Logo', bannerUrl: 'Banner', tenantName: 'Nome da assessoria', teamName: 'Nome da equipe', slug: 'Endereço (slug)',
  domain: 'Domínio', welcomeMsg: 'Mensagem de boas-vindas', planId: 'Plano', planType: 'Tipo de plano', plan: 'Plano',
  interval: 'Periodicidade', billingType: 'Forma de pagamento', method: 'Forma de pagamento', provider: 'Gateway',
  paymentEnabled: 'Pagamentos ativos', buyer: 'Comprador', shippingAddress: 'Endereço de entrega', city: 'Cidade',
  state: 'Estado', customerName: 'Nome do cliente', customerEmail: 'E-mail do cliente', customerPhone: 'Telefone do cliente',
  athleteId: 'Atleta', coachId: 'Treinador', teamId: 'Equipe', userId: 'Usuário', productId: 'Produto', eventId: 'Evento',
  distanceId: 'Percurso', token: 'Token', refreshToken: 'Token de sessão', acceptTerms: 'Aceite dos termos',
  termsVersion: 'Versão dos termos', privacyVersion: 'Versão da política de privacidade', marketingOptIn: 'Aceite de marketing',
  healthDataConsent: 'Consentimento de dados de saúde', weight: 'Peso', weightKg: 'Peso', height: 'Altura',
  restingHR: 'FC de repouso', maxHR: 'FC máxima', maxHeartRate: 'FC máxima', vo2max: 'VO2máx', weeklyGoalKm: 'Meta semanal (km)',
  goal: 'Objetivo', level: 'Nível', targetPace: 'Pace alvo', targetDistanceMeters: 'Distância alvo',
  targetDurationSeconds: 'Duração alvo', distanceKm: 'Distância (km)', durationMinutes: 'Duração (min)', rpe: 'Esforço (RPE)',
  calories: 'Calorias', protein: 'Proteína', carbs: 'Carboidratos', fat: 'Gordura', rating: 'Nota', sortOrder: 'Ordem',
  isActive: 'Ativo', page: 'Página', limit: 'Limite', search: 'Busca', options: 'Opções', required: 'Obrigatório',
  benefits: 'Benefícios', trackingCode: 'Código de rastreio', timezone: 'Fuso horário', location: 'Local',
  weeks: 'Semanas', weeklyFrequency: 'Frequência semanal', modality: 'Modalidade', niche: 'Nicho',
  amountInCents: 'Valor', amountMl: 'Quantidade (ml)', cardToken: 'Cartão', distanceMeters: 'Distância (m)',
  durationSeconds: 'Duração (s)', mealName: 'Nome da refeição', mfaToken: 'Código de verificação',
  onboardingToken: 'Sessão de cadastro', refId: 'Referência', registrationId: 'Inscrição',
  athleteDiscountPercent: 'Desconto para alunos', refToken: 'Token do pedido', useCredit: 'Usar crédito',
};

export function fieldLabel(path: string): string {
  const last = path.split('.').pop() ?? path;
  return FIELD_LABELS[last] ?? FIELD_LABELS[path] ?? path;
}

const WHITELIST_RE = /^property (.+) should not exist$/;
const NESTED_RE = /^nested property (.+) must be either object or array$/;

/**
 * Traduz uma mensagem do class-validator (se for a padrão em inglês); senão devolve a original.
 * `field` = nome simples do campo (como aparece na mensagem); `label` = como exibir (caminho completo).
 */
export function translateConstraint(constraint: string, message: string, field: string, label: string = field): string {
  if (constraint === 'whitelistValidation') {
    return WHITELIST_RE.test(message) ? `Campo ${label} não é permitido` : message;
  }
  if (constraint === 'nestedValidation') {
    return NESTED_RE.test(message) ? `${label} deve ser um objeto ou uma lista` : message;
  }
  const def = DEFAULT_MESSAGES[constraint];
  if (!def) return message;
  // Padrão do class-validator: "<campo> <texto>" ou "each value in <campo> <texto>"
  const each = message.startsWith('each value in ');
  const body = each ? message.slice('each value in '.length) : message;
  if (!body.startsWith(`${field} `)) return message;
  const m = body.slice(field.length + 1).match(new RegExp(`^${def.re.source}`));
  if (!m) return message;
  return def.pt(each ? `Cada item de ${label}` : label, m);
}

/** Achata a árvore de erros (como o Nest faz: filhos prefixados com o caminho do pai), traduzindo. */
export function flattenValidationErrors(errors: ValidationError[], parentPath = ''): string[] {
  const out: string[] = [];
  for (const err of errors) {
    const path = parentPath ? `${parentPath}.${err.property}` : err.property;
    if (err.constraints) {
      for (const [constraint, message] of Object.entries(err.constraints)) {
        const translated = translateConstraint(constraint, message, err.property, constraint === 'whitelistValidation' ? path : fieldLabel(path));
        // Mensagem customizada (não traduzida) em campo aninhado: mesmo prefixo que o Nest aplicava
        out.push(translated === message && parentPath ? `${parentPath}.${message}` : translated);
      }
    }
    if (err.children?.length) out.push(...flattenValidationErrors(err.children, path));
  }
  return out;
}

export function validationExceptionFactory(errors: ValidationError[]) {
  // dedupe: vários validadores/itens podem gerar a mesma frase ("Preço deve ser um número" ×2)
  return new BadRequestException(Array.from(new Set(flattenValidationErrors(errors))));
}

/**
 * ValidationPipe + normalização de e-mail: depois de validar/transformar, todo campo `email`/`*Email`
 * (string, em qualquer nível do corpo/query) e parâmetro primitivo chamado assim viram trim + minúsculas.
 */
export class AppValidationPipe extends ValidationPipe {
  async transform(value: any, metadata: ArgumentMetadata) {
    // normaliza ANTES de validar (" Ana@X.com" não deve falhar no @IsEmail) e de novo depois (campos transformados)
    if (value && typeof value === 'object' && (metadata.type === 'body' || metadata.type === 'query')) normalizeEmailFields(value);
    else if (typeof value === 'string' && metadata.data && EMAIL_KEY_RE.test(metadata.data)) value = normalizeEmail(value);
    const out = await super.transform(value, metadata);
    if (typeof out === 'string') {
      return metadata.data && EMAIL_KEY_RE.test(metadata.data) ? normalizeEmail(out) : out;
    }
    if (metadata.type === 'body' || metadata.type === 'query') return normalizeEmailFields(out);
    return out;
  }
}

/** ValidationPipe global da API (mesmas opções de antes + mensagens em PT + e-mails normalizados). */
export function buildValidationPipe() {
  return new AppValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: validationExceptionFactory,
  });
}
