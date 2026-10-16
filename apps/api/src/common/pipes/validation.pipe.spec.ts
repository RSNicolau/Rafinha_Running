import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID,
  Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { buildValidationPipe, translateConstraint } from './validation.pipe';

enum Cor { AZUL = 'AZUL', VERDE = 'VERDE' }

class ItemDto {
  @IsInt() qty: number;
}

class SampleDto {
  @IsEmail() email: string;
  @IsNotEmpty() @IsString() name: string;
  @IsOptional() @MinLength(3) @MaxLength(5) code?: string;
  @IsOptional() @IsInt() @Min(1) @Max(10) rpe?: number;
  @IsOptional() @IsEnum(Cor) cor?: Cor;
  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsBoolean() flag?: boolean;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @MinLength(3, { message: 'Mensagem customizada mantida' }) custom?: string;
  @IsOptional() @ValidateNested({ each: true }) @Type(() => ItemDto) items?: ItemDto[];
}

const pipe = buildValidationPipe();
async function messagesFor(body: any): Promise<string[]> {
  try {
    await pipe.transform(body, { type: 'body', metatype: SampleDto });
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    return ((e as BadRequestException).getResponse() as any).message;
  }
  return [];
}

describe('ValidationPipe global — mensagens em PT', () => {
  it('traduz as mensagens padrão dos decorators comuns', async () => {
    const msgs = await messagesFor({
      email: 'x', name: '', code: 'ab', rpe: 0, cor: 'ROXO', id: 'nao-uuid', date: 'ontem',
    });
    expect(msgs).toEqual(expect.arrayContaining([
      'E-mail deve ser um e-mail válido',
      'Nome é obrigatório',
      'Código deve ter no mínimo 3 caracteres',
      'Esforço (RPE) deve ser no mínimo 1',
      'cor deve ser um dos valores: AZUL, VERDE',
      'id deve ser um identificador (UUID) válido',
      'Data deve ser uma data válida',
    ]));
    expect(msgs.join(' ')).not.toMatch(/must|should/);
  });

  it('maxLength, max, isInt e isString', async () => {
    const msgs = await messagesFor({ email: 'a@b.com', name: null, code: 'abcdefg', rpe: 11.5 });
    expect(msgs).toEqual(expect.arrayContaining([
      'Nome deve ser um texto',
      'Código deve ter no máximo 5 caracteres',
      'Esforço (RPE) deve ser no máximo 10',
      'Esforço (RPE) deve ser um número inteiro',
    ]));
  });

  it('whitelist: "property X should not exist" → "Campo X não é permitido"', async () => {
    const msgs = await messagesFor({ email: 'a@b.com', name: 'A', role: 'SUPER_ADMIN' });
    expect(msgs).toEqual(['Campo role não é permitido']);
  });

  it('mensagens customizadas ficam como estão', async () => {
    const msgs = await messagesFor({ email: 'a@b.com', name: 'A', custom: 'ab' });
    expect(msgs).toEqual(['Mensagem customizada mantida']);
  });

  it('campos aninhados usam o caminho completo', async () => {
    const msgs = await messagesFor({ email: 'a@b.com', name: 'A', items: [{ qty: 'x' }] });
    expect(msgs).toEqual(['items.0.qty deve ser um número inteiro']);
  });

  it('payload válido passa', async () => {
    await expect(pipe.transform({ email: 'a@b.com', name: 'A' }, { type: 'body', metatype: SampleDto })).resolves.toBeTruthy();
  });

  it('translateConstraint não traduz mensagens que não são o padrão', () => {
    expect(translateConstraint('isEmail', 'E-mail inválido', 'email')).toBe('E-mail inválido');
    expect(translateConstraint('desconhecido', 'x must be y', 'x')).toBe('x must be y');
    expect(translateConstraint('isBoolean', 'flag must be a boolean value', 'flag')).toBe('flag deve ser verdadeiro ou falso');
    expect(translateConstraint('whitelistValidation', 'property role should not exist', 'role')).toBe('Campo role não é permitido');
    expect(translateConstraint('isString', 'each value in tags must be a string', 'tags')).toBe('Cada item de tags deve ser um texto');
  });
});

describe('validation pipe — rótulos, dedupe e e-mail (reteste)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cv = require('class-validator');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ct = require('class-transformer');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { buildValidationPipe: build, fieldLabel } = require('./validation.pipe');

  class Buyer {
    @cv.IsEmail() email!: string;
  }
  class ProductDto {
    @cv.IsInt() @cv.Min(0) priceInCents!: number;
    @cv.IsInt() totalStock!: number;
    @cv.IsNumber() @cv.Max(100) platformFeePercent!: number;
    @cv.IsString() @cv.MinLength(8) password!: string;
    @cv.IsOptional() @cv.IsEmail() customerEmail?: string;
    @cv.IsOptional() @cv.ValidateNested() @ct.Type(() => Buyer) buyer?: Buyer;
    @cv.IsOptional() @cv.IsArray() @cv.IsInt({ each: true }) @cv.Min(1, { each: true }) qtys?: number[];
  }
  const p = build();
  const meta = { type: 'body', metatype: ProductDto } as any;
  const msgs = async (body: any) => (await p.transform(body, meta).catch((e: any) => e)).getResponse().message as string[];

  it('usa rótulos em PT (Preço, Estoque, Taxa da plataforma, Senha, E-mail aninhado)', async () => {
    const m = await msgs({ priceInCents: -1, totalStock: 'x', platformFeePercent: 200, password: 'a', buyer: { email: 'nope' } });
    expect(m).toEqual(expect.arrayContaining([
      'Preço deve ser no mínimo 0',
      'Estoque deve ser um número inteiro',
      'Taxa da plataforma deve ser no máximo 100',
      'Senha deve ter no mínimo 8 caracteres',
      'E-mail deve ser um e-mail válido',
    ]));
    expect(fieldLabel('buyer.email')).toBe('E-mail');
    expect(fieldLabel('semRotulo')).toBe('semRotulo');
    for (const [f, l] of Object.entries({
      amountInCents: 'Valor', amountMl: 'Quantidade (ml)', cardToken: 'Cartão', distanceMeters: 'Distância (m)',
      durationSeconds: 'Duração (s)', mealName: 'Nome da refeição', mfaToken: 'Código de verificação',
      onboardingToken: 'Sessão de cadastro', refId: 'Referência', registrationId: 'Inscrição', athleteDiscountPercent: 'Desconto para alunos',
    })) expect(fieldLabel(f)).toBe(l);
  });

  it('mensagens repetidas aparecem uma vez só', async () => {
    const m = await msgs({ priceInCents: 1, totalStock: 1, platformFeePercent: 1, password: '12345678', qtys: [0, 0, 0] });
    expect(m.filter((x) => x === 'Cada item de qtys deve ser no mínimo 1')).toHaveLength(1);
  });

  it('normaliza e-mails (trim + minúsculas) no corpo, aninhados e em parâmetros', async () => {
    const out = await p.transform(
      { priceInCents: 1, totalStock: 1, platformFeePercent: 1, password: '12345678', customerEmail: ' Ana@X.COM', buyer: { email: 'B@Y.com ' } },
      meta,
    );
    expect(out.customerEmail).toBe('ana@x.com');
    expect(out.buyer.email).toBe('b@y.com');
    expect(await p.transform(' Q@W.com', { type: 'query', metatype: String, data: 'email' } as any)).toBe('q@w.com');
    expect(await p.transform('ABC', { type: 'param', metatype: String, data: 'id' } as any)).toBe('ABC');
  });
});
