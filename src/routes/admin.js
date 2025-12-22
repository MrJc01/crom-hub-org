import { config } from '../config/loader.js';
import { adminMiddleware } from '../middleware/admin.js';
import { logAction } from '../services/auditService.js';
import { findOrCreateUser } from '../services/userService.js';
import { getFinancialSummary } from '../services/financeService.js';
import { getActiveProposals, getAllProposals } from '../services/votingService.js';
import { createUpdate } from '../services/updateService.js';
import { prisma } from '../db/client.js';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..');
const MODULES_PATH = join(ROOT_DIR, 'modules.json');

/**
 * GET /admin - Admin dashboard (Command Center)
 */
async function adminDashboard(request, reply) {
  const summary = await getFinancialSummary();
  const proposals = await getActiveProposals();
  
  return reply.view('pages/admin/dashboard.ejs', {
    title: 'Centro de Comando - Hub.org',
    organization: config.organization,
    adminEmail: request.adminEmail,
    modules: config.modules,
    sections: config.landingPage.sections_order.map(id => ({
      id,
      ...config.landingPage.sections_data[id]
    })),
    proposals,
    stats: {
      balance: summary.summary.balance,
      donations: summary.counts.donations,
      proposals: proposals.length,
    },
  });
}

/**
 * GET /admin/layout - Layout editor (standalone page)
 */
async function layoutEditor(request, reply) {
  return reply.view('pages/admin/layout.ejs', {
    title: 'Editor de Layout - Admin',
    organization: config.organization,
    sections: config.landingPage.sections_order.map(id => ({
      id,
      ...config.landingPage.sections_data[id]
    })),
    adminEmail: request.adminEmail,
  });
}

/**
 * POST /admin/modules/toggle - Toggle module enabled status
 */
async function toggleModule(request, reply) {
  const { module, enabled } = request.body;
  
  if (!module) {
    return reply.status(400).send({ error: 'Module name is required' });
  }

  try {
    const modulesContent = JSON.parse(readFileSync(MODULES_PATH, 'utf-8'));
    
    if (!modulesContent.modules[module]) {
      return reply.status(404).send({ error: 'Module not found' });
    }
    
    modulesContent.modules[module].enabled = enabled;
    writeFileSync(MODULES_PATH, JSON.stringify(modulesContent, null, 2));
    
    // Update in-memory config
    if (config.modules[module]) {
      config.modules[module].enabled = enabled;
    }
    
    const adminUser = await findOrCreateUser(request.adminEmail);
    await logAction({
      action: 'CHANGE_SETTINGS',
      adminHandle: adminUser.handle,
      target: `module:${module}`,
      details: { enabled },
    });

    return reply.send({ success: true, module, enabled });
  } catch (err) {
    return reply.status(500).send({ error: err.message });
  }
}

/**
 * POST /admin/layout/reorder - Reorder sections
 */
async function reorderSections(request, reply) {
  const { order } = request.body;
  
  if (!order || !Array.isArray(order)) {
    return reply.status(400).send({ error: 'Order array is required' });
  }

  try {
    const modulesContent = JSON.parse(readFileSync(MODULES_PATH, 'utf-8'));
    modulesContent.landing_page.sections_order = order;
    writeFileSync(MODULES_PATH, JSON.stringify(modulesContent, null, 2));
    
    config.landingPage.sections_order = order;
    
    const adminUser = await findOrCreateUser(request.adminEmail);
    await logAction({
      action: 'CHANGE_LAYOUT',
      adminHandle: adminUser.handle,
      target: 'landing_page',
      details: { new_order: order },
    });

    return reply.send({ success: true, order });
  } catch (err) {
    return reply.status(500).send({ error: err.message });
  }
}

/**
 * POST /admin/layout/toggle - Toggle section visibility
 */
async function toggleSection(request, reply) {
  const { id, enabled } = request.body;
  
  if (!id) {
    return reply.status(400).send({ error: 'Section ID is required' });
  }

  try {
    const modulesContent = JSON.parse(readFileSync(MODULES_PATH, 'utf-8'));
    
    if (modulesContent.landing_page?.sections_data?.[id]) {
      modulesContent.landing_page.sections_data[id].enabled = enabled;
    } else {
      return reply.status(404).send({ error: 'Section not found' });
    }
    
    writeFileSync(MODULES_PATH, JSON.stringify(modulesContent, null, 2));
    
    if (config.landingPage.sections_data[id]) {
      config.landingPage.sections_data[id].enabled = enabled;
    }
    
    const adminUser = await findOrCreateUser(request.adminEmail);
    await logAction({
      action: 'CHANGE_LAYOUT',
      adminHandle: adminUser.handle,
      target: `section:${id}`,
      details: { enabled },
    });

    return reply.send({ success: true, id, enabled });
  } catch (err) {
    return reply.status(500).send({ error: err.message });
  }
}

/**
 * POST /admin/updates - Create new update
 */
async function createUpdateHandler(request, reply) {
  const { title, content, type } = request.body;
  
  if (!title || !content) {
    return reply.status(400).send({ error: 'Title and content are required' });
  }

  try {
    const adminUser = await findOrCreateUser(request.adminEmail);
    
    await createUpdate({
      title,
      content,
      type: type || 'DONE',
      authorId: adminUser.id,
    });
    
    await logAction({
      action: 'CREATE_UPDATE',
      adminHandle: adminUser.handle,
      target: title,
      details: { type },
    });

    return reply.send({ success: true });
  } catch (err) {
    return reply.status(500).send({ error: err.message });
  }
}

/**
 * POST /admin/proposals/:id/close - Close a proposal
 */
async function closeProposal(request, reply) {
  const { id } = request.params;
  
  try {
    const proposal = await prisma.proposal.findUnique({ where: { id: parseInt(id) } });
    
    if (!proposal) {
      return reply.status(404).send({ error: 'Proposal not found' });
    }
    
    // Determine result based on votes
    let result = 'no_quorum';
    const totalVotes = proposal.yesCount + proposal.noCount;
    if (totalVotes >= (config.modules.voting?.settings?.quorum?.min_votes || 5)) {
      result = proposal.yesCount > proposal.noCount ? 'approved' : 'denied';
    }
    
    await prisma.proposal.update({
      where: { id: parseInt(id) },
      data: {
        status: 'closed',
        result,
        closedAt: new Date(),
      },
    });
    
    const adminUser = await findOrCreateUser(request.adminEmail);
    await logAction({
      action: 'CLOSE_PROPOSAL',
      adminHandle: adminUser.handle,
      target: proposal.title,
      details: { result, yesCount: proposal.yesCount, noCount: proposal.noCount },
    });

    return reply.send({ success: true, result });
  } catch (err) {
    return reply.status(500).send({ error: err.message });
  }
}

/**
 * Register admin routes
 */
export function registerAdminRoutes(app) {
  app.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/admin')) {
      return adminMiddleware(request, reply);
    }
  });

  app.get('/admin', adminDashboard);
  app.get('/admin/layout', layoutEditor);
  app.post('/admin/modules/toggle', toggleModule);
  app.post('/admin/layout/reorder', reorderSections);
  app.post('/admin/layout/toggle', toggleSection);
  app.post('/admin/updates', createUpdateHandler);
  app.post('/admin/proposals/:id/close', closeProposal);
}
