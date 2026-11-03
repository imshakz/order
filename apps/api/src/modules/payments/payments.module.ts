import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { OrderStatus, PaymentMethod, PaymentStatus, StaffRole } from '@prisma/client';
import { Request } from 'express';
import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser, StaffOnly } from '../../common/auth';
import { num, round2 } from '../../common/money';
import { RequiresFeature } from '../../config/features';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersModule, OrdersService } from '../orders/orders.module';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { createPaymentProvider, PaymentProvider } from './payment-provider';

const PROVIDER = Symbol('PAYMENT_PROVIDER');

class IntentDto {
  @IsString() orderId: string;
  @IsOptional() @IsNumber() @Min(0) @Max(10000) tip?: number;
}

class ConfirmDto {
  @IsString() paymentId: string;
}

class ManualDto {
  @IsString() orderId: string;
  @IsIn([PaymentMethod.CASH, PaymentMethod.CARD_TERMINAL]) method: PaymentMethod;
  @IsOptional() @IsNumber() @Min(0) @Max(10000) tip?: number;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  readonly currency = (process.env.CURRENCY || 'aud').toLowerCase();

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly realtime: RealtimeGateway,
    @Inject(PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  config() {
    return { provider: this.provider.name, currency: this.currency };
  }

  private async payableOrder(orderId: string, user?: AuthUser) {
    const order = await this.orders.get(orderId);
    if (order.status === OrderStatus.PAID) throw new BadRequestException('This order has already been paid');
    if (order.status === OrderStatus.CANCELLED) throw new BadRequestException('This order was cancelled');
    if (order.customerId && user?.kind === 'customer' && user.sub !== order.customerId) {
      throw new ForbiddenException('This is not your order');
    }
    return order;
  }

  /** Start an online card payment. The client finishes it with Stripe Elements (or instantly in simulated mode). */
  async createIntent(dto: IntentDto, user?: AuthUser) {
    const order = await this.payableOrder(dto.orderId, user);
    const tip = round2(dto.tip ?? 0);
    const amount = round2(num(order.total) + tip);
    const result = await this.provider.createIntent({
      amountCents: Math.round(amount * 100),
      currency: this.currency,
      orderId: order.id,
      orderNumber: order.number,
      email: order.customer?.email,
    });
    const existing = await this.prisma.payment.findUnique({ where: { providerRef: result.providerRef } });
    const payment =
      existing ??
      (await this.prisma.payment.create({
        data: {
          orderId: order.id,
          amount,
          tip,
          method: PaymentMethod.CARD_ONLINE,
          provider: this.provider.name,
          providerRef: result.providerRef,
        },
      }));
    return {
      paymentId: payment.id,
      provider: this.provider.name,
      clientSecret: result.clientSecret,
      amount,
      currency: this.currency,
    };
  }

  /** Called by the client after checkout so the order updates even if webhooks aren't set up yet. */
  async confirm(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment?.providerRef) throw new NotFoundException('Payment not found');
    if (payment.status === PaymentStatus.SUCCEEDED) return { status: 'succeeded', orderId: payment.orderId };
    const status = await this.provider.retrieve(payment.providerRef);
    if (status === 'succeeded') await this.finalize(payment.id);
    if (status === 'failed') {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });
    }
    return { status, orderId: payment.orderId };
  }

  async webhook(rawBody: Buffer | undefined, signature?: string) {
    if (!rawBody) throw new BadRequestException('Missing body');
    let outcome;
    try {
      outcome = this.provider.parseWebhook(rawBody, signature);
    } catch (e) {
      this.logger.warn(`Rejected webhook: ${e.message}`);
      throw new BadRequestException('Invalid signature');
    }
    if (!outcome) return { received: true };
    const payment = await this.prisma.payment.findUnique({ where: { providerRef: outcome.providerRef } });
    if (!payment) return { received: true };
    if (outcome.status === 'succeeded') await this.finalize(payment.id);
    else await this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });
    return { received: true };
  }

  /** Cash or card-machine payment recorded by staff. */
  async manual(dto: ManualDto) {
    const order = await this.payableOrder(dto.orderId);
    const tip = round2(dto.tip ?? 0);
    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        amount: round2(num(order.total) + tip),
        tip,
        method: dto.method,
        provider: 'manual',
      },
    });
    await this.finalize(payment.id);
    return this.orders.get(order.id);
  }

  async refund(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status !== PaymentStatus.SUCCEEDED) throw new BadRequestException('Only successful payments can be refunded');
    if (payment.provider === 'stripe' && payment.providerRef) await this.provider.refund(payment.providerRef);
    const updated = await this.prisma.payment.update({ where: { id: paymentId }, data: { status: PaymentStatus.REFUNDED } });
    this.realtime.toStaff('payment.refunded', updated);
    return updated;
  }

  /** Idempotent: safe to call from both the webhook and the client confirm. */
  private async finalize(paymentId: string) {
    const { count } = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: { not: PaymentStatus.SUCCEEDED } },
      data: { status: PaymentStatus.SUCCEEDED },
    });
    if (count === 0) return;
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    await this.orders.markPaid(payment.orderId, num(payment.tip));
  }
}

@Controller('payments')
@RequiresFeature('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('config')
  config() {
    return this.payments.config();
  }

  @Post('intent')
  intent(@Body() dto: IntentDto, @CurrentUser() user?: AuthUser) {
    return this.payments.createIntent(dto, user);
  }

  @Post('confirm')
  @HttpCode(200)
  confirm(@Body() dto: ConfirmDto) {
    return this.payments.confirm(dto.paymentId);
  }

  @Post('webhook')
  @HttpCode(200)
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    return this.payments.webhook(req.rawBody, signature);
  }

  @Post('manual')
  @StaffOnly(StaffRole.SERVER, StaffRole.HOST)
  manual(@Body() dto: ManualDto) {
    return this.payments.manual(dto);
  }

  @Post(':id/refund')
  @StaffOnly(StaffRole.MANAGER)
  refund(@Param('id') id: string) {
    return this.payments.refund(id);
  }
}

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, { provide: PROVIDER, useFactory: createPaymentProvider }],
})
export class PaymentsModule {}
