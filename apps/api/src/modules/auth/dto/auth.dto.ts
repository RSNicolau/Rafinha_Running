import {
  IsEmail,
  IsString,
  MaxLength,
  IsOptional,
  IsIn,
  Equals,
  IsBoolean,
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsStrongPassword } from '../../../common/validators/password-policy';

/** Papéis permitidos no auto-cadastro. ADMIN/SUPER_ADMIN só podem ser atribuídos por um SUPER_ADMIN. */
export const SELF_REGISTER_ROLES: UserRole[] = [UserRole.ATHLETE, UserRole.COACH];
export type SelfRegisterRole = typeof UserRole.ATHLETE | typeof UserRole.COACH;

export class RegisterDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiProperty({ example: 'minhasenha123' })
  @IsStrongPassword()
  password: string;

  @ApiProperty({ example: 'João Silva' })
  @IsString({ message: 'Nome é obrigatório' })
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @MaxLength(120)
  name: string;

  @ApiProperty({ enum: [UserRole.ATHLETE, UserRole.COACH], example: UserRole.ATHLETE, required: false })
  @IsOptional()
  @IsIn(SELF_REGISTER_ROLES, { message: 'Papel inválido' })
  role?: SelfRegisterRole;

  @ApiProperty({ example: true, description: 'Aceite dos Termos de Uso e da Política de Privacidade' })
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

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;

  @ApiProperty({ required: false, example: 'Assessoria Corre Junto', description: 'Nome da equipe/assessoria (treinador). Padrão: nome do usuário.' })
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'Nome da equipe deve ter no máximo 80 caracteres' })
  teamName?: string;

  @ApiProperty({ required: false, description: 'Token de convite de equipe: cria a conta de treinador já como membro da equipe.' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  teamInviteToken?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiProperty({ example: 'minhasenha123' })
  @IsString({ message: 'Senha é obrigatória' })
  @MaxLength(128)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString({ message: 'Refresh token é obrigatório' })
  refreshToken: string;
}

export class LogoutDto {
  @ApiProperty({ required: false, description: 'Refresh token da sessão a encerrar (revogado no servidor)' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  refreshToken?: string;

  @ApiProperty({ required: false, example: false, description: 'true = encerra TODAS as sessões do usuário (todos os dispositivos)' })
  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;
}

export class GoogleAuthDto {
  @ApiProperty({ description: 'Google ID token from frontend' })
  @IsString({ message: 'Token Google é obrigatório' })
  idToken: string;
}

export class AppleAuthDto {
  @ApiProperty({ description: 'Apple identity token from expo-apple-authentication' })
  @IsString({ message: 'Identity token Apple é obrigatório' })
  identityToken: string;

  @ApiProperty({ description: 'User full name (only provided on first login)', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  fullName?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiProperty()
  @IsString({ message: 'Token é obrigatório' })
  @IsNotEmpty({ message: 'Token é obrigatório' })
  @MaxLength(256)
  token: string;

  @ApiProperty({ example: 'novasenha123' })
  @IsStrongPassword()
  newPassword: string;
}

export class MfaLoginDto {
  @ApiProperty({ description: 'Token temporário retornado pelo login quando mfaRequired = true' })
  @IsString({ message: 'mfaToken é obrigatório' })
  @IsNotEmpty({ message: 'mfaToken é obrigatório' })
  mfaToken: string;

  @ApiProperty({ example: '123456' })
  @IsString({ message: 'Código é obrigatório' })
  @Matches(/^\d{6}$/, { message: 'O código deve ter 6 dígitos' })
  code: string;
}
