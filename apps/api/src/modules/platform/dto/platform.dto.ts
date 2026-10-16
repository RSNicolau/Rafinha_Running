import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsHexColor, IsIn, IsOptional, IsString, IsUrl, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CoachSubscriptionStatus, PlatformPlanType } from '@prisma/client';

const trim = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim() : value);

export class SubscribePlatformDto {
  @ApiProperty({ enum: PlatformPlanType })
  @IsEnum(PlatformPlanType, { message: 'Plano inválido' })
  plan: PlatformPlanType;

  @ApiPropertyOptional({ description: 'CPF/CNPJ do pagador (obrigatório para planos pagos via Asaas; não é armazenado)' })
  @IsOptional() @IsString() @MaxLength(20)
  cpf?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(3) @MaxLength(120)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ enum: ['ASAAS', 'STRIPE'] }) @IsOptional() @IsIn(['ASAAS', 'STRIPE'])
  provider?: 'ASAAS' | 'STRIPE';

  @ApiPropertyOptional({ enum: ['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'] })
  @IsOptional() @IsIn(['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'])
  method?: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';
}

/** White-label: apenas dados de marca. maxCoaches/status/ownerId nunca vêm do cliente. */
export class WhiteLabelDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(80)
  brandName: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(253)
  customDomain?: string;

  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_protocol: true }) @MaxLength(1000)
  logoUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsHexColor()
  primaryColor?: string;
}

export class WhiteLabelAddCoachDto {
  @ApiProperty() @IsUUID()
  coachId: string;
}

export class AdminSetPlanDto {
  @ApiProperty({ enum: PlatformPlanType }) @IsEnum(PlatformPlanType)
  plan: PlatformPlanType;

  @ApiProperty({ enum: CoachSubscriptionStatus }) @IsEnum(CoachSubscriptionStatus)
  status: CoachSubscriptionStatus;
}
