import { config } from '../config/loader.js';
import { checkDatabaseHealth } from '../db/client.js';

/**
 * GET /status - Health Check Endpoint
 */
export async function statusHandler(request, reply) {
  const dbHealth = await checkDatabaseHealth();
  
  const status = {
    name: config.organization.name,
    version: config.version,
    environment: config.env,
    timestamp: new Date().toISOString(),
    database: dbHealth,
    modules: {
      donations: config.modules.donations?.enabled ?? false,
      voting: config.modules.voting?.enabled ?? false,
      transparency: config.modules.transparency?.enabled ?? false,
      audit_log: config.modules.audit_log?.enabled ?? false,
      cron: config.modules.cron?.enabled ?? false,
    },
  };

  const httpStatus = dbHealth.status === 'healthy' ? 200 : 503;
  
  return reply.status(httpStatus).send(status);
}

export function registerStatusRoutes(app) {
  app.get('/status', statusHandler);
}
