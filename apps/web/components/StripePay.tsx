'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { useState } from 'react';
import { STRIPE_KEY } from '@/lib/config';
import { money } from '@/lib/format';
import { ErrorNote, Spinner } from './ui';

let stripePromise: Promise<Stripe | null> | null = null;
const getStripe = () => (stripePromise ??= loadStripe(STRIPE_KEY));

/** Stripe Payment Element: cards, Apple Pay and Google Pay where the device supports them. */
export function StripePay({ clientSecret, amount, returnUrl, onPaid }: { clientSecret: string; amount: number; returnUrl: string; onPaid: () => void }) {
  return (
    <Elements
      stripe={getStripe()}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: { colorPrimary: '#14342b', borderRadius: '12px', fontFamily: 'system-ui, sans-serif' },
        },
      }}
    >
      <PayForm amount={amount} returnUrl={returnUrl} onPaid={onPaid} />
    </Elements>
  );
}

function PayForm({ amount, returnUrl, onPaid }: { amount: number; returnUrl: string; onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: err } = await stripe.confirmPayment({ elements, redirect: 'if_required', confirmParams: { return_url: returnUrl } });
    if (err) setError(err.message ?? 'Payment did not go through. Check your card details and try again.');
    else onPaid();
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <PaymentElement />
      <ErrorNote error={error} />
      <button className="btn-primary w-full py-3.5 text-base" onClick={pay} disabled={!stripe || busy}>
        {busy && <Spinner className="h-4 w-4" />}
        Pay {money(amount)}
      </button>
    </div>
  );
}
