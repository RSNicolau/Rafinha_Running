import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { StripeService } from './stripe/stripe.service';
import { MercadoPagoService } from './mercadopago/mercadopago.service';
import { PagarmeService } from './pagarme/pagarme.service';
import { AsaasService } from './asaas/asaas.service';
import { CheckoutService } from './checkout/checkout.service';
import { CheckoutController } from './checkout/checkout.controller';
import { FulfillmentService } from './checkout/fulfillment.service';
import { PlanPricingService } from './plan-pricing.service';
import { ReferralsModule } from '../referrals/referrals.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ReferralsModule, NotificationsModule],
  controllers: [PaymentsController, CheckoutController],
  providers: [
    PaymentsService,
    StripeService,
    MercadoPagoService,
    PagarmeService,
    AsaasService,
    CheckoutService,
    FulfillmentService,
    PlanPricingService,
  ],
  exports: [PaymentsService, PagarmeService, MercadoPagoService, CheckoutService, FulfillmentService, AsaasService],
})
export class PaymentsModule {}
