import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBrandingDto {
  @ApiPropertyOptional() @IsString() @IsOptional()
  tenantName?: string;

  @ApiPropertyOptional({ example: '#DC2626' }) @IsString() @IsOptional()
  primaryColor?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  bannerUrl?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  domain?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  welcomeMsg?: string;
}
