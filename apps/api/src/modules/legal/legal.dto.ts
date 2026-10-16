import { IsBoolean, IsOptional, IsString, Equals, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptLegalDto {
  @ApiProperty({ description: 'Precisa ser true — aceite dos Termos de Uso e da Política de Privacidade' })
  @Equals(true, { message: 'É necessário aceitar os Termos de Uso e a Política de Privacidade' })
  acceptTerms: boolean;

  @ApiProperty() @IsString() @MaxLength(32) termsVersion: string;
  @ApiProperty() @IsString() @MaxLength(32) privacyVersion: string;

  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() marketingOptIn?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() healthDataConsent?: boolean;
}

export class MarketingConsentDto {
  @ApiProperty() @IsBoolean() granted: boolean;
}

export class HealthDataConsentDto {
  @ApiProperty({ description: 'true = autoriza; false = revoga o consentimento para dados de saúde' })
  @IsBoolean()
  granted: boolean;
}

export class DeletionRequestDto {
  @ApiProperty({ required: false, description: 'Motivo (opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
