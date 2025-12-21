import { config } from '../config/loader.js';
import { adminMiddleware } from '../middleware/admin.js';
import { logAction } from '../services/auditService.js';
import { findOrCreateUser } from '../services/userService.js';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..');
const MODULES_PATH = join(ROOT_DIR, 'modules.json');

/**
 * GET /admin - Admin dashboard
 */
async function adminDashboard(request, reply) {
  return reply.view('pages/admin/dashboard.ejs', {
    title: 'Admin - Hub.org',
    organization: config.organization,
    adminEmail: request.adminEmail,
  });
}

/**
 * GET /admin/layout - Layout editor
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
 * POST /admin/layout/reorder - Reorder sections
 */
async function reorderSections(request, reply) {
  const { order } = request.body;
  
  if (!order || !Array.isArray(order)) {
    return reply.status(400).send({ error: 'Order array is required' });
  }

  try {
    // Read current modules.json
    const modulesContent = JSON.parse(readFileSync(MODULES_PATH, 'utf-8'));
    
    // Reorder sections based on new order
    modulesContent.landing_page.sections_order = order;
    
    // Write back to file
    writeFileSync(MODULES_PATH, JSON.stringify(modulesContent, null, 2));
    
    // Update in-memory config
    config.landingPage.sections_order = order;
    
    // Log action
    const adminUser = await findOrCreateUser(request.adminEmail);
    await logAction({
      action: 'CHANGE_LAYOUT',
      adminHandle: adminUser.handle,
      target: 'landing_page',
      details: { new_order: order },
    });

    return reply.send({ success: true, order });
  } catch (err) {
    console.error('Error reordering sections:', err);
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
    
    // Update in-memory config
    if (config.landingPage.sections_data[id]) {
      config.landingPage.sections_data[id].enabled = enabled;
    }
    
    // Log action
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
 * Register admin routes
 */
export function registerAdminRoutes(app) {
  // All admin routes require authentication
  app.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/admin')) {
      return adminMiddleware(request, reply);
    }
  });

  app.get('/admin', adminDashboard);
  app.get('/admin/layout', layoutEditor);
  app.post('/admin/layout/reorder', reorderSections);
  app.post('/admin/layout/toggle', toggleSection);
}
