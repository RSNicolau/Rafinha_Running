import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CoachBrainChatDto {
  @IsString() @IsNotEmpty({ message: 'Mensagem vazia' }) @MaxLength(20000)
  message: string;

  @IsOptional() @IsUUID('all', { message: 'sessionId inválido' })
  sessionId?: string;
}

export class UpdateCoachBrainSettingsDto {
  @IsIn(['anthropic', 'openai', 'gemini', 'grok'], { message: 'Provedor de IA inválido' })
  provider: 'anthropic' | 'openai' | 'gemini' | 'grok';

  @IsOptional() @IsString() @MaxLength(100)
  model?: string;

  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  byok: boolean;

  @IsOptional() @IsString() @MaxLength(500)
  apiKey?: string;
}

export class ApplyPlanDto {
  @IsUUID('all', { message: 'athleteId inválido' })
  athleteId: string;

  @IsString() @IsNotEmpty() @MaxLength(30000)
  planText: string;
}
