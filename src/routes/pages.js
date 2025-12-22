import { config } from '../config/loader.js';
import { getFinancialSummary, getRecentTransactions, createDonation } from '../services/financeService.js';
import { getPublicLogs } from '../services/auditService.js';
import { checkDatabaseHealth } from '../db/client.js';
import { findOrCreateUser } from '../services/userService.js';
import { donateSchema } from '../schemas/validation.js';
import { getRecentUpdates } from '../services/updateService.js';
import { getActiveProposals, castVote } from '../services/votingService.js';
import ejs from 'ejs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewsPath = join(__dirname, '..', 'views');

/**
 * Render partial without layout (for HTMX)
 */
async function renderPartial(reply, template, data) {
  const html = await ejs.renderFile(join(viewsPath, template), data);
  reply.type('text/html').send(html);
}

/**
 * GET / - Dashboard page
 */
async function dashboardPage(request, reply) {
  const summary = await getFinancialSummary();
  const transactions = await getRecentTransactions({ limit: 10 });
  
  const mappedTransactions = transactions.map(t => ({
    id: t.id,
    type: t.type,
    amount: t.amount,
    donor: t.donorHandle || (t.type === 'IN' ? 'Anônimo' : null),
    description: t.description,
    category: t.category,
    message: t.message,
    automatic: t.automatic,
    createdAt: t.createdAt,
  }));

  // Unified data object for all sections
  const data = {
    currency: config.organization.currency || 'BRL',
    balance: summary.summary.balance,
    totalIn: summary.summary.total_in,
    totalOut: summary.summary.total_out,
    donationCount: summary.counts.donations,
    expenseCount: summary.counts.expenses,
    goal: summary.goal,
    transactions: mappedTransactions,
    updates: await getRecentUpdates(3),
  };

  return reply.view('pages/dashboard.ejs', {
    title: config.organization.name,
    organization: config.organization,
    modules: config.modules,
    sections_order: config.landingPage.sections_order,
    sections_data: config.landingPage.sections_data,
    data,
  });
}

/**
 * POST /donate - Handle donation (HTMX or redirect to Stripe)
 */
async function donateHandler(request, reply) {
  const body = request.body;
  
  const result = donateSchema.safeParse({
    amount: parseFloat(body.amount),
    message: body.message || undefined,
    email: body.email || undefined,
  });

  if (!result.success) {
    return renderPartial(reply, 'partials/donation-form.ejs', {
      error: result.error.errors[0]?.message || 'Dados inválidos',
    });
  }

  const { amount, message, email } = result.data;

  try {
    // Try Stripe Checkout if configured
    const { isStripeEnabled, createCheckoutSession } = await import('../services/stripeService.js');
    
    if (isStripeEnabled()) {
      let handle = null;
      if (email) {
        const donor = await findOrCreateUser(email);
        handle = donor.handle;
      }

      const session = await createCheckoutSession({
        amount,
        handle,
        message,
        email,
        successUrl: `${config.appUrl}/donate/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${config.appUrl}/#donate`,
      });

      // Return redirect for HTMX
      return reply
        .header('HX-Redirect', session.url)
        .send({ redirect: session.url });
    }

    // Fallback: Direct donation (dev mode without Stripe)
    let donor = null;
    let donorHandle = null;

    if (email) {
      donor = await findOrCreateUser(email);
      donorHandle = donor.handle;
    }

    const transaction = await createDonation({
      amount,
      message,
      donorId: donor?.id,
      donorHandle,
    });

    return renderPartial(reply, 'partials/donation-success.ejs', {
      amount: transaction.amount,
      handle: donorHandle,
    });

  } catch (err) {
    return renderPartial(reply, 'partials/donation-form.ejs', {
      error: err.message,
    });
  }
}

/**
 * GET /transparency - Full transactions page
 */
async function transparencyPage(request, reply) {
  const summary = await getFinancialSummary();
  const transactions = await getRecentTransactions({ limit: 50 });
  
  const mappedTransactions = transactions.map(t => ({
    id: t.id,
    type: t.type,
    amount: t.amount,
    donor: t.donorHandle || (t.type === 'IN' ? 'Anônimo' : null),
    description: t.description,
    category: t.category,
    message: t.message,
    automatic: t.automatic,
    createdAt: t.createdAt,
  }));

  return reply.view('pages/transparency.ejs', {
    title: 'Transparência',
    organization: config.organization,
    currency: config.organization.currency || 'BRL',
    balance: summary.summary.balance,
    totalIn: summary.summary.total_in,
    totalOut: summary.summary.total_out,
    transactions: mappedTransactions,
  });
}

/**
 * GET /status - Audit log page
 */
async function auditLogPage(request, reply) {
  const dbHealth = await checkDatabaseHealth();
  const { logs } = await getPublicLogs({ limit: 50 });
  
  return reply.view('pages/audit-log.ejs', {
    title: 'Audit Log',
    organization: config.organization,
    status: {
      database: dbHealth,
      version: config.version,
      environment: config.env,
    },
    logs,
  });
}

/**
 * Register page routes
 */
/**
 * GET /updates - Updates/changelog page
 */
async function updatesPage(request, reply) {
  const updates = await getRecentUpdates(20);
  
  return reply.view('pages/updates.ejs', {
    title: 'Atualizações',
    organization: config.organization,
    updates,
  });
}

/**
 * Register page routes
 */
/**
 * GET /voting - Voting page
 */
async function votingPage(request, reply) {
  const proposals = await getActiveProposals();
  const userHandle = request.session?.user?.handle || null;
  
  return reply.view('pages/voting.ejs', {
    title: 'Votações',
    organization: config.organization,
    proposals,
    userHandle,
  });
}

/**
 * POST /voting/:id/vote - Cast a vote
 */
async function voteHandler(request, reply) {
  const { id } = request.params;
  const { vote } = request.body;
  const userHandle = request.session?.user?.handle;
  
  if (!userHandle) {
    return reply.status(401).send({ error: 'Autenticação necessária' });
  }
  
  try {
    await castVote({ proposalId: parseInt(id), userHandle, vote });
    
    // Return updated proposal card
    const proposals = await getActiveProposals();
    const proposal = proposals.find(p => p.id === parseInt(id));
    if (!proposal) {
      return reply.status(404).send({ error: 'Proposta não encontrada' });
    }
    
    return reply.view('pages/voting.ejs', {
      title: 'Votações',
      organization: config.organization,
      proposals,
      userHandle,
      success: 'Voto registrado com sucesso!',
    });
  } catch (err) {
    return reply.status(400).send({ error: err.message });
  }
}

/**
 * Register page routes
 */
export function registerPageRoutes(app) {
  app.get('/', dashboardPage);
  app.post('/donate', donateHandler);
  app.get('/transparency', transparencyPage);
  app.get('/status', auditLogPage);
  app.get('/updates', updatesPage);
  app.get('/voting', votingPage);
  app.post('/voting/:id/vote', voteHandler);
}
