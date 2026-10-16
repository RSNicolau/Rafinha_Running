import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductCategory, StoreOrderStatus } from '@prisma/client';

const trim = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim() : value);

// ── Pedido ────────────────────────────────────────────────────────────────────

export class CreateStoreOrderDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 'Maria da Silva' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  customerName: string;

  @ApiProperty({ example: 'maria@email.com' })
  @Transform(trim)
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(160)
  customerEmail: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  size?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string;

  @ApiProperty({ minimum: 1, maximum: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  quantity: number;

  @ApiPropertyOptional({ enum: ['SHIPPING', 'PICKUP'], default: 'PICKUP' })
  @IsOptional()
  @IsIn(['SHIPPING', 'PICKUP'])
  deliveryMethod?: 'SHIPPING' | 'PICKUP';

  @ApiPropertyOptional({ description: 'Obrigatório quando deliveryMethod = SHIPPING' })
  @ValidateIf((o) => o.deliveryMethod === 'SHIPPING')
  @IsString()
  @IsNotEmpty({ message: 'Informe o endereço de entrega' })
  @MaxLength(400)
  shippingAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: StoreOrderStatus })
  @IsEnum(StoreOrderStatus, { message: 'Status inválido' })
  status: StoreOrderStatus;

  @ApiPropertyOptional({ description: 'Código de rastreio (envio)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  trackingCode?: string;
}

// ── Produto (whitelist explícita: coachId e reserved NUNCA vêm do cliente) ────

export class CreateProductDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: ProductCategory })
  @IsEnum(ProductCategory)
  category: ProductCategory;

  @ApiProperty({ description: 'Preço em centavos' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  priceInCents: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  images?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  sizes?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  colors?: string[];

  @ApiPropertyOptional({ description: 'Estoque físico (pronta-entrega)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  totalStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: '% de desconto para alunos do coach' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  athleteDiscountPercent?: number;

  @ApiPropertyOptional({ description: 'Venda sob encomenda (sem estoque físico)' })
  @IsOptional()
  @IsBoolean()
  isPreOrder?: boolean;

  @ApiPropertyOptional({ description: 'Data limite para encomendar (ISO)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  preOrderDeadline?: string | null;

  @ApiPropertyOptional({ description: 'Previsão de entrega da encomenda (ISO)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  estimatedDelivery?: string | null;

  @ApiPropertyOptional({ description: 'Máximo de unidades encomendadas (vazio = sem limite)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  preOrderLimit?: number | null;
}

export class UpdateProductDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsEnum(ProductCategory) category?: ProductCategory;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000) priceInCents?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(1000, { each: true }) images?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(20, { each: true }) sizes?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(40, { each: true }) colors?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) totalStock?: number;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) athleteDiscountPercent?: number;
  @IsOptional() @IsBoolean() isPreOrder?: boolean;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() preOrderDeadline?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() estimatedDelivery?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt() @Min(1) preOrderLimit?: number | null;
}

// ── Cupons ────────────────────────────────────────────────────────────────────

export class CreateStoreCouponDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  code: string;

  @ApiProperty({ enum: ['PERCENT', 'FIXED', 'COURTESY'] })
  @IsIn(['PERCENT', 'FIXED', 'COURTESY'])
  type: 'PERCENT' | 'FIXED' | 'COURTESY';

  @ApiPropertyOptional({ description: 'PERCENT: 1–100; FIXED: centavos' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUses?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateStoreCouponDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** PERCENT: 1–100; FIXED: centavos (> 0). Ignorado em COURTESY. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) value?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt() @Min(1) maxUses?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() expiresAt?: string | null;
}

export class ValidateStoreCouponDto {
  @IsString() @IsNotEmpty() @MaxLength(80) coachId: string;
  @IsString() @IsNotEmpty() @MaxLength(40) code: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) quantity?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceInCents?: number;
}

export class ListOrdersQueryDto {
  @IsOptional() @IsEnum(StoreOrderStatus) status?: StoreOrderStatus;
  @IsOptional() @IsIn(['true', 'false']) preOrder?: 'true' | 'false';
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
