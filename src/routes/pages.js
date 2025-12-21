import { config } from '../config/loader.js';
import { getFinancialSummary, getRecentTransactions, createDonation } from '../services/financeService.js';
import { getPublicLogs } from '../services/auditService.js';
import { checkDatabaseHealth } from '../db/client.js';
import { findOrCreateUser } from '../services/userService.js';
import { donateSchema } from '../schemas/validation.js';
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
 * POST /donate - Handle donation (HTMX)
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
export function registerPageRoutes(app) {
  app.get('/', dashboardPage);
  app.post('/donate', donateHandler);
  app.get('/transparency', transparencyPage);
  app.get('/status', auditLogPage);
}
