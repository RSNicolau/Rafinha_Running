import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBrandingDto {
  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(120)
  tenantName?: string;

  @ApiPropertyOptional({ example: '#DC2626' }) @IsString() @IsOptional() @MaxLength(32)
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#1F2937' }) @IsString() @IsOptional() @MaxLength(32)
  secondaryColor?: string;

  @ApiPropertyOptional({ example: 'running', enum: ['running', 'cycling', 'swimming', 'triathlon', 'crossfit', 'other'] })
  @IsString() @IsOptional() @MaxLength(32)
  niche?: string;

  /** URL http(s), caminho /api/v1/files/... ou data:image (legado do painel). */
  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(1_500_000)
  @Matches(/^(https?:\/\/|\/api\/v1\/files\/|data:image\/(png|jpe?g|webp);base64,)/i, { message: 'URL do logo inválida' })
  logoUrl?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(1_500_000)
  @Matches(/^(https?:\/\/|\/api\/v1\/files\/|data:image\/(png|jpe?g|webp);base64,)/i, { message: 'URL do banner inválida' })
  bannerUrl?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(253)
  @Matches(/^[a-z0-9.-]*$/i, { message: 'Domínio inválido' })
  domain?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(500)
  welcomeMsg?: string;
}
