import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CheckoutBuyerDto } from '../../payments/checkout/dto/create-checkout.dto';

export const MEMBERSHIP_BILLING_TYPES = ['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'] as const;
export type MembershipBillingType = (typeof MEMBERSHIP_BILLING_TYPES)[number];

export class SubscribeMembershipDto {
  @ApiProperty({ description: 'TeamPlan.id (plano da equipe do atleta)' })
  @IsUUID()
  planId: string;

  @ApiProperty({ type: CheckoutBuyerDto, description: 'CPF só é usado para emitir a cobrança — nunca armazenado' })
  @ValidateNested()
  @Type(() => CheckoutBuyerDto)
  buyer: CheckoutBuyerDto;

  @ApiPropertyOptional({ enum: MEMBERSHIP_BILLING_TYPES, default: 'PIX' })
  @IsOptional()
  @IsIn(MEMBERSHIP_BILLING_TYPES as unknown as string[])
  billingType?: MembershipBillingType;

  @ApiPropertyOptional({ default: true, description: 'Abater o crédito de indicação na 1ª cobrança (mínimo cobrado R$5)' })
  @IsOptional()
  @IsBoolean()
  useCredit?: boolean;
}

export class CancelMembershipDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ChangePlanDto {
  @ApiProperty()
  @IsUUID()
  planId: string;
}

export const MEMBERSHIP_STATUSES = ['PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELED'] as const;

export class ListTeamMembershipsQuery {
  @ApiPropertyOptional({ enum: MEMBERSHIP_STATUSES })
  @IsOptional()
  @IsIn(MEMBERSHIP_STATUSES as unknown as string[])
  status?: (typeof MEMBERSHIP_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional({ description: 'Treinador responsável (AthleteProfile.coachId)' })
  @IsOptional()
  @IsUUID()
  coachId?: string;

  @ApiPropertyOptional({ description: 'Busca por nome ou e-mail do atleta' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Somente ADMIN/SUPER_ADMIN da plataforma: equipe a consultar' })
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class TeamScopeQuery {
  @ApiPropertyOptional({ description: 'Somente ADMIN/SUPER_ADMIN da plataforma: equipe a consultar' })
  @IsOptional()
  @IsUUID()
  teamId?: string;
}

export class MarkPaidOfflineDto {
  @ApiProperty({ description: 'Valor recebido em centavos (deve ser igual ao preço travado da mensalidade)', example: 17400 })
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountInCents: number;

  @ApiPropertyOptional({ maxLength: 500, example: 'Pix direto na conta da assessoria' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: 'Data/hora do recebimento (ISO 8601); padrão agora' })
  @IsOptional()
  @IsISO8601()
  paidAt?: string;
}
