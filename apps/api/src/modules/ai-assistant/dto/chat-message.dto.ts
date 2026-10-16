import { IsString, IsOptional, IsArray, ValidateNested, IsEnum, MaxLength, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

export class MessageHistoryItem {
  @IsEnum(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(20000)
  content: string;
}

export class ChatMessageDto {
  @IsString()
  @MaxLength(10000)
  message: string;

  @IsOptional()
  @IsString()
  athleteId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MessageHistoryItem)
  history?: MessageHistoryItem[];
}
