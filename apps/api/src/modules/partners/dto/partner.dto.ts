import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PartialType } from '@nestjs/swagger';

// http(s) com host válido (rejeita "https://javascript:alert(1)", "https://data:..." etc.)
const HTTP_URL = /^(https?:\/\/(?!(?:javascript|data|vbscript|file):)[a-z0-9.-]+\.[a-z]{2,}(?::\d{1,5})?(?:[\/?#]\S*)?)?$/i;
const IMG_URL = /^(https?:\/\/\S+|\/api\/v1\/files\/\S+|data:image\/(png|jpe?g|webp);base64,\S+)?$/i;

export class CreatePartnerDto {
  @IsString() @IsNotEmpty({ message: 'Nome do parceiro é obrigatório' }) @MaxLength(120)
  name: string;

  @IsOptional() @IsString() @MaxLength(60)
  category?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(1_500_000) @Matches(IMG_URL, { message: 'URL do logo inválida' })
  logoUrl?: string;

  @IsOptional() @IsString() @MaxLength(16)
  emoji?: string;

  @IsOptional() @IsString() @MaxLength(32)
  color?: string;

  @IsOptional() @IsString() @MaxLength(500) @Matches(HTTP_URL, { message: 'Link inválido (use http:// ou https://)' })
  linkUrl?: string;

  @IsOptional() @IsInt() @Min(0) @Max(10000)
  sortOrder?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdatePartnerDto extends PartialType(CreatePartnerDto) {}
