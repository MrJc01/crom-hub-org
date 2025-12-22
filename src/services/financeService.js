import { prisma } from '../db/client.js';
import { config } from '../config/loader.js';
import { notifyDonation } from './notificationService.js';

/**
 * Create a donation (IN transaction)
 */
export async function createDonation({ amount, message, donorId, donorHandle, externalId }) {
  const donationConfig = config.modules.donations?.settings;
  
  // Validate amount against config
  if (donationConfig) {
    if (amount < donationConfig.min_amount) {
      throw new Error(`Valor mínimo de doação: R$ ${donationConfig.min_amount}`);
    }
    if (amount > donationConfig.max_amount) {
      throw new Error(`Valor máximo de doação: R$ ${donationConfig.max_amount}`);
    }
  }

  const transaction = await prisma.transaction.create({
    data: {
      type: 'IN',
      amount,
      currency: config.organization.currency || 'BRL',
      donorId: donorId || null,
      donorHandle: donorHandle || null,
      message: message || null,
      externalId: externalId || null,
      automatic: false,
    },
  });

  console.log(`💰 Doação recebida: R$ ${amount.toFixed(2)}${donorHandle ? ` de ${donorHandle}` : ' (anônimo)'}`);
  
  // Send notification (async, don't block)
  notifyDonation({ amount, donorHandle, message }).catch(err => 
    console.error('[Notification] Error:', err.message)
  );

  return transaction;
}

/**
 * Create an expense (OUT transaction)
 */
export async function createExpense({ amount, description, category, recipient }) {
  const transaction = await prisma.transaction.create({
    data: {
      type: 'OUT',
      amount,
      currency: config.organization.currency || 'BRL',
      description,
      category: category || 'other',
      recipient: recipient || null,
      automatic: false,
    },
  });

  console.log(`📤 Gasto registrado: R$ ${amount.toFixed(2)} - ${description}`);
  return transaction;
}

/**
 * Get financial summary
 */
export async function getFinancialSummary() {
  // Get totals by type
  const totals = await prisma.transaction.groupBy({
    by: ['type'],
    _sum: { amount: true },
  });

  const totalIn = totals.find(t => t.type === 'IN')?._sum.amount || 0;
  const totalOut = totals.find(t => t.type === 'OUT')?._sum.amount || 0;
  const balance = totalIn - totalOut;

  // Get transaction counts
  const counts = await prisma.transaction.groupBy({
    by: ['type'],
    _count: true,
  });

  const donationCount = counts.find(c => c.type === 'IN')?._count || 0;
  const expenseCount = counts.find(c => c.type === 'OUT')?._count || 0;

  // Goal progress (from modules.json - would need to be added)
  const goal = config.modules.donations?.settings?.goal;
  let goalProgress = null;
  
  if (goal?.enabled && goal?.target_amount) {
    goalProgress = {
      target: goal.target_amount,
      current: totalIn,
      percentage: Math.min((totalIn / goal.target_amount) * 100, 100),
      description: goal.description || null,
    };
  }

  return {
    summary: {
      total_in: totalIn,
      total_out: totalOut,
      balance,
      currency: config.organization.currency || 'BRL',
    },
    counts: {
      donations: donationCount,
      expenses: expenseCount,
    },
    goal: goalProgress,
  };
}

/**
 * Get recent transactions
 */
export async function getRecentTransactions({ limit = 20, type = null }) {
  const where = type ? { type } : {};

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return transactions;
}

/**
 * Get all transactions with pagination
 */
export async function getTransactions({ page = 1, limit = 50, type = null }) {
  const skip = (page - 1) * limit;
  const where = type ? { type } : {};

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  return { transactions, total, page, limit };
}

export default {
  createDonation,
  createExpense,
  getFinancialSummary,
  getRecentTransactions,
  getTransactions,
};
