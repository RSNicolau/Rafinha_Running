import { IsString, IsOptional, IsInt, IsEnum, Min, Max, IsUUID, IsDateString } from 'class-validator';
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
  @IsUUID('all', { message: 'athleteId inválido' })
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
  @IsDateString({}, { message: 'Data de início inválida' })
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ID do plano de treino para preencher com treinos (opcional)' })
  @IsUUID('all', { message: 'planId inválido' })
  @IsOptional()
  planId?: string;
}
