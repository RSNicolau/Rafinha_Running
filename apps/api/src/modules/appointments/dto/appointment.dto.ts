import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateAppointmentSettingsDto {
  /** Somente http(s) — evita links javascript:/data: renderizados para atletas. Vazio/null remove. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(https?:\/\/\S+)?$/i, { message: 'URL de agendamento inválida (use http:// ou https://)' })
  appointmentUrl?: string | null;
}
