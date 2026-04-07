import { IsString, IsInt, Min, Max, IsOptional, IsDateString } from 'class-validator';

export class GeneratePlanAiDto {
  @IsString()
  athleteId: string;

  @IsInt()
  @Min(4)
  @Max(52)
  durationWeeks: number;

  @IsString()
  goal: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;
}
