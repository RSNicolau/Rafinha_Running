import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max,
  MaxLength, Min, MinLength, ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { EventRegistrationStatus, KitType, PaymentStatus } from '@prisma/client';

const trim = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterEventDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() distanceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) shirtSize?: string;
  @ApiPropertyOptional({ enum: KitType }) @IsOptional() @IsEnum(KitType) kitType?: KitType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) emergencyContact?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) medicalInfo?: string;
  @ApiPropertyOptional({ description: 'Código do cupom (preferencial)' }) @IsOptional() @IsString() @MaxLength(40) couponCode?: string;
  @ApiPropertyOptional({ description: 'ID do cupom (compatibilidade)' }) @IsOptional() @IsUUID() couponId?: string;
  // Campos enviados por telas antigas — ignorados (dados vêm do usuário logado)
  @IsOptional() @IsString() @MaxLength(120) customerName?: string;
  @IsOptional() @IsString() @MaxLength(160) customerEmail?: string;
  @IsOptional() @IsString() @MaxLength(20) customerPhone?: string;
}

export class QuoteEventDto {
  @IsUUID() eventId: string;
  @IsOptional() @IsUUID() distanceId?: string;
  @IsOptional() @IsEnum(KitType) kitType?: KitType;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
}

export class RegistrationsQueryDto {
  @IsOptional() @IsEnum(EventRegistrationStatus) status?: EventRegistrationStatus;
  @IsOptional() @IsEnum(PaymentStatus) paymentStatus?: PaymentStatus;
  @IsOptional() @IsUUID() distanceId?: string;
  @IsOptional() @IsIn(['true', 'false']) kitDelivered?: 'true' | 'false';
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

export class RegistrationPaymentActionDto {
  @ApiProperty({ enum: ['MARK_PAID', 'CANCEL', 'REFUND'] })
  @IsIn(['MARK_PAID', 'CANCEL', 'REFUND'])
  action: 'MARK_PAID' | 'CANCEL' | 'REFUND';
}

export class UpdateRegistrationStatusDto {
  @ApiProperty({ enum: [EventRegistrationStatus.CHECKED_IN, EventRegistrationStatus.ABSENT, EventRegistrationStatus.CONFIRMED] })
  @IsIn([EventRegistrationStatus.CHECKED_IN, EventRegistrationStatus.ABSENT, EventRegistrationStatus.CONFIRMED])
  status: EventRegistrationStatus;
}

export class CheckinScanDto {
  @ApiProperty({ description: 'Conteúdo do QR (RRKIT:<id>), id da inscrição ou número de peito' })
  @IsString() @IsNotEmpty() @MaxLength(120) code: string;
  @ApiPropertyOptional({ description: 'Confirma check-in fora da janela (mais de 1 dia antes da prova)' })
  @IsOptional() @IsBoolean() force?: boolean;
}

export class CreateEventCouponDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(40) code: string;
  @IsIn(['PERCENT', 'FIXED', 'COURTESY']) type: 'PERCENT' | 'FIXED' | 'COURTESY';
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) value?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxUses?: number;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class UpdateEventCouponDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt() @Min(1) maxUses?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() expiresAt?: string | null;
}

export class DistanceDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(500) distanceKm?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) price?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt() @Min(1) maxParticipants?: number | null;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(60) ageGroup?: string;
}

export class CreateDistanceDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(500) distanceKm?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) price?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt() @Min(1) maxParticipants?: number | null;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @IsOptional() @IsString() @MaxLength(60) ageGroup?: string;
}

export class NotifyRegistrantsDto {
  @IsString() @MinLength(3) @MaxLength(500) message: string;
}

export class KitSessionDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) label: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(72) hours?: number;
}

export class KitDeliverDto {
  @IsString() @IsNotEmpty() @MaxLength(120) registrationId: string;
  @IsString() @IsNotEmpty() @MaxLength(128) token: string;
  @IsOptional() @IsString() @MaxLength(80) volunteerLabel?: string;
}

export class ValidateEventCouponDto {
  @IsUUID() eventId: string;
  @IsString() @IsNotEmpty() @MaxLength(40) code: string;
  @IsOptional() @IsUUID() distanceId?: string;
  @IsOptional() @IsEnum(KitType) kitType?: KitType;
}

