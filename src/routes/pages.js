import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/loader.js';
import { getFinancialSummary, getRecentTransactions, createDonation } from '../services/financeService.js';
import { getPublicLogs } from '../services/auditService.js';
import { checkDatabaseHealth } from '../db/client.js';
import { findOrCreateUser } from '../services/userService.js';
import { donateSchema } from '../schemas/validation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewsPath = join(__dirname, '..', 'views');

/**
 * GET / - Dashboard page
 */
async function dashboardPage(request, reply) {
  const summary = await getFinancialSummary();
  const transactions = await getRecentTransactions({ limit: 10 });
  
  // Map transactions for template
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

  return reply.view('pages/dashboard.ejs', {
    title: 'Dashboard',
    organization: config.organization,
    currency: config.organization.currency || 'BRL',
    balance: summary.summary.balance,
    totalIn: summary.summary.total_in,
    totalOut: summary.summary.total_out,
    donationCount: summary.counts.donations,
    expenseCount: summary.counts.expenses,
    goal: summary.goal,
    transactions: mappedTransactions,
  });
}

/**
 * POST /donate - Handle donation (HTMX)
 */
async function donateHandler(request, reply) {
  // Parse form data or JSON
  const body = request.body;
  
  // Validate
  const result = donateSchema.safeParse({
    amount: parseFloat(body.amount),
    message: body.message || undefined,
    email: body.email || undefined,
  });

  if (!result.success) {
    return reply.viewAsync('partials/donation-form.ejs', {
      error: result.error.errors[0]?.message || 'Dados inválidos',
    }, { layout: false });
  }

  const { amount, message, email } = result.data;

  try {
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

    // Return success partial
    return reply.viewAsync('partials/donation-success.ejs', {
      amount: transaction.amount,
      handle: donorHandle,
    }, { layout: false });

  } catch (err) {
    return reply.viewAsync('partials/donation-form.ejs', {
      error: err.message,
    }, { layout: false });
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
export function registerPageRoutes(app) {
  app.get('/', dashboardPage);
  app.post('/donate', donateHandler);
  app.get('/transparency', transparencyPage);
  app.get('/status', auditLogPage);
}
