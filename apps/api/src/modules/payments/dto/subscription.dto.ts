import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPlanType, PaymentProvider } from '@prisma/client';

export class CreateSubscriptionDto {
  @ApiProperty({ enum: SubscriptionPlanType, example: SubscriptionPlanType.MONTHLY })
  @IsEnum(SubscriptionPlanType, { message: 'Tipo de plano inválido' })
  planType: SubscriptionPlanType;

  @ApiProperty({ enum: PaymentProvider, example: PaymentProvider.STRIPE })
  @IsEnum(PaymentProvider, { message: 'Provedor de pagamento inválido' })
  provider: PaymentProvider;
}
