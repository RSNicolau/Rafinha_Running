import { IsString, IsOptional, IsBoolean, IsEnum, MaxLength } from 'class-validator';

export enum AIAssistantToneDto {
  FRIENDLY = 'FRIENDLY',
  PROFESSIONAL = 'PROFESSIONAL',
  MOTIVATIONAL = 'MOTIVATIONAL',
}

export class UpdateConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  assistantName?: string;

  @IsOptional()
  @IsEnum(AIAssistantToneDto)
  tone?: AIAssistantToneDto;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  personaPrompt?: string;

  @IsOptional()
  @IsBoolean()
  voiceEnabled?: boolean;
}
