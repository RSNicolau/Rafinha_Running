import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  MinLength,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const INVITABLE_TEAM_ROLES = ['ADMIN', 'COACH', 'STAFF'] as const;
export const ASSIGNABLE_TEAM_ROLES = ['ADMIN', 'COACH', 'STAFF'] as const;
export const BILLING_INTERVALS = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const;
export const MEMBERSHIP_STATUSES = ['PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELED', 'NONE'] as const;

export class UpdateTeamDto {
  @ApiPropertyOptional({ example: 'Rafinha Running' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @IsString()
  @IsNotEmpty({ message: 'Nome da equipe é obrigatório' })
  @MinLength(2, { message: 'O nome da equipe precisa ter entre 2 e 80 caracteres' })
  @MaxLength(80, { message: 'O nome da equipe precisa ter entre 2 e 80 caracteres' })
  name?: string;

  @ApiPropertyOptional({ example: 'https://…/logo.png', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(500)
  @Matches(/^(https?:\/\/|\/)/, { message: 'URL do logo inválida' })
  logoUrl?: string | null;

  @ApiPropertyOptional({ example: '#DC2626', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Cor inválida (use #RRGGBB)' })
  primaryColor?: string | null;

  @ApiPropertyOptional({ example: 'Niterói - RJ', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @ApiPropertyOptional({ example: 5, description: 'Dias de tolerância após o vencimento (0–30)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Dias de tolerância deve ser inteiro' })
  @Min(0)
  @Max(30, { message: 'Dias de tolerância: máximo 30' })
  graceDays?: number;

  @ApiPropertyOptional({ description: 'ID da carteira Asaas (somente OWNER). null remove.', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsUUID('all', { message: 'ID da carteira Asaas inválido (formato UUID)' })
  asaasWalletId?: string | null;
}

export class InviteMemberDto {
  @ApiProperty({ example: 'treinador@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(254)
  email: string;

  @ApiProperty({ enum: INVITABLE_TEAM_ROLES, example: 'COACH' })
  @IsIn(INVITABLE_TEAM_ROLES as unknown as string[], { message: 'Papel inválido (ADMIN, COACH ou STAFF)' })
  role: (typeof INVITABLE_TEAM_ROLES)[number];
}

export class AcceptTeamInviteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Token é obrigatório' })
  @MaxLength(2048)
  token: string;
}

export class UpdateMemberDto {
  @ApiPropertyOptional({ enum: ASSIGNABLE_TEAM_ROLES })
  @IsOptional()
  @IsIn(ASSIGNABLE_TEAM_ROLES as unknown as string[], { message: 'Papel inválido (use transferência para trocar o dono)' })
  role?: (typeof ASSIGNABLE_TEAM_ROLES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TransferOwnershipDto {
  @ApiProperty()
  @IsUUID('all', { message: 'Usuário inválido' })
  userId: string;
}

export class AssignCoachDto {
  @ApiProperty()
  @IsUUID('all', { message: 'Treinador inválido' })
  coachId: string;
}

export class ListTeamAthletesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('all')
  coachId?: string;

  @ApiPropertyOptional({ enum: MEMBERSHIP_STATUSES, description: 'NONE = sem mensalidade' })
  @IsOptional()
  @IsIn(MEMBERSHIP_STATUSES as unknown as string[])
  membershipStatus?: (typeof MEMBERSHIP_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateTeamPlanDto {
  @ApiProperty({ example: 'Mensal' })
  @IsString()
  @IsNotEmpty({ message: 'Nome do plano é obrigatório' })
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: BILLING_INTERVALS, example: 'MONTHLY' })
  @IsIn(BILLING_INTERVALS as unknown as string[], { message: 'Periodicidade inválida' })
  interval: (typeof BILLING_INTERVALS)[number];

  @ApiProperty({ example: 17400, description: 'Preço em centavos' })
  @Type(() => Number)
  @IsInt({ message: 'Preço deve ser em centavos (inteiro)' })
  @Min(500, { message: 'Preço mínimo: R$ 5,00' })
  @Max(10_000_000)
  priceInCents: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  benefits?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

export class UpdateTeamPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: BILLING_INTERVALS })
  @IsOptional()
  @IsIn(BILLING_INTERVALS as unknown as string[], { message: 'Periodicidade inválida' })
  interval?: (typeof BILLING_INTERVALS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500, { message: 'Preço mínimo: R$ 5,00' })
  @Max(10_000_000)
  priceInCents?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  benefits?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

export class UpdateTeamFeeDto {
  @ApiProperty({ example: 5, description: 'Taxa da plataforma (%) sobre mensalidades/vendas da equipe' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  platformFeePercent: number;
}
