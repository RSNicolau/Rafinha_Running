import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Conclusão autenticada do OAuth (app mobile): o state precisa pertencer ao usuário do JWT. */
export class CompleteOAuthDto {
  @IsString()
  @MaxLength(512)
  code!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'state inválido' })
  state!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  scope?: string;
}
