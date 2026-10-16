import { IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/** Campos editáveis de uma avaliação (sem athleteId/coachId/aiAnalysis). */
export class UpdateAssessmentDto {
  @IsOptional() @IsDateString({}, { message: 'Data da avaliação inválida' })
  assessedAt?: string;

  @IsOptional() @IsNumber() @Min(20) @Max(400)
  weightKg?: number;

  @IsOptional() @IsNumber() @Min(50) @Max(260)
  heightCm?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  bodyFatPct?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  muscleMassPct?: number;

  @IsOptional() @IsInt() @Min(20) @Max(250)
  restingHR?: number;

  @IsOptional() @IsInt() @Min(60) @Max(260)
  maxHR?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(120)
  vo2max?: number;

  /** segundos */
  @IsOptional() @IsInt() @Min(1) @Max(36000)
  best5kTime?: number;

  /** segundos */
  @IsOptional() @IsInt() @Min(1) @Max(72000)
  best10kTime?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  flexScore?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  strengthScore?: number;

  @IsOptional() @IsString() @MaxLength(5000)
  coachNotes?: string;
}

export class CreateAssessmentDto extends UpdateAssessmentDto {
  @IsUUID('all', { message: 'athleteId inválido' })
  athleteId: string;
}
