import { prisma } from '../db/client.js';
import { config } from '../config/loader.js';

/**
 * Log an admin action to the audit log
 * @param {Object} params
 * @param {string} params.action - Action type (BAN_USER, DELETE_PROPOSAL, etc.)
 * @param {string} params.adminHandle - Handle of the admin performing the action
 * @param {string} [params.target] - Target of the action (@handle or resource id)
 * @param {Object} [params.details] - Additional details (will be stringified)
 */
export async function logAction({ action, adminHandle, target, details }) {
  // Check if audit logging is enabled
  const auditConfig = config.modules.audit_log;
  if (!auditConfig?.enabled) {
    return null;
  }

  // Check if this action type should be logged
  const actionsToLog = auditConfig.settings?.actions_to_log || [];
  if (actionsToLog.length > 0 && !actionsToLog.includes(action)) {
    return null;
  }

  // Determine if log should be public
  const isPublic = auditConfig.settings?.public ?? true;

  const log = await prisma.auditLog.create({
    data: {
      action,
      adminHandle,
      target: target || null,
      details: details ? JSON.stringify(details) : null,
      public: isPublic,
    },
  });

  console.log(`📋 Audit Log: ${action} by ${adminHandle}${target ? ` on ${target}` : ''}`);
  return log;
}

/**
 * Get public audit logs
 */
export async function getPublicLogs({ page = 1, limit = 50 }) {
  const auditConfig = config.modules.audit_log;
  
  if (!auditConfig?.enabled || !auditConfig.settings?.public) {
    return { logs: [], total: 0 };
  }

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { public: true },
      orderBy: { timestamp: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where: { public: true } }),
  ]);

  // Parse details JSON for each log
  const parsedLogs = logs.map(log => ({
    ...log,
    details: log.details ? JSON.parse(log.details) : null,
  }));

  return { logs: parsedLogs, total, page, limit };
}

/**
 * Get all audit logs (admin only)
 */
export async function getAllLogs({ page = 1, limit = 50 }) {
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count(),
  ]);

  const parsedLogs = logs.map(log => ({
    ...log,
    details: log.details ? JSON.parse(log.details) : null,
  }));

  return { logs: parsedLogs, total, page, limit };
}

export default {
  logAction,
  getPublicLogs,
  getAllLogs,
};
