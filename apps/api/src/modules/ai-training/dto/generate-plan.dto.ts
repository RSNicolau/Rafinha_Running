import { IsString, IsOptional, IsInt, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TrainingGoal {
  BASE_BUILDING = 'BASE_BUILDING',
  RACE_PREP_5K = 'RACE_PREP_5K',
  RACE_PREP_10K = 'RACE_PREP_10K',
  RACE_PREP_HALF = 'RACE_PREP_HALF',
  RACE_PREP_MARATHON = 'RACE_PREP_MARATHON',
  WEIGHT_LOSS = 'WEIGHT_LOSS',
  IMPROVE_PACE = 'IMPROVE_PACE',
  RECOVERY = 'RECOVERY',
}

export class GeneratePlanDto {
  @ApiProperty({ description: 'ID do atleta' })
  @IsString()
  athleteId: string;

  @ApiProperty({ description: 'Número de semanas do plano', minimum: 4, maximum: 52 })
  @IsInt()
  @Min(4)
  @Max(52)
  weeks: number;

  @ApiProperty({ enum: TrainingGoal, description: 'Objetivo do treino' })
  @IsEnum(TrainingGoal)
  goal: TrainingGoal;

  @ApiPropertyOptional({ description: 'Data de início (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ID do plano de treino para preencher com treinos (opcional)' })
  @IsString()
  @IsOptional()
  planId?: string;
}
