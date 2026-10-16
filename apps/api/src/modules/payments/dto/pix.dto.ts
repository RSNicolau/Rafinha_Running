import { IsNumber, IsString, IsOptional, Min, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePixDto {
  @ApiProperty({ description: 'ID do plano — o valor é derivado no servidor', example: 'MONTHLY' })
  @IsString()
  @IsNotEmpty()
  planId: string;

  @ApiPropertyOptional({ description: 'Valor esperado em reais (conferência; divergente → 400)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  amount?: number;

  @ApiPropertyOptional({ description: 'Descrição do pagamento' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ description: 'E-mail do pagador (usa o do usuário logado se não informado)' })
  @IsString()
  @IsOptional()
  payerEmail?: string;
}
