import { config } from '../config/loader.js';
import { adminMiddleware } from '../middleware/admin.js';
import { findOrCreateUser } from '../services/userService.js';
import { createDonation, createExpense, getFinancialSummary, getRecentTransactions } from '../services/financeService.js';
import { logAction } from '../services/auditService.js';
import { donateSchema, expenseSchema, validateBody } from '../schemas/validation.js';

/**
 * POST /donate - Register a donation (public)
 */
async function donateHandler(request, reply) {
  const { amount, message, email } = request.validatedBody;
  
  // Check if donations module is enabled
  if (!config.modules.donations?.enabled) {
    return reply.status(503).send({
      error: 'Module Disabled',
      message: 'Módulo de doações está desabilitado',
    });
  }

  let donor = null;
  let donorHandle = null;

  // If email provided, find or create user
  if (email) {
    try {
      donor = await findOrCreateUser(email);
      donorHandle = donor.handle;
    } catch (err) {
      console.error('Erro ao criar usuário:', err);
    }
  } else {
    // Check if anonymous donations are allowed
    const allowAnonymous = config.modules.donations?.settings?.allow_anonymous ?? true;
    if (!allowAnonymous) {
      return reply.status(400).send({
        error: 'Anonymous Not Allowed',
        message: 'Doações anônimas não são permitidas',
      });
    }
  }

  try {
    const transaction = await createDonation({
      amount,
      message,
      donorId: donor?.id || null,
      donorHandle,
    });

    return reply.status(201).send({
      success: true,
      message: 'Doação registrada com sucesso!',
      transaction: {
        id: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        donor: donorHandle || 'Anônimo',
        createdAt: transaction.createdAt,
      },
    });

  } catch (err) {
    return reply.status(400).send({
      error: 'Donation Failed',
      message: err.message,
    });
  }
}

/**
 * POST /expense - Register an expense (admin only)
 */
async function expenseHandler(request, reply) {
  const { amount, description, category, recipient } = request.validatedBody;
  const adminEmail = request.adminEmail;

  try {
    // Create the expense
    const transaction = await createExpense({
      amount,
      description,
      category,
      recipient,
    });

    // Get admin user for logging
    const adminUser = await findOrCreateUser(adminEmail);

    // Log the action
    await logAction({
      action: 'CREATE_EXPENSE',
      adminHandle: adminUser.handle,
      target: `transaction:${transaction.id}`,
      details: {
        amount,
        description,
        category,
        recipient,
      },
    });

    return reply.status(201).send({
      success: true,
      message: 'Gasto registrado com sucesso!',
      transaction: {
        id: transaction.id,
        amount: transaction.amount,
        description: transaction.description,
        category: transaction.category,
        createdAt: transaction.createdAt,
      },
    });

  } catch (err) {
    return reply.status(400).send({
      error: 'Expense Failed',
      message: err.message,
    });
  }
}

/**
 * GET /finance/summary - Financial summary (public)
 */
async function summaryHandler(request, reply) {
  // Check if transparency module is enabled
  const isPublic = config.modules.transparency?.settings?.dashboard_public ?? true;
  
  if (!isPublic) {
    return reply.status(403).send({
      error: 'Dashboard Private',
      message: 'Dashboard financeiro não é público',
    });
  }

  try {
    const summary = await getFinancialSummary();
    
    return reply.send({
      organization: config.organization.name,
      ...summary,
      updatedAt: new Date().toISOString(),
    });

  } catch (err) {
    return reply.status(500).send({
      error: 'Summary Failed',
      message: err.message,
    });
  }
}

/**
 * GET /finance/transactions - List transactions (public if transparency enabled)
 */
async function transactionsHandler(request, reply) {
  const showTransactions = config.modules.transparency?.settings?.show_all_transactions ?? true;
  
  if (!showTransactions) {
    return reply.status(403).send({
      error: 'Transactions Private',
      message: 'Lista de transações não é pública',
    });
  }

  const limit = parseInt(request.query.limit) || 20;

  try {
    const transactions = await getRecentTransactions({ limit });
    
    // Optionally hide amounts based on config
    const showAmounts = config.modules.transparency?.settings?.show_transaction_amounts ?? true;
    
    const mapped = transactions.map(t => ({
      id: t.id,
      type: t.type,
      amount: showAmounts ? t.amount : null,
      currency: t.currency,
      donor: t.donorHandle || (t.type === 'IN' ? 'Anônimo' : null),
      description: t.description,
      category: t.category,
      message: t.message,
      createdAt: t.createdAt,
    }));

    return reply.send({
      transactions: mapped,
      count: mapped.length,
    });

  } catch (err) {
    return reply.status(500).send({
      error: 'Transactions Failed',
      message: err.message,
    });
  }
}

/**
 * Register finance routes
 */
export function registerFinanceRoutes(app) {
  // API routes (JSON)
  app.post('/api/donate', {
    preHandler: validateBody(donateSchema),
  }, donateHandler);

  app.get('/api/finance/summary', summaryHandler);
  app.get('/api/finance/transactions', transactionsHandler);

  // Admin routes
  app.post('/api/expense', {
    preHandler: [adminMiddleware, validateBody(expenseSchema)],
  }, expenseHandler);
}

