import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class UpsertTestimonialDto {
  /** Opcional — o depoimento sempre vai para o treinador vinculado ao atleta. Se enviado, precisa coincidir. */
  @IsOptional() @IsUUID('all', { message: 'coachId inválido' })
  coachId?: string;

  @IsInt({ message: 'Nota deve ser um número inteiro' }) @Min(1) @Max(5)
  rating: number;

  @IsString() @IsNotEmpty({ message: 'Texto obrigatório' }) @MaxLength(2000)
  text: string;
}
