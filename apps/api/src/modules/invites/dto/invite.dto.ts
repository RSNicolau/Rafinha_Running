import { Equals, IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsStrongPassword } from '../../../common/validators/password-policy';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInviteDto {
  @ApiProperty({ example: 'atleta@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(254)
  email: string;
}

/** Aceite público — somente para criar uma conta NOVA a partir do convite. */
export class AcceptInviteDto {
  @ApiProperty({ example: 'abc123-token' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token: string;

  @ApiProperty({ example: 'João Silva' })
  @IsString({ message: 'Nome é obrigatório' })
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'Senha@123' })
  @IsStrongPassword()
  password: string;

  @ApiProperty({ example: true })
  @Equals(true, { message: 'É necessário aceitar os Termos de Uso e a Política de Privacidade' })
  acceptTerms: boolean;

  @ApiProperty({ example: '2026-10-14' })
  @IsString({ message: 'Versão dos Termos de Uso é obrigatória' })
  @IsNotEmpty({ message: 'Versão dos Termos de Uso é obrigatória' })
  @MaxLength(32)
  termsVersion: string;

  @ApiProperty({ example: '2026-10-14' })
  @IsString({ message: 'Versão da Política de Privacidade é obrigatória' })
  @IsNotEmpty({ message: 'Versão da Política de Privacidade é obrigatória' })
  @MaxLength(32)
  privacyVersion: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;

  @ApiProperty({ required: false, description: 'Consentimento para dados de saúde (LGPD art. 11, I) — o cadastro de atleta pede junto com os Termos' })
  @IsOptional()
  @IsBoolean()
  healthDataConsent?: boolean;
}

/** Aceite autenticado — usuário já tem conta e está logado com o e-mail do convite. */
export class AcceptExistingInviteDto {
  @ApiProperty({ example: 'abc123-token' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token: string;
}
