import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AthleteLevel } from '@prisma/client';

class UpdateAthleteProfileDto {
  @IsNumber({}, { message: 'Peso deve ser um número' })
  @IsOptional()
  weight?: number;

  @IsNumber({}, { message: 'Altura deve ser um número' })
  @IsOptional()
  height?: number;

  @IsNumber() @IsOptional()
  vo2max?: number;

  @IsNumber() @IsOptional()
  restingHR?: number;

  @IsNumber() @IsOptional()
  maxHR?: number;

  @IsNumber() @IsOptional()
  weeklyGoalKm?: number;

  @IsEnum(AthleteLevel) @IsOptional()
  level?: AthleteLevel;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'João Silva' })
  @IsString() @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '+5511999999999' })
  @IsString() @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  avatarUrl?: string;

  @ApiPropertyOptional({ type: UpdateAthleteProfileDto })
  @IsOptional()
  athleteProfile?: UpdateAthleteProfileDto;
}
