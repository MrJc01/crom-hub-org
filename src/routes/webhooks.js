/**
 * Webhooks Routes - Receive external notifications
 */
import { createDonation } from '../services/financeService.js';
import { logAction } from '../services/auditService.js';
import { constructWebhookEvent, isStripeEnabled } from '../services/stripeService.js';
import { config } from '../config/loader.js';

/**
 * POST /webhooks/:provider - Handle external webhooks
 */
async function webhookHandler(request, reply) {
  const { provider } = request.params;
  
  console.log(`[Webhook] Received from ${provider}`);
  
  try {
    switch (provider) {
      case 'stripe':
        return await processStripeWebhook(request, reply);
      
      case 'github':
        return await processGithubWebhook(request.body, reply);
      
      case 'generic':
        return await processGenericWebhook(request.body, reply);
      
      default:
        return reply.status(400).send({ error: 'Unknown provider' });
    }
  } catch (err) {
    console.error('[Webhook] Processing error:', err);
    
    await logAction({
      action: 'WEBHOOK_ERROR',
      adminHandle: 'system',
      target: provider,
      details: { error: err.message },
    });
    
    return reply.status(500).send({ error: 'Webhook processing failed' });
  }
}

/**
 * Process Stripe webhooks (checkout.session.completed)
 */
async function processStripeWebhook(request, reply) {
  const sig = request.headers['stripe-signature'];
  const rawBody = request.rawBody;
  
  let event;
  
  try {
    event = constructWebhookEvent(rawBody, sig);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return reply.status(400).send({ error: 'Webhook signature verification failed' });
  }
  
  console.log(`[Stripe Webhook] Event: ${event.type}`);
  
  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const metadata = session.metadata || {};
    
    // Extract donation details from metadata
    const amount = session.amount_total / 100; // Cents to BRL
    const handle = metadata.handle !== 'anonymous' ? metadata.handle : null;
    const message = metadata.message || null;
    
    // Create donation transaction
    await createDonation({
      amount,
      message: message || 'Doação via Stripe',
      donorHandle: handle,
      externalId: session.id,
    });
    
    await logAction({
      action: 'STRIPE_PAYMENT',
      adminHandle: 'system',
      target: handle || 'anonymous',
      details: { 
        sessionId: session.id, 
        amount,
        email: session.customer_email,
      },
    });
    
    console.log(`💰 Stripe: Doação de R$ ${amount.toFixed(2)} confirmada`);
  }
  
  // Handle payment_intent.succeeded (legacy/direct payments)
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const metadata = paymentIntent.metadata || {};
    
    await createDonation({
      amount: paymentIntent.amount / 100,
      message: metadata.message || paymentIntent.description || 'Doação via Stripe',
      donorHandle: metadata.handle || null,
      externalId: paymentIntent.id,
    });
    
    await logAction({
      action: 'STRIPE_PAYMENT',
      adminHandle: 'system',
      target: 'stripe',
      details: { paymentId: paymentIntent.id },
    });
  }
  
  return reply.send({ received: true });
}

/**
 * Process GitHub webhooks (deploy notifications, releases)
 */
async function processGithubWebhook(body, reply) {
  const event = body;
  
  if (event.action === 'published' && event.release) {
    await logAction({
      action: 'DEPLOY_NOTIFICATION',
      adminHandle: 'system',
      target: 'github',
      details: { 
        release: event.release.tag_name,
        name: event.release.name,
      },
    });
  }
  
  return reply.send({ received: true });
}

/**
 * Process generic webhooks
 */
async function processGenericWebhook(body, reply) {
  const { type, amount, description } = body;
  
  if (type === 'donation' && amount) {
    await createDonation({
      amount: parseFloat(amount),
      message: description || 'Doação via Webhook',
    });
    
    await logAction({
      action: 'WEBHOOK_PROCESSED',
      adminHandle: 'system',
      target: 'generic',
      details: { type, amount },
    });
  } else {
    await logAction({
      action: 'WEBHOOK_RECEIVED',
      adminHandle: 'system',
      target: 'generic',
      details: body,
    });
  }
  
  return reply.send({ received: true });
}

/**
 * Register webhook routes
 */
export function registerWebhookRoutes(app) {
  // Custom content type parser for raw body (needed for Stripe signature)
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      req.rawBody = body.toString();
      const parsed = JSON.parse(body);
      done(null, parsed);
    } catch (err) {
      done(err, undefined);
    }
  });
  
  app.post('/webhooks/:provider', webhookHandler);
}
