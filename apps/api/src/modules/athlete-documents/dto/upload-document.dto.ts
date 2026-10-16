import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const DOCUMENT_CATEGORIES = ['exam', 'assessment', 'photo', 'general'] as const;

export class UploadDocumentDto {
  /** Somente quando um COACH/ADMIN envia em nome do atleta. Atleta: sempre ele mesmo. */
  @IsOptional() @IsUUID('all', { message: 'athleteId inválido' })
  athleteId?: string;

  @IsOptional() @IsIn(DOCUMENT_CATEGORIES as unknown as string[], { message: 'Categoria inválida' })
  category?: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;
}
