import { IsEmail, IsString, MinLength, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiProperty({ example: 'minhasenha123' })
  @IsString()
  @MinLength(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
  password: string;

  @ApiProperty({ example: 'João Silva' })
  @IsString({ message: 'Nome é obrigatório' })
  name: string;

  @ApiProperty({ enum: UserRole, example: UserRole.ATHLETE })
  @IsEnum(UserRole, { message: 'Papel inválido' })
  @IsOptional()
  role?: UserRole;
}

export class LoginDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiProperty({ example: 'minhasenha123' })
  @IsString({ message: 'Senha é obrigatória' })
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString({ message: 'Refresh token é obrigatório' })
  refreshToken: string;
}

export class GoogleAuthDto {
  @ApiProperty({ description: 'Google ID token from frontend' })
  @IsString({ message: 'Token Google é obrigatório' })
  idToken: string;
}
