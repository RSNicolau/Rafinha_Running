import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength, ValidateNested, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckoutBuyerDto {
  @ApiProperty({ example: 'Maria da Silva' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'maria@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(160)
  email: string;

  @ApiProperty({ description: 'CPF (somente para emissão da cobrança — não é armazenado)', example: '529.982.247-25' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  cpf: string;

  @ApiPropertyOptional({ example: '21999999999' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class CreateCheckoutDto {
  @ApiProperty({ enum: ['STORE_ORDER', 'EVENT_REGISTRATION', 'PLATFORM_PLAN'] })
  @IsIn(['STORE_ORDER', 'EVENT_REGISTRATION', 'PLATFORM_PLAN'])
  purpose: 'STORE_ORDER' | 'EVENT_REGISTRATION' | 'PLATFORM_PLAN';

  @ApiProperty({ description: 'ID do pedido, da inscrição, ou tipo do plano (PLATFORM_PLAN)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  refId: string;

  @ApiPropertyOptional({ description: 'Token público do pedido (compra na loja sem login)' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  refToken?: string;

  @ApiProperty({ type: CheckoutBuyerDto })
  @ValidateNested()
  @Type(() => CheckoutBuyerDto)
  buyer: CheckoutBuyerDto;

  @ApiPropertyOptional({ enum: ['ASAAS', 'STRIPE'], description: 'STRIPE = cartão internacional' })
  @IsOptional()
  @IsIn(['ASAAS', 'STRIPE'])
  provider?: 'ASAAS' | 'STRIPE';

  @ApiPropertyOptional({ enum: ['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'], default: 'PIX' })
  @IsOptional()
  @IsIn(['PIX', 'BOLETO', 'CREDIT_CARD', 'UNDEFINED'])
  method?: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';

  @ApiPropertyOptional({ default: true, description: 'Abater o crédito de indicação do atleta (loja/eventos; mínimo cobrado R$5)' })
  @IsOptional()
  @IsBoolean()
  useCredit?: boolean;
}
