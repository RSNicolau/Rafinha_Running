import { IsEmail, IsEnum, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsStrongPassword } from '../../../common/validators/password-policy';
import { SLUG_MAX_LENGTH } from '../../../common/validators/slug';

export class UpdateUserRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole, { message: 'Papel inválido' })
  role: UserRole;
}

export class SetUserPasswordDto {
  @ApiProperty({ example: 'novasenha123' })
  @IsStrongPassword()
  password: string;
}

export class SetUserPasswordByEmailDto extends SetUserPasswordDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;
}

export class SetCoachSlugDto {
  @ApiProperty({ example: 'rafinha', description: 'Minúsculas, números e hífen (3–40). Validado e normalizado no serviço.' })
  @IsString({ message: 'Slug é obrigatório' })
  @MaxLength(SLUG_MAX_LENGTH + 20, { message: `O slug deve ter entre 3 e ${SLUG_MAX_LENGTH} caracteres` })
  slug: string;
}

export class SetCoachPlatformFeeDto {
  @ApiProperty({ example: 5, description: 'Taxa da plataforma (%) — 0 a 50, até 2 casas decimais' })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }, { message: 'A taxa da plataforma deve ser um número' })
  @Min(0, { message: 'A taxa da plataforma deve ser no mínimo 0' })
  @Max(50, { message: 'A taxa da plataforma deve ser no máximo 50' })
  platformFeePercent: number;
}
