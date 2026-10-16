import {
  IsEmail, IsString, IsNotEmpty, IsOptional, IsObject, MaxLength, Matches, Equals, IsBoolean, IsIn,
  IsEnum, IsArray, ArrayMaxSize, IsInt, Min, Max, IsUUID, ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { QuestionType } from '@prisma/client';

export class SubmitOnboardingDto {
  @ApiProperty({ example: 'João Silva', description: 'Nome completo do atleta' })
  @IsString({ message: 'Nome é obrigatório' })
  @IsNotEmpty({ message: 'Nome não pode ser vazio' })
  @MaxLength(120, { message: 'Nome muito longo' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  athleteName: string;

  @ApiProperty({ example: 'joao@email.com', description: 'Email do atleta' })
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(254, { message: 'E-mail muito longo' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  athleteEmail: string;

  @ApiPropertyOptional({ example: '11999999999', description: 'Telefone do atleta (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Telefone muito longo' })
  @Matches(/^[\d\s\+\-\(\)]{7,20}$/, { message: 'Telefone inválido' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  athletePhone?: string;

  @ApiProperty({ description: 'Respostas do questionário (chave = ID da pergunta)' })
  @IsObject({ message: 'Respostas devem ser um objeto' })
  answers: Record<string, any>;

  @ApiPropertyOptional({ description: 'Código de indicação (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  referralCode?: string;

  // ── LGPD ──
  @ApiProperty({ example: true, description: 'Aceite dos Termos de Uso e da Política de Privacidade' })
  @Equals(true, { message: 'É necessário aceitar os Termos de Uso e a Política de Privacidade' })
  acceptTerms: boolean;

  @ApiProperty({ example: '2026-10-14' })
  @IsString({ message: 'Versão dos Termos de Uso é obrigatória' })
  @IsNotEmpty({ message: 'Versão dos Termos de Uso é obrigatória' })
  @MaxLength(32)
  termsVersion: string;

  @ApiProperty({ example: '2026-10-14' })
  @IsString({ message: 'Versão da Política de Privacidade é obrigatória' })
  @IsNotEmpty({ message: 'Versão da Política de Privacidade é obrigatória' })
  @MaxLength(32)
  privacyVersion: string;

  @ApiProperty({ example: true, description: 'Consentimento específico para tratamento de dados de saúde (anamnese) — LGPD art. 11' })
  @Equals(true, { message: 'É necessário consentir com o tratamento dos seus dados de saúde (anamnese)' })
  healthDataConsent: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;
}

const PLAN_TYPES = ['mensal', 'trimestral', 'semestral', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL'];

/** Checkout público após o submit — identificado pelo onboardingToken opaco (nunca pelo athleteId). */
export class OnboardingBuyerDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsString({ message: 'Informe o CPF' }) @IsNotEmpty({ message: 'Informe o CPF' }) @MaxLength(20) cpf: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
}

export class CreateCheckoutDto {
  @ApiProperty({ description: 'onboardingToken retornado pelo submit' })
  @IsString({ message: 'onboardingToken é obrigatório' })
  @IsNotEmpty({ message: 'onboardingToken é obrigatório' })
  @MaxLength(512)
  onboardingToken: string;

  @ApiPropertyOptional({ enum: PLAN_TYPES, example: 'mensal' })
  @IsOptional()
  @IsIn(PLAN_TYPES, { message: 'Plano inválido' })
  planType?: string;

  @ApiPropertyOptional({ description: 'TeamPlan.id (planos de GET /teams/public/:slug)' })
  @IsOptional()
  @IsUUID(undefined, { message: 'Plano inválido' })
  planId?: string;

  @ApiPropertyOptional({ enum: ['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'], default: 'PIX' })
  @IsOptional()
  @IsIn(['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'], { message: 'Forma de pagamento inválida' })
  billingType?: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';

  @ApiPropertyOptional({ description: 'Dados do pagador (CPF obrigatório para emitir a cobrança; não é armazenado)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => OnboardingBuyerDto)
  buyer?: OnboardingBuyerDto;
}

/** Checkout autenticado (atleta logado). */
export class MyCheckoutDto {
  @ApiPropertyOptional({ enum: PLAN_TYPES, example: 'mensal' })
  @IsOptional()
  @IsIn(PLAN_TYPES, { message: 'Plano inválido' })
  planType?: string;

  @IsOptional() @IsUUID(undefined, { message: 'Plano inválido' }) planId?: string;
  @IsOptional() @IsIn(['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'], { message: 'Forma de pagamento inválida' })
  billingType?: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';
  @IsOptional() @ValidateNested() @Type(() => OnboardingBuyerDto) buyer?: OnboardingBuyerDto;
}

// ── Coach: formulário ──

export class UpdateOnboardingFormDto {
  @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class AddQuestionDto {
  @IsString() @IsNotEmpty({ message: 'Pergunta obrigatória' }) @MaxLength(500)
  question: string;

  @IsEnum(QuestionType, { message: 'Tipo de pergunta inválido' })
  type: QuestionType;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(200, { each: true })
  options?: string[];

  @IsOptional() @IsBoolean()
  required?: boolean;

  @IsOptional() @IsString() @MaxLength(200)
  placeholder?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  aiHint?: string;
}

export class UpdateQuestionDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(500)
  question?: string;

  @IsOptional() @IsEnum(QuestionType, { message: 'Tipo de pergunta inválido' })
  type?: QuestionType;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(200, { each: true })
  options?: string[];

  @IsOptional() @IsBoolean()
  required?: boolean;

  @IsOptional() @IsString() @MaxLength(200)
  placeholder?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  aiHint?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(1000)
  order?: number;
}

export class QuestionOrderDto {
  @IsUUID('all')
  id: string;

  @IsInt() @Min(0) @Max(1000)
  order: number;
}

export class ReorderQuestionsDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => QuestionOrderDto)
  orders: QuestionOrderDto[];
}
