import { IsString } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString() token: string;
}
