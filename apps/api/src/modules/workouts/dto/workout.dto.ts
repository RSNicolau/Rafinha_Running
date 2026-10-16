import { IsString, IsOptional, IsInt, IsDateString, IsEnum, IsUUID, IsNumber, IsArray, Min, Max, MaxLength, ArrayMaxSize, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
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

export class SubmitFeedbackDto {
  @ApiPropertyOptional({ example: 7, description: 'Esforço percebido 1-10 (RPE)' })
  @IsInt() @Min(1) @Max(10) @IsOptional()
  rpe?: number;

  @ApiPropertyOptional({ example: 4, description: 'Sensação geral 1-5 (1=péssimo, 5=ótimo)' })
  @IsInt() @Min(1) @Max(5) @IsOptional()
  sensationScore?: number;

  @ApiPropertyOptional({ example: 'Perna pesada, mas consegui completar' })
  @IsString() @MaxLength(500) @IsOptional()
  athleteFeedback?: string;
}

export class HealthSplitDto {
  @IsNumber() @Min(0) @Max(1000)
  km: number;

  @IsNumber() @Min(0) @Max(1000)
  paceMinPerKm: number;
}

/** Treino vindo do Apple Health / HealthKit (sync/health). */
export class HealthWorkoutDto {
  @IsString() @MaxLength(200)
  id: string;

  @IsString() @MaxLength(100)
  type: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber() @Min(0) @Max(100000)
  durationMinutes: number;

  @IsNumber() @Min(0) @Max(10000)
  distanceKm: number;

  @IsNumber() @Min(0) @Max(100000)
  calories: number;

  @IsOptional() @IsNumber() @Min(0) @Max(300)
  averageHeartRate?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(300)
  maxHeartRate?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1000)
  averagePaceMinPerKm?: number;

  @IsOptional() @IsNumber() @Min(-10000) @Max(100000)
  elevationGain?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => HealthSplitDto)
  splits?: HealthSplitDto[];

  @IsIn(['APPLE_HEALTH'])
  source: 'APPLE_HEALTH';
}

export class ChangeWorkoutTypeDto {
  @IsEnum(WorkoutType, { message: 'Tipo de treino inválido' })
  type: WorkoutType;
}
