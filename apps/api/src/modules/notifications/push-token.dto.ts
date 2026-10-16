import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString() @IsNotEmpty() @MaxLength(300)
  token: string;
}
