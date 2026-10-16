import { IsNumber, IsString, IsOptional, Min, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * O valor cobrado é derivado do plano no servidor. `amount` é opcional e, se enviado,
 * precisa ser igual ao preço do plano (senão 400).
 */
export class CreatePixPaymentDto {
  @ApiPropertyOptional({ description: 'Valor esperado em centavos (conferência). O servidor usa o preço do plano.', example: 17400 })
  @IsOptional()
  @IsNumber()
  @Min(100)
  amount?: number;

  @ApiPropertyOptional({ description: 'Descrição do pagamento', example: 'Plano Mensal - RR Rafinha Running' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ description: 'ID do plano (STARTER, PRO, SCALE, ELITE, WHITE_LABEL, MONTHLY, QUARTERLY, SEMIANNUAL)', example: 'MONTHLY' })
  @IsString()
  @IsNotEmpty()
  planId: string;
}

export class CreateCardPaymentDto extends CreatePixPaymentDto {
  @ApiProperty({
    description: 'Token do cartão gerado pelo Pagar.me.js no frontend.',
    example: 'token_xxxxx',
  })
  @IsString()
  @IsNotEmpty()
  cardToken: string; // tokenized by Pagar.me.js on the frontend
}
