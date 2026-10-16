import { IsString, IsOptional, IsNumber, IsEnum, IsInt, Min, Max, MaxLength, ValidateNested, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AthleteLevel } from '@prisma/client';

/**
 * Campos do perfil de atleta que o PRÓPRIO atleta pode editar.
 * Não inclui coachId (vínculo só via convite aceito) nem niche (definido pelo treinador/tenant).
 */
export class UpdateAthleteProfileDto {
  @IsNumber({}, { message: 'Peso deve ser um número' })
  @Min(20) @Max(400)
  @IsOptional()
  weight?: number;

  @IsNumber({}, { message: 'Altura deve ser um número' })
  @Min(50) @Max(260)
  @IsOptional()
  height?: number;

  @IsNumber() @Min(0) @Max(120) @IsOptional()
  vo2max?: number;

  @IsInt() @Min(20) @Max(250) @IsOptional()
  restingHR?: number;

  @IsInt() @Min(60) @Max(260) @IsOptional()
  maxHR?: number;

  @IsNumber() @Min(0) @Max(1000) @IsOptional()
  weeklyGoalKm?: number;

  @IsEnum(AthleteLevel) @IsOptional()
  level?: AthleteLevel;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'João Silva' })
  @IsString() @IsOptional() @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: '+5511999999999' })
  @IsString() @IsOptional() @MaxLength(32)
  phone?: string;

  /** Apenas URL http(s) ou null/'' para remover. Upload de foto: POST /users/me/avatar. */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString() @MaxLength(2048)
  @Matches(/^(https?:\/\/\S+)?$/i, { message: 'URL da foto inválida' })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ example: 'America/Sao_Paulo' })
  @IsString() @IsOptional() @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ type: UpdateAthleteProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateAthleteProfileDto)
  athleteProfile?: UpdateAthleteProfileDto;
}
