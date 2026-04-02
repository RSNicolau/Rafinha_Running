import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInviteDto {
  @ApiProperty({ example: 'atleta@email.com' })
  @IsEmail()
  email: string;
}

export class AcceptInviteDto {
  @ApiProperty({ example: 'abc123-token' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'João Silva' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Senha@123' })
  @IsString()
  password: string;
}
