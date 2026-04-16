import { IsString, IsOptional, IsUrl } from 'class-validator';

export class UpdateAppointmentSettingsDto {
  @IsString()
  @IsOptional()
  appointmentUrl?: string;
}
