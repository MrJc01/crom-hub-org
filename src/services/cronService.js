/**
 * Cron Service - Automated payments
 */
import { config } from '../config/loader.js';
import { createExpense, getFinancialSummary } from './financeService.js';
import { logAction } from './auditService.js';
import { prisma } from '../db/client.js';

/**
 * Run all configured auto-payments
 */
export async function runAutoPayments() {
  const cronConfig = config.modules.cron;
  
  if (!cronConfig?.enabled) {
    console.log('[Cron] Módulo desabilitado');
    return { success: false, message: 'Cron module disabled' };
  }

  const autoPayments = cronConfig.settings?.auto_payments;
  
  if (!autoPayments?.enabled || !autoPayments?.payments?.length) {
    console.log('[Cron] Nenhum pagamento automático configurado');
    return { success: true, processed: 0 };
  }

  const results = [];
  
  for (const payment of autoPayments.payments) {
    const result = await processAutoPayment(payment);
    results.push(result);
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  console.log(`[Cron] Processados: ${successCount} sucesso, ${failCount} falhas`);
  
  return { 
    success: true, 
    processed: successCount, 
    failed: failCount,
    results 
  };
}

/**
 * Process a single auto-payment
 */
async function processAutoPayment(payment) {
  const { id, description, amount, recipient, category } = payment;
  
  try {
    // Check balance
    const summary = await getFinancialSummary();
    const balance = summary.summary.balance;
    
    if (balance < amount) {
      await logAction({
        action: 'CRON_PAYMENT_FAILED',
        adminHandle: 'system',
        target: id,
        details: { 
          reason: 'Saldo insuficiente',
          required: amount,
          available: balance,
        },
      });
      
      console.log(`[Cron] ❌ Saldo insuficiente para ${id}: R$ ${amount} (disponível: R$ ${balance.toFixed(2)})`);
      
      return { 
        success: false, 
        id, 
        error: 'Insufficient balance',
        required: amount,
        available: balance,
      };
    }
    
    // Create expense transaction
    await prisma.transaction.create({
      data: {
        type: 'OUT',
        amount,
        currency: config.organization.currency || 'BRL',
        description: `🤖 ${description}`,
        category: category || 'infrastructure',
        recipient: recipient || null,
        automatic: true,
      },
    });
    
    await logAction({
      action: 'CRON_PAYMENT',
      adminHandle: 'system',
      target: id,
      details: { 
        description,
        amount,
        recipient,
      },
    });
    
    console.log(`[Cron] ✅ Pagamento automático: R$ ${amount.toFixed(2)} - ${description}`);
    
    return { success: true, id, amount };
    
  } catch (err) {
    console.error(`[Cron] Erro no pagamento ${id}:`, err);
    
    await logAction({
      action: 'CRON_PAYMENT_ERROR',
      adminHandle: 'system',
      target: id,
      details: { error: err.message },
    });
    
    return { success: false, id, error: err.message };
  }
}

/**
 * Get pending auto-payments status
 */
export async function getAutoPaymentsStatus() {
  const cronConfig = config.modules.cron;
  
  if (!cronConfig?.enabled) {
    return { enabled: false };
  }

  const autoPayments = cronConfig.settings?.auto_payments;
  const summary = await getFinancialSummary();
  
  const payments = autoPayments?.payments || [];
  const totalRequired = payments.reduce((sum, p) => sum + p.amount, 0);
  
  return {
    enabled: true,
    paymentsCount: payments.length,
    totalRequired,
    currentBalance: summary.summary.balance,
    canExecute: summary.summary.balance >= totalRequired,
    payments: payments.map(p => ({
      ...p,
      canPay: summary.summary.balance >= p.amount,
    })),
  };
}

export default {
  runAutoPayments,
  getAutoPaymentsStatus,
};
