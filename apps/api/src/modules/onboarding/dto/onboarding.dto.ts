import {
  IsEmail, IsString, IsNotEmpty, IsOptional, IsObject, MaxLength, Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class SubmitOnboardingDto {
  @ApiProperty({ example: 'João Silva', description: 'Nome completo do atleta' })
  @IsString({ message: 'Nome é obrigatório' })
  @IsNotEmpty({ message: 'Nome não pode ser vazio' })
  @MaxLength(120, { message: 'Nome muito longo' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  athleteName: string;

  @ApiProperty({ example: 'joao@email.com', description: 'Email do atleta' })
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(254, { message: 'E-mail muito longo' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  athleteEmail: string;

  @ApiPropertyOptional({ example: '11999999999', description: 'Telefone do atleta (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Telefone muito longo' })
  @Matches(/^[\d\s\+\-\(\)]{7,20}$/, { message: 'Telefone inválido' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  athletePhone?: string;

  @ApiProperty({ description: 'Respostas do questionário (chave = ID da pergunta)' })
  @IsObject({ message: 'Respostas devem ser um objeto' })
  answers: Record<string, any>;

  @ApiPropertyOptional({ description: 'Código de indicação (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  referralCode?: string;
}

export class CreateCheckoutDto {
  @ApiProperty({ description: 'ID do atleta gerado no submit' })
  @IsString({ message: 'athleteId é obrigatório' })
  @IsNotEmpty({ message: 'athleteId não pode ser vazio' })
  athleteId: string;

  @ApiPropertyOptional({
    enum: ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL'],
    description: 'Tipo de plano de assinatura',
    example: 'MONTHLY',
  })
  @IsOptional()
  @IsString()
  planType?: string;
}
