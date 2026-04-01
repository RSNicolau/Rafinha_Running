import { IsString, IsOptional, IsInt, IsDateString, IsEnum, IsUUID, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanStatus } from '@prisma/client';

export class CreatePlanDto {
  @ApiProperty()
  @IsUUID('4', { message: 'ID do atleta inválido' })
  athleteId: string;

  @ApiProperty({ example: 'Preparação Meia Maratona' })
  @IsString({ message: 'Nome é obrigatório' })
  name: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  description?: string;

  @ApiProperty({ example: '2026-03-01' })
  @IsDateString({}, { message: 'Data de início inválida' })
  startDate: string;

  @ApiProperty({ example: '2026-06-01' })
  @IsDateString({}, { message: 'Data de fim inválida' })
  endDate: string;

  @ApiProperty({ example: 4 })
  @IsInt() @Min(1, { message: 'Mínimo 1 treino por semana' }) @Max(7, { message: 'Máximo 7 treinos por semana' })
  weeklyFrequency: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional() @IsString() @IsOptional()
  name?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: PlanStatus }) @IsEnum(PlanStatus) @IsOptional()
  status?: PlanStatus;

  @ApiPropertyOptional() @IsDateString() @IsOptional()
  startDate?: string;

  @ApiPropertyOptional() @IsDateString() @IsOptional()
  endDate?: string;

  @ApiPropertyOptional() @IsInt() @Min(1) @Max(7) @IsOptional()
  weeklyFrequency?: number;
}
