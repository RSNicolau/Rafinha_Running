import { IsBoolean, IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { SportNiche } from '@prisma/client';

export class UpdateNicheDto {
  @IsEnum(SportNiche, { message: 'Nicho inválido' })
  niche: SportNiche;

  @IsOptional() @IsBoolean()
  seedQuestions?: boolean;
}

export class PowerZonesDto {
  @IsNumber() @Min(1) @Max(2000)
  ftp: number;

  @IsOptional() @IsNumber() @Min(20) @Max(400)
  weightKg?: number;
}

export class SwimZonesDto {
  @IsNumber() @Min(1) @Max(3600)
  best100mSeconds: number;

  @IsNumber() @Min(1) @Max(14400)
  best400mSeconds: number;
}
