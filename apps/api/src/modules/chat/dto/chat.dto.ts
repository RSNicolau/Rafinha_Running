import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateConversationDto {
  /** Obrigatório para COACH/ADMIN: atleta da conversa. Para ATHLETE é ignorado (sempre o próprio). */
  @IsOptional() @IsUUID('all', { message: 'athleteId inválido' })
  athleteId?: string;

  /** Opcional para ATHLETE (padrão: o próprio treinador). Para COACH é ignorado (sempre o próprio). */
  @IsOptional() @IsUUID('all', { message: 'coachId inválido' })
  coachId?: string;

  /** Primeira mensagem opcional. */
  @IsOptional() @IsString() @MaxLength(5000)
  message?: string;
}

export class SendMessageDto {
  @IsString() @IsNotEmpty({ message: 'Mensagem vazia' }) @MaxLength(5000, { message: 'Mensagem muito longa' })
  content: string;
}

export class BroadcastDto {
  @IsString() @IsNotEmpty({ message: 'Mensagem vazia' }) @MaxLength(5000)
  message: string;

  @IsOptional() @IsIn(['ALL', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ELITE'])
  targetGroup?: 'ALL' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ELITE';
}

export class MessagesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}
