import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';

export type ProviderStatus = 'pending' | 'succeeded' | 'failed';

export interface IntentResult {
  providerRef: string;
  clientSecret?: string;
  status: ProviderStatus;
}

export interface WebhookOutcome {
  providerRef: string;
  status: ProviderStatus;
}

/**
 * Anything that can take card payments. Add Square, Adyen, Tyro etc. by implementing this
 * interface and returning it from createPaymentProvider().
 */
export interface PaymentProvider {
  readonly name: string;
  createIntent(args: { amountCents: number; currency: string; orderId: string; orderNumber: number; email?: string }): Promise<IntentResult>;
  retrieve(providerRef: string): Promise<ProviderStatus>;
  parseWebhook(rawBody: Buffer, signature: string | undefined): WebhookOutcome | null;
  refund(providerRef: string, amountCents?: number): Promise<void>;
}

class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';
  private readonly stripe: Stripe;

  constructor(secretKey: string, private readonly webhookSecret?: string) {
    this.stripe = new Stripe(secretKey);
  }

  private map(status: Stripe.PaymentIntent.Status): ProviderStatus {
    if (status === 'succeeded') return 'succeeded';
    if (status === 'canceled') return 'failed';
    return 'pending';
  }

  async createIntent({ amountCents, currency, orderId, orderNumber, email }: Parameters<PaymentProvider['createIntent']>[0]) {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency,
        automatic_payment_methods: { enabled: true },
        metadata: { orderId, orderNumber: String(orderNumber) },
        receipt_email: email,
        description: `Order #${orderNumber}`,
      },
      { idempotencyKey: `order-${orderId}-${amountCents}` },
    );
    return { providerRef: intent.id, clientSecret: intent.client_secret ?? undefined, status: this.map(intent.status) };
  }

  async retrieve(ref: string) {
    const intent = await this.stripe.paymentIntents.retrieve(ref);
    return this.map(intent.status);
  }

  parseWebhook(rawBody: Buffer, signature: string | undefined): WebhookOutcome | null {
    if (!this.webhookSecret || !signature) return null;
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as Stripe.PaymentIntent;
      return { providerRef: intent.id, status: this.map(intent.status) === 'succeeded' ? 'succeeded' : 'failed' };
    }
    return null;
  }

  async refund(ref: string, amountCents?: number) {
    await this.stripe.refunds.create({ payment_intent: ref, amount: amountCents });
  }
}

/** Approves every payment. Lets you demo the whole flow without a Stripe account. */
class SimulatedProvider implements PaymentProvider {
  readonly name = 'simulated';

  async createIntent() {
    return { providerRef: `sim_${randomUUID()}`, clientSecret: undefined, status: 'pending' as const };
  }
  async retrieve() {
    return 'succeeded' as const;
  }
  parseWebhook() {
    return null;
  }
  async refund() {}
}

export function createPaymentProvider(): PaymentProvider {
  const key = process.env.STRIPE_SECRET_KEY;
  if (key) return new StripeProvider(key, process.env.STRIPE_WEBHOOK_SECRET || undefined);
  new Logger('Payments').warn('STRIPE_SECRET_KEY not set: using the simulated payment provider');
  return new SimulatedProvider();
}
