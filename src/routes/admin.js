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
    sections: config.landingPage.sections,
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
    const currentSections = modulesContent.landing_page?.sections || [];
    const sectionMap = new Map(currentSections.map(s => [s.id, s]));
    
    const newSections = order.map(id => sectionMap.get(id)).filter(Boolean);
    
    // Add any sections that weren't in the order (preserve them at end)
    currentSections.forEach(s => {
      if (!order.includes(s.id)) {
        newSections.push(s);
      }
    });
    
    modulesContent.landing_page.sections = newSections;
    
    // Write back to file
    writeFileSync(MODULES_PATH, JSON.stringify(modulesContent, null, 2));
    
    // Update in-memory config
    config.landingPage.sections = newSections;
    
    // Log action
    const adminUser = await findOrCreateUser(request.adminEmail);
    await logAction({
      action: 'CHANGE_LAYOUT',
      adminHandle: adminUser.handle,
      target: 'landing_page',
      details: { new_order: order },
    });

    return reply.send({ success: true, sections: newSections });
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
    
    const section = modulesContent.landing_page?.sections?.find(s => s.id === id);
    if (!section) {
      return reply.status(404).send({ error: 'Section not found' });
    }
    
    section.enabled = enabled;
    
    writeFileSync(MODULES_PATH, JSON.stringify(modulesContent, null, 2));
    
    // Update in-memory config
    const configSection = config.landingPage.sections.find(s => s.id === id);
    if (configSection) {
      configSection.enabled = enabled;
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
