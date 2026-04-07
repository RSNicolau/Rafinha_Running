import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';

export enum AIAssistantToneDto {
  FRIENDLY = 'FRIENDLY',
  PROFESSIONAL = 'PROFESSIONAL',
  MOTIVATIONAL = 'MOTIVATIONAL',
}

export class UpdateConfigDto {
  @IsOptional()
  @IsString()
  assistantName?: string;

  @IsOptional()
  @IsEnum(AIAssistantToneDto)
  tone?: AIAssistantToneDto;

  @IsOptional()
  @IsString()
  personaPrompt?: string;

  @IsOptional()
  @IsBoolean()
  voiceEnabled?: boolean;
}
