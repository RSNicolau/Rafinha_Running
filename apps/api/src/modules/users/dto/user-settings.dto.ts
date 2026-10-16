import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsStrongPassword } from '../../../common/validators/password-policy';

export class ChangePasswordDto {
  @IsString() @IsNotEmpty() @MaxLength(128)
  currentPassword: string;

  @IsStrongPassword()
  newPassword: string;
}

export class UpdateAiSettingsDto {
  @ApiPropertyOptional({ enum: ['anthropic', 'openai', 'gemini', 'grok'] })
  @IsOptional() @IsIn(['anthropic', 'openai', 'gemini', 'grok'], { message: 'Provedor de IA inválido' })
  aiProvider?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(100)
  aiModel?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  aiByok?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  aiApiKey?: string;
}

export class AddAthleteDto {
  @IsEmail({}, { message: 'E-mail inválido' }) @MaxLength(254)
  email: string;
}

export class TotpTokenDto {
  @IsString() @IsNotEmpty() @MaxLength(12)
  token: string;
}
