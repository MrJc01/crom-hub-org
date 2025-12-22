/**
 * Stripe Service - Payment processing
 */
import Stripe from 'stripe';
import { config } from '../config/loader.js';

// Initialize Stripe with secret key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

let stripe = null;

if (stripeSecretKey) {
  stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2023-10-16',
  });
  console.log('✅ Stripe inicializado');
} else {
  console.warn('⚠️ STRIPE_SECRET_KEY não configurada - pagamentos desabilitados');
}

/**
 * Check if Stripe is configured
 */
export function isStripeEnabled() {
  return !!stripe;
}

/**
 * Create a Stripe Checkout Session
 */
export async function createCheckoutSession({ 
  amount, 
  handle, 
  message, 
  email,
  successUrl, 
  cancelUrl 
}) {
  if (!stripe) {
    throw new Error('Stripe não está configurado');
  }

  const amountInCents = Math.round(amount * 100);
  
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: config.organization.currency?.toLowerCase() || 'brl',
          product_data: {
            name: `Doação para ${config.organization.name}`,
            description: message || 'Apoio ao projeto',
          },
          unit_amount: amountInCents,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: email || undefined,
    metadata: {
      handle: handle || 'anonymous',
      message: message || '',
      source: 'hub-org',
    },
  });

  return session;
}

/**
 * Construct webhook event with signature verification
 */
export function constructWebhookEvent(payload, signature) {
  if (!stripe) {
    throw new Error('Stripe não está configurado');
  }

  if (!stripeWebhookSecret) {
    console.warn('⚠️ STRIPE_WEBHOOK_SECRET não configurada - pulando verificação');
    return JSON.parse(payload);
  }

  return stripe.webhooks.constructEvent(payload, signature, stripeWebhookSecret);
}

/**
 * Get Stripe publishable key (for frontend)
 */
export function getPublishableKey() {
  return process.env.STRIPE_PUBLISHABLE_KEY || null;
}

export default {
  isStripeEnabled,
  createCheckoutSession,
  constructWebhookEvent,
  getPublishableKey,
};
