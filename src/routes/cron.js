/**
 * Cron Routes - Automated payment triggers
 */
import { runAutoPayments, getAutoPaymentsStatus } from '../services/cronService.js';
import { config } from '../config/loader.js';

/**
 * POST /cron/run-payments - Execute auto payments
 * Protected by secret header
 */
async function runPaymentsHandler(request, reply) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = request.headers['x-cron-secret'];
  
  // Verify secret (skip in dev mode if not set)
  if (cronSecret && providedSecret !== cronSecret) {
    return reply.status(401).send({ 
      error: 'Unauthorized',
      message: 'Invalid or missing X-Cron-Secret header',
    });
  }
  
  // Allow in dev mode without secret
  if (!cronSecret && !config.isDev) {
    return reply.status(500).send({
      error: 'Configuration Error',
      message: 'CRON_SECRET not configured',
    });
  }
  
  console.log('[Cron] Executando pagamentos automáticos...');
  
  const result = await runAutoPayments();
  
  return reply.send(result);
}

/**
 * GET /cron/status - Check auto payments status
 */
async function cronStatusHandler(request, reply) {
  const status = await getAutoPaymentsStatus();
  return reply.send(status);
}

/**
 * Register cron routes
 */
export function registerCronRoutes(app) {
  app.post('/cron/run-payments', runPaymentsHandler);
  app.get('/cron/status', cronStatusHandler);
}
