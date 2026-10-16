import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const PAYMENT_SETTINGS_PROVIDERS = ['pagarme', 'stripe'] as const;

/** PUT /settings — gateway próprio do treinador. Chaves são gravadas criptografadas e nunca devolvidas. */
export class UpdatePaymentSettingsDto {
  @ApiProperty({ enum: PAYMENT_SETTINGS_PROVIDERS })
  @IsIn(PAYMENT_SETTINGS_PROVIDERS as unknown as string[], { message: 'Gateway inválido (use pagarme ou stripe)' })
  provider: (typeof PAYMENT_SETTINGS_PROVIDERS)[number];

  @ApiProperty()
  @IsBoolean({ message: 'Pagamentos ativos deve ser verdadeiro ou falso' })
  paymentEnabled: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300)
  pagarmeApiKey?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300)
  pagarmeWebhookSecret?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300)
  stripeSecretKey?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300)
  stripeWebhookSecret?: string;
}
