import { IsNumber, IsString, IsOptional, Min, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePixPaymentDto {
  @ApiProperty({ description: 'Valor em centavos (ex: 4900 = R$49)', minimum: 100, example: 4900 })
  @IsNumber()
  @Min(100)
  amount: number; // in centavos

  @ApiProperty({ description: 'Descrição do pagamento', example: 'Plano Mensal - RR Rafinha Running' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ description: 'ID do plano a ser ativado após pagamento', example: 'MONTHLY' })
  @IsString()
  @IsOptional()
  planId?: string;
}

export class CreateCardPaymentDto {
  @ApiProperty({ description: 'Valor em centavos (ex: 4900 = R$49)', minimum: 100, example: 4900 })
  @IsNumber()
  @Min(100)
  amount: number; // in centavos

  @ApiProperty({ description: 'Descrição do pagamento', example: 'Plano Mensal - RR Rafinha Running' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ description: 'ID do plano a ser ativado após pagamento', example: 'MONTHLY' })
  @IsString()
  @IsOptional()
  planId?: string;

  @ApiProperty({
    description: 'Token do cartão gerado pelo Pagar.me.js no frontend. Em produção, use pagarme.js para tokenizar o cartão.',
    example: 'token_xxxxx',
  })
  @IsString()
  @IsNotEmpty()
  cardToken: string; // tokenized by Pagar.me.js on the frontend
}
