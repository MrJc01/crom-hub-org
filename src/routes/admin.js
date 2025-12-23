import archiver from 'archiver';
import { config } from '../config/loader.js';
import { adminMiddleware } from '../middleware/admin.js';
import { logAction } from '../services/auditService.js';
import { findOrCreateUser } from '../services/userService.js';
import { getFinancialSummary, getRecentTransactions } from '../services/financeService.js';
import { getActiveProposals, getAllProposals } from '../services/votingService.js';
import { createUpdate, getRecentUpdates } from '../services/updateService.js';
import { generateProjectZip } from '../services/exportService.js';
import { checkForUpdates, performUpdate as runSystemUpdate } from '../services/systemService.js';
import { prisma } from '../db/client.js';
import { readFileSync, writeFileSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..');
const MODULES_PATH = join(ROOT_DIR, 'modules.json');
const viewsPath = join(__dirname, '..', 'views');

// ... (previous handlers remain unchanged)

/**
 * GET /admin/export - Export page
 */
async function exportPage(request, reply) {
  if (config.modules.export?.enabled === false) {
    return reply.status(403).send({ error: 'Export feature is disabled' });
  }

  return reply.view('pages/admin/export.ejs', {
    title: 'Exportar Projeto',
    organization: config.organization,
    currentPage: 'export',
    breadcrumb: 'Exportar',
    adminEmail: request.adminEmail,
    config: config,
    postUrl: '/admin/export',
    previewUrl: '/admin/export/preview'
  }, { layout: 'admin-layout.ejs' });
}

/**
 * POST /admin/export/preview - Preview configured app
 */
async function previewExport(request, reply) {
    const { org_name, org_desc, org_color, org_logo } = request.body;
    
    // Mock config for preview
    const previewConfig = JSON.parse(JSON.stringify(config));
    previewConfig.organization.name = org_name;
    previewConfig.organization.description = org_desc;
    previewConfig.organization.primary_color = org_color;
    previewConfig.organization.logo_url = org_logo;
    
    // Render dashboard with simulated config
    // We reuse the existing dashboard logic but inject the new config
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

    const data = {
        currency: previewConfig.organization.currency || 'BRL',
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
        title: `[PREVIEW] ${previewConfig.organization.name}`,
        organization: previewConfig.organization,
        modules: previewConfig.modules,
        sections_order: previewConfig.landingPage.sections_order,
        sections_data: previewConfig.landingPage.sections_data,
        data,
        isPreview: true // Flag to show banner
    }, { layout: 'layout.ejs' });
}

/**
 * GET /admin/system - System Page
 */
async function systemPage(request, reply) {
  return reply.view('pages/admin/system.ejs', {
    title: 'Sistema',
    organization: config.organization,
    currentPage: 'system',
    breadcrumb: 'Sistema',
    adminEmail: request.adminEmail,
    config: config,
  }, { layout: 'admin-layout.ejs' });
}

/**
 * POST /admin/system/check - Check for updates
 */
/**
 * POST /admin/system/check - Check for updates
 */
async function checkUpdate(request, reply) {
    try {
        const { latest, current, hasUpdate } = await checkForUpdates();
        
        if (hasUpdate) {
             return reply.send(`<div class="text-left">
                <div class="flex items-center gap-2 text-yellow-400 mb-2">
                    <span class="text-2xl">⚠️</span>
                    <span class="font-bold">Nova versão disponível: ${latest}</span>
                </div>
                <p class="text-gray-400 text-sm mb-4">Versão atual: ${current}. Recomendamos fazer um backup antes de atualizar.</p>
                <div class="flex gap-4">
                    <button 
                        hx-post="/admin/system/update" 
                        hx-target="#terminal-output" 
                        hx-swap="innerHTML"
                        onclick="document.getElementById('terminal-container').classList.remove('hidden')"
                        class="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold transition"
                    >
                        🚀 Atualizar Agora
                    </button>
                    <a href="https://github.com/MrJc01/crom-hub-org/releases" target="_blank" class="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition text-sm flex items-center">
                        Ver Changelog
                    </a>
                </div>
             </div>`);
        } else {
             return reply.send(`<div class="text-green-400 font-bold flex flex-col items-center gap-2">
                <span class="text-4xl">✅</span>
                <span>Seu sistema está atualizado!</span>
                <span class="text-xs text-gray-500 font-normal">Versão ${current} é a mais recente.</span>
             </div>`);
        }

    } catch (err) {
        return reply.send(`<div class="text-red-400 text-sm">Erro ao verificar atualizações: ${err.message}</div>`);
    }
}

/**
 * POST /admin/system/update - Perform update (git pull)
 */
async function performUpdate(request, reply) {
    try {
        const { success, stdout, stderr } = await runSystemUpdate();
        
        if (success) {
            return reply.send(`
$ git pull origin main && npm install
${stdout}
${stderr ? `STDERR:\n${stderr}` : ''}

✅ Atualização concluída com sucesso!
🔄 Reinicie a aplicação para aplicar as mudanças.
            `.trim());
        } else {
             throw new Error(stderr);
        }
    } catch (err) {
        return reply.send(`
❌ Erro na atualização:
${err.message}
        `.trim());
    }
}

/**
 * POST /admin/export - Download Zip
 */
async function exportHandler(request, reply) {
    const { appName, description, primaryColor, logoUrl, adminEmail, modules } = request.body;

    try {
        await generateProjectZip({
            appName,
            description,
            primaryColor,
            logoUrl,
            adminEmail,
            modules // This is likely an object { moduleName: "true" }
        }, reply);
        
        // Log the action
        const adminUser = await findOrCreateUser(request.adminEmail);
        await logAction({
            action: 'EXPORT_PROJECT',
            adminHandle: adminUser.handle,
            target: appName || config.organization.name,
            details: { has_modules: !!modules },
        });

    } catch (err) {
        request.log.error(err);
        return reply.status(500).send({ error: 'Failed to generate export' });
    }
}

/**
 * POST /admin/users/:id/role - Toggle user role
 */
async function toggleUserRole(request, reply) {
  const { id } = request.params;
  const { role } = request.body;
  
  try {
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { role },
    });
    
    const adminUser = await findOrCreateUser(request.adminEmail);
    await logAction({
      action: 'CHANGE_ROLE',
      adminHandle: adminUser.handle,
      target: user.handle,
      details: { newRole: role },
    });

    return reply.send({ success: true, role });
  } catch (err) {
    return reply.status(500).send({ error: err.message });
  }
}

/**
 * POST /admin/users/:id/ban - Toggle user ban
 */
async function toggleUserBan(request, reply) {
  const { id } = request.params;
  const { banned, reason } = request.body;
  
  try {
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { 
        banned: banned === 'true' || banned === true,
        bannedReason: reason || null,
        bannedAt: (banned === 'true' || banned === true) ? new Date() : null
      },
    });
    
    const adminUser = await findOrCreateUser(request.adminEmail);
    await logAction({
      action: (banned === 'true' || banned === true) ? 'BAN_USER' : 'UNBAN_USER',
      adminHandle: adminUser.handle,
      target: user.handle,
      details: { reason },
    });

    if (request.headers['hx-request']) {
        // Return updated row or status pill
        // For simplicity, just reload or return success message
        return reply.send({ success: true });
    }

    return reply.send({ success: true });
  } catch (err) {
    return reply.status(500).send({ error: err.message });
  }
}

/**
 * Register admin routes
 */


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
    currentPage: 'dashboard',
    breadcrumb: null,
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
  }, { layout: 'admin-layout.ejs' });
}

/**
 * GET /admin/layout - Layout editor (standalone page)
 */
async function layoutEditor(request, reply) {
  return reply.view('pages/admin/layout.ejs', {
    title: 'Editor de Layout - Admin',
    organization: config.organization,
    currentPage: 'layout',
    breadcrumb: 'Layout',
    sections: config.landingPage.sections_order.map(id => ({
      id,
      ...config.landingPage.sections_data[id]
    })),
    adminEmail: request.adminEmail,
  }, { layout: 'admin-layout.ejs' });
}

/**
 * POST /admin/modules/toggle - Toggle module enabled status
 */
async function toggleModule(request, reply) {
  const { module, enabled } = request.body;
  
  if (!module) {
    return reply.status(400).send({ error: 'Module name is required' });
  }

  // FORCE BOOLEAN (HTMX/Form data might send strings)
  const isEnabled = String(enabled) === 'true';

  try {
    const modulesContent = JSON.parse(readFileSync(MODULES_PATH, 'utf-8'));
    
    let targetSection = 'modules';
    if (!modulesContent.modules[module]) {
        if (modulesContent.integrations && modulesContent.integrations[module]) {
            targetSection = 'integrations';
        } else {
            return reply.status(404).send({ error: 'Module not found' });
        }
    }
    
    modulesContent[targetSection][module].enabled = isEnabled;
    writeFileSync(MODULES_PATH, JSON.stringify(modulesContent, null, 2));
    
    // Update in-memory config
    if (targetSection === 'modules' && config.modules[module]) {
      config.modules[module].enabled = isEnabled;
    } else if (targetSection === 'integrations' && config.integrations[module]) {
      config.integrations[module].enabled = isEnabled;
    }
    
    const adminUser = await findOrCreateUser(request.adminEmail);
    await logAction({
      action: 'CHANGE_SETTINGS',
      adminHandle: adminUser.handle,
      target: `module:${module}`,
      details: { enabled: isEnabled },
    });

    // Return updated component (HTML) instead of JSON
    // We need to fetch the module object again (updated) to render
    const updatedModule = config.modules[module] || config.integrations[module];
    
    // We need to render the partial with ejs
    // Since we are inside a route handler, we can use ejs.renderFile or reply.view (which usually renders full page, but we want partial)
    // Fastify/Point-of-view 'reply.view' uses the configured template engine.
    
    // However, fastify-ejs usually renders relative to templates root.
    // 'partials/admin/module-card.ejs' should be accessible.
    
    // Render the single card
    const html = await ejs.renderFile(join(viewsPath, 'partials', 'admin', 'module-card.ejs'), {
        key: module,
        module: updatedModule
    });
    
    return reply.type('text/html').send(html);
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
 * GET /admin/updates - Manage updates
 */
async function adminUpdates(request, reply) {
  const updates = await getRecentUpdates(50);
  return reply.view('pages/admin/updates.ejs', {
    title: 'Gerenciar Atualizações',
    organization: config.organization,
    currentPage: 'updates',
    breadcrumb: 'Atualizações',
    adminEmail: request.adminEmail,
    updates,
  }, { layout: 'admin-layout.ejs' });
}

/**
 * GET /admin/proposals - Manage proposals
 */
async function adminProposals(request, reply) {
  const proposals = await getAllProposals();
  return reply.view('pages/admin/proposals.ejs', {
    title: 'Gerenciar Propostas',
    organization: config.organization,
    currentPage: 'proposals',
    breadcrumb: 'Propostas',
    adminEmail: request.adminEmail,
    proposals,
    config: config.modules.voting?.settings || {},
  }, { layout: 'admin-layout.ejs' });
}

/**
 * GET /admin/finances - Manage finances
 */
async function adminFinances(request, reply) {
  const summary = await getFinancialSummary();
  return reply.view('pages/admin/finances.ejs', {
    title: 'Finanças',
    organization: config.organization,
    currentPage: 'finances',
    breadcrumb: 'Finanças',
    adminEmail: request.adminEmail,
    summary: summary.summary,
    transactions: await prisma.transaction.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
    }),
  }, { layout: 'admin-layout.ejs' });
}

/**
 * GET /admin/users - Manage users
 */
async function adminUsers(request, reply) {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return reply.view('pages/admin/users.ejs', {
    title: 'Usuários',
    organization: config.organization,
    currentPage: 'users',
    breadcrumb: 'Usuários',
    adminEmail: request.adminEmail,
    users,
  }, { layout: 'admin-layout.ejs' });
}

/**
 * GET /admin/settings - Global settings
 */
async function adminSettings(request, reply) {
  return reply.view('pages/admin/settings.ejs', {
    title: 'Configurações',
    organization: config.organization,
    currentPage: 'settings',
    breadcrumb: 'Configurações',
    adminEmail: request.adminEmail,
    config: config,
  }, { layout: 'admin-layout.ejs' });
}


/**
 * GET /admin/modules - Modules management
 */
async function adminModulesPage(request, reply) {
  return reply.view('pages/admin/modules.ejs', {
    title: 'Gerenciar Módulos',
    organization: config.organization,
    currentPage: 'modules',
    breadcrumb: 'Módulos',
    adminEmail: request.adminEmail,
    config: config,
  }, { layout: 'admin-layout.ejs' });
}

/**
 * POST /admin/modules/update - Update module detailed settings
 */
async function updateModuleSettings(request, reply) {
  const { moduleName } = request.body;
  
  try {
      const modulesContent = JSON.parse(readFileSync(MODULES_PATH, 'utf-8'));
      
      let targetModule = modulesContent.modules[moduleName];
      let targetSection = 'modules';

      if (!targetModule) {
           if (modulesContent.integrations && modulesContent.integrations[moduleName]) {
               targetModule = modulesContent.integrations[moduleName];
               targetSection = 'integrations';
           } else {
               return reply.status(404).send({ error: "Module not found" });
           }
      }

      for (const [key, value] of Object.entries(request.body)) {
          if (key.startsWith('settings.')) {
              const cleanKey = key.replace('settings.', '');
              const parts = cleanKey.split('.');
              let current = targetModule.settings;
              
              for (let i = 0; i < parts.length - 1; i++) {
                  if (!current[parts[i]]) current[parts[i]] = {};
                  current = current[parts[i]];
              }
              
              const finalKey = parts[parts.length - 1];
              
              let finalValue = value;
              if (value === 'true') finalValue = true;
              else if (value === 'false') finalValue = false;
              else if (!isNaN(Number(value)) && value !== '') finalValue = Number(value);
              else {
                  try {
                      if (value.startsWith('[') || value.startsWith('{')) {
                          finalValue = JSON.parse(value);
                      }
                  } catch (e) { /* keep as string */ }
              }
              
              current[finalKey] = finalValue;
          }
      }

      writeFileSync(MODULES_PATH, JSON.stringify(modulesContent, null, 2));
      
      // Update memory ref (deep merge or replace)
      if (targetSection === 'modules') {
          config.modules[moduleName] = modulesContent.modules[moduleName];
      } else {
          config.integrations[moduleName] = modulesContent.integrations[moduleName];
      }
      
      const adminUser = await findOrCreateUser(request.adminEmail);
      await logAction({
          action: 'CHANGE_SETTINGS',
          adminHandle: adminUser.handle,
          target: `module:${moduleName}`,
          details: { settings_update: true },
      });
      
      return reply.send({ success: true, message: "Settings Updated" });
      
  } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: err.message });
  }
}

/**
 * POST /admin/layout/update - Update section details (title, subtitle, etc)
 */
async function updateSectionDetails(request, reply) {
  const { id, title, subtitle, cta_primary, cta_secondary } = request.body;
  
  if (!id) return reply.status(400).send({ error: 'ID required' });

  try {
      const modulesContent = JSON.parse(readFileSync(MODULES_PATH, 'utf-8'));
      
      const section = modulesContent.landing_page.sections_data[id];
      if (!section) return reply.status(404).send({ error: 'Section not found' });
      
      // Update fields if provided
      if (title !== undefined) section.title = title;
      if (subtitle !== undefined) section.subtitle = subtitle;
      if (cta_primary !== undefined) section.cta_primary = cta_primary;
      if (cta_secondary !== undefined) section.cta_secondary = cta_secondary;
      
      writeFileSync(MODULES_PATH, JSON.stringify(modulesContent, null, 2));
      
      // Update config in memory
      config.landingPage.sections_data[id] = section;
      
      const adminUser = await findOrCreateUser(request.adminEmail);
      await logAction({
          action: 'CHANGE_LAYOUT',
          adminHandle: adminUser.handle,
          target: `section:${id}`,
          details: { update_text: true },
      });
      
      return reply.send({ success: true, message: 'Seção atualizada' });
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
  app.get('/admin/modules', adminModulesPage);
  app.get('/admin/updates', adminUpdates);
  app.get('/admin/proposals', adminProposals);
  app.get('/admin/finances', adminFinances);
  app.get('/admin/users', adminUsers);
  app.get('/admin/settings', adminSettings);
  app.get('/admin/export', exportPage);
  app.get('/admin/system', systemPage);

  app.post('/admin/modules/toggle', toggleModule);
  app.post('/admin/modules/update', updateModuleSettings);
  app.post('/admin/layout/reorder', reorderSections);
  app.post('/admin/layout/toggle', toggleSection);
  app.post('/admin/layout/update', updateSectionDetails);
  app.post('/admin/updates', createUpdateHandler);
  app.post('/admin/proposals/:id/close', closeProposal);

  app.post('/admin/export', exportHandler);
  app.post('/admin/export/preview', previewExport);

  app.post('/admin/users/:id/role', toggleUserRole);
  app.post('/admin/users/:id/ban', toggleUserBan);

  app.post('/admin/system/check', checkUpdate);
  app.post('/admin/system/update', performUpdate);
}
