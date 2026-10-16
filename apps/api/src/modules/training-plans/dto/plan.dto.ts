import {
  IsString, IsOptional, IsInt, IsDateString, IsEnum, IsUUID, Min, Max, MaxLength, Matches,
  registerDecorator, ValidationArguments, ValidationOptions, IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanStatus, WorkoutType, HeartRateZone } from '@prisma/client';

/** Compara só o dia de calendário (YYYY-MM-DD) de duas datas ISO. */
function dayOf(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v.trim());
  return m ? m[1] : null;
}

/** O valor (data) precisa ser igual ou posterior ao campo `property` do mesmo objeto (quando ambos presentes). */
export function IsOnOrAfter(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isOnOrAfter',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const other = (args.object as Record<string, unknown>)[args.constraints[0]];
          const a = dayOf(value);
          const b = dayOf(other);
          if (!a || !b) return true; // ausência é tratada por outros validadores
          return a >= b;
        },
      },
    });
  };
}

export class CreatePlanDto {
  @ApiProperty()
  @IsUUID('4', { message: 'ID do atleta inválido' })
  athleteId: string;

  @ApiProperty({ example: 'Preparação Meia Maratona' })
  @IsString({ message: 'Nome é obrigatório' })
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional() @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: '2026-03-01' })
  @IsDateString({}, { message: 'Data de início inválida' })
  startDate: string;

  @ApiProperty({ example: '2026-06-01' })
  @IsDateString({}, { message: 'Data de fim inválida' })
  @IsOnOrAfter('startDate', { message: 'A data de fim deve ser igual ou posterior à data de início' })
  endDate: string;

  @ApiProperty({ example: 4 })
  @IsInt() @Min(1, { message: 'Mínimo 1 treino por semana' }) @Max(7, { message: 'Máximo 7 treinos por semana' })
  weeklyFrequency: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional() @IsString() @IsOptional() @IsNotEmpty({ message: 'Nome é obrigatório' }) @MaxLength(150)
  name?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: PlanStatus }) @IsEnum(PlanStatus, { message: 'Status inválido' }) @IsOptional()
  status?: PlanStatus;

  @ApiPropertyOptional() @IsDateString({}, { message: 'Data de início inválida' }) @IsOptional()
  startDate?: string;

  @ApiPropertyOptional() @IsDateString({}, { message: 'Data de fim inválida' }) @IsOptional()
  @IsOnOrAfter('startDate', { message: 'A data de fim deve ser igual ou posterior à data de início' })
  endDate?: string;

  @ApiPropertyOptional() @IsInt() @Min(1) @Max(7) @IsOptional()
  weeklyFrequency?: number;
}

export class DuplicatePlanDto {
  @ApiPropertyOptional({ description: 'Atleta destino (default: o mesmo atleta)' })
  @IsUUID('all', { message: 'ID do atleta inválido' }) @IsOptional()
  athleteId?: string;

  @ApiPropertyOptional({ example: '2026-11-03', description: 'Nova data de início (os treinos são deslocados)' })
  @IsDateString({}, { message: 'Data de início inválida' }) @IsOptional()
  startDate?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @IsNotEmpty() @MaxLength(150)
  name?: string;
}

const PACE_RE = /^\d{1,2}:[0-5]\d(\s*\/\s*km)?$/;

export class PlanWorkoutDto {
  @ApiProperty({ example: '2026-03-05' })
  @IsDateString({}, { message: 'Data do treino inválida' })
  scheduledDate: string;

  @ApiProperty({ enum: WorkoutType })
  @IsEnum(WorkoutType, { message: 'Tipo de treino inválido' })
  type: WorkoutType;

  @ApiPropertyOptional({ example: 'Corrida leve 5km' }) @IsString() @IsOptional() @MaxLength(150)
  title?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 5000 }) @IsInt({ message: 'Distância inválida' }) @Min(0) @Max(500000) @IsOptional()
  targetDistanceMeters?: number;

  @ApiPropertyOptional({ example: 1800 }) @IsInt({ message: 'Duração inválida' }) @Min(0) @Max(172800) @IsOptional()
  targetDurationSeconds?: number;

  @ApiPropertyOptional({ example: '6:00' }) @IsString() @IsOptional()
  @Matches(PACE_RE, { message: 'Pace alvo deve estar no formato m:ss (ex.: 5:30)' })
  targetPace?: string;

  @ApiPropertyOptional({ enum: HeartRateZone }) @IsEnum(HeartRateZone, { message: 'Zona de FC inválida' }) @IsOptional()
  heartRateZone?: HeartRateZone;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(2000)
  coachNotes?: string;
}

export class UpdatePlanWorkoutDto {
  @ApiPropertyOptional() @IsDateString({}, { message: 'Data do treino inválida' }) @IsOptional()
  scheduledDate?: string;

  @ApiPropertyOptional({ enum: WorkoutType }) @IsEnum(WorkoutType, { message: 'Tipo de treino inválido' }) @IsOptional()
  type?: WorkoutType;

  @ApiPropertyOptional() @IsString() @IsOptional() @IsNotEmpty() @MaxLength(150)
  title?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional() @IsInt({ message: 'Distância inválida' }) @Min(0) @Max(500000) @IsOptional()
  targetDistanceMeters?: number | null;

  @ApiPropertyOptional() @IsInt({ message: 'Duração inválida' }) @Min(0) @Max(172800) @IsOptional()
  targetDurationSeconds?: number | null;

  @ApiPropertyOptional() @IsString() @IsOptional()
  @Matches(PACE_RE, { message: 'Pace alvo deve estar no formato m:ss (ex.: 5:30)' })
  targetPace?: string | null;

  @ApiPropertyOptional({ enum: HeartRateZone }) @IsEnum(HeartRateZone, { message: 'Zona de FC inválida' }) @IsOptional()
  heartRateZone?: HeartRateZone | null;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(2000)
  coachNotes?: string | null;
}
