import { IsString, IsOptional, IsInt, IsDateString, IsEnum, IsUUID, IsNumber, IsArray, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkoutType, HeartRateZone, WorkoutSource } from '@prisma/client';

export class CreateWorkoutDto {
  @ApiProperty() @IsUUID()
  planId: string;

  @ApiProperty({ example: '2026-03-05' })
  @IsDateString({}, { message: 'Data inválida' })
  scheduledDate: string;

  @ApiProperty({ enum: WorkoutType })
  @IsEnum(WorkoutType, { message: 'Tipo de treino inválido' })
  type: WorkoutType;

  @ApiProperty({ example: 'Corrida leve 5km' }) @IsString()
  title: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 5000 }) @IsInt() @Min(0) @IsOptional()
  targetDistanceMeters?: number;

  @ApiPropertyOptional({ example: 1800 }) @IsInt() @Min(0) @IsOptional()
  targetDurationSeconds?: number;

  @ApiPropertyOptional({ example: '6:00' }) @IsString() @IsOptional()
  targetPace?: string;

  @ApiPropertyOptional({ enum: HeartRateZone }) @IsEnum(HeartRateZone) @IsOptional()
  heartRateZone?: HeartRateZone;
}

export class SubmitResultDto {
  @ApiPropertyOptional({ enum: WorkoutSource }) @IsEnum(WorkoutSource) @IsOptional()
  source?: WorkoutSource;

  @ApiProperty({ example: 5120 }) @IsInt({ message: 'Distância é obrigatória' }) @Min(0)
  distanceMeters: number;

  @ApiProperty({ example: 1750 }) @IsInt({ message: 'Duração é obrigatória' }) @Min(0)
  durationSeconds: number;

  @ApiPropertyOptional({ example: '5:42' }) @IsString() @IsOptional()
  avgPace?: string;

  @ApiPropertyOptional({ example: 145 }) @IsInt() @IsOptional()
  avgHeartRate?: number;

  @ApiPropertyOptional({ example: 172 }) @IsInt() @IsOptional()
  maxHeartRate?: number;

  @ApiPropertyOptional({ example: 320 }) @IsInt() @IsOptional()
  calories?: number;

  @ApiPropertyOptional({ example: 45.5 }) @IsNumber() @IsOptional()
  elevationGain?: number;

  @ApiPropertyOptional() @IsArray() @IsOptional()
  splits?: { kilometer: number; durationSeconds: number; pace: string; heartRate?: number }[];
}
