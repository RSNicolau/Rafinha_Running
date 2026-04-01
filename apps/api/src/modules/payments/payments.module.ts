import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { StripeService } from './stripe/stripe.service';
import { MercadoPagoService } from './mercadopago/mercadopago.service';
import { PagarmeService } from './pagarme/pagarme.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, StripeService, MercadoPagoService, PagarmeService],
  exports: [PaymentsService, PagarmeService],
})
export class PaymentsModule {}
