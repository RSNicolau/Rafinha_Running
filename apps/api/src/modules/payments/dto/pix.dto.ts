import { IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePixDto {
  @ApiProperty({ description: 'Valor em reais', minimum: 1 })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ description: 'Descrição do pagamento' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'E-mail do pagador (usa o do usuário logado se não informado)' })
  @IsString()
  @IsOptional()
  payerEmail?: string;
}
