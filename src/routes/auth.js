import { requestLogin, verifyToken } from '../services/authService.js';
import { prisma } from '../db/client.js';
import { config, isAdmin } from '../config/loader.js';
import { z } from 'zod';
import ejs from 'ejs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewsPath = join(__dirname, '..', 'views');

const emailSchema = z.string().email('Email inválido');

/**
 * Render partial without layout (for HTMX)
 */
async function renderPartial(reply, template, data) {
  const html = await ejs.renderFile(join(viewsPath, template), data);
  return reply.type('text/html').send(html);
}

/**
 * GET /login
 */
async function loginPage(request, reply) {
  if (request.session.user) {
    // Redirect based on role
    return reply.redirect(isAdmin(request.session.user.email) ? '/admin' : '/');
  }

  return reply.view('pages/login.ejs', { 
    title: 'Login - ' + config.organization.name,
    organization: config.organization,
    error: null, 
    sent: false 
  }, { layout: 'layout.ejs' });
}

/**
 * POST /auth/login (HTMX)
 */
async function loginHandler(request, reply) {
  const { email, whatsapp } = request.body;
  
  const result = emailSchema.safeParse(email);
  
  if (!result.success) {
    return renderPartial(reply, 'partials/login-content.ejs', { 
      error: result.error.errors[0].message,
      sent: false 
    });
  }

  // Check mandatory WhatsApp
  // WhatsApp Logic Check
  const waMode = config.modules.auth?.settings?.whatsapp_mode || 'optional';

  if (waMode === 'required' && !whatsapp) {
      return renderPartial(reply, 'partials/login-content.ejs', { 
        error: 'WhatsApp é obrigatório para login nesta organização.',
        sent: false 
      });
  }

  try {
    await requestLogin(email, null, whatsapp);
    return renderPartial(reply, 'partials/login-content.ejs', { 
      error: null,
      sent: true,
      email 
    });
  } catch (err) {
    return renderPartial(reply, 'partials/login-content.ejs', { 
      error: 'Erro ao enviar email. Tente novamente.',
      sent: false 
    });
  }
}

/**
 * GET /auth/verify
 */
async function verifyHandler(request, reply) {
  const { token, returnUrl } = request.query;

  try {
    const user = await verifyToken(token);
    
    // Set session
    // Set session
    request.session.user = {
      id: user.id,
      handle: user.handle,
      email: user.email,
      role: user.role,
      whatsapp: user.whatsapp, // Include WA in session for quick check at dashboard
    };
    
    // Check if we should flash the popup
    const showPopup = config.modules.auth?.settings?.show_popup_after_login;
    const waMode = config.modules.auth?.settings?.whatsapp_mode || 'optional';
    
    if (showPopup && waMode === 'optional' && !user.whatsapp) {
        // Check if user has dismissed it permanently
        let metadata = {};
        try { metadata = JSON.parse(user.metadata || "{}"); } catch (e) {}
        
        if (!metadata.whatsapp_prompt_dismissed) {
             request.session.flash_whatsapp_prompt = true;
        }
    }
    
    // Determine redirect destination
    let redirectTo = '/';
    if (returnUrl && returnUrl.startsWith('/')) {
      redirectTo = returnUrl;
    } else if (isAdmin(user.email)) {
      redirectTo = '/admin';
    }
    
    return reply.redirect(redirectTo);
  } catch (err) {
    return reply.view('pages/login.ejs', { 
      title: 'Erro Login - ' + config.organization.name,
      organization: config.organization,
      error: err.message,
      sent: false 
    }, { layout: 'layout.ejs' });
  }
}

/**
 * POST /auth/vote-request - Request magic link for voting (inline auth)
 */
async function voteRequestHandler(request, reply) {
  const { email, returnUrl, proposalId } = request.body;
  
  const result = emailSchema.safeParse(email);
  
  if (!result.success) {
    return reply.send(`<p class="text-red-400">Email inválido</p>`);
  }

  try {
    await requestLogin(email, returnUrl || `/voting?proposal=${proposalId}`);
    return reply.send(`
      <div class="text-center py-4">
        <p class="text-green-400 font-medium">Verifique seu e-mail</p>
        <p class="text-sm text-gray-500 mt-1">Enviamos um link para confirmar sua participação</p>
      </div>
    `);
  } catch (err) {
    return reply.send(`<p class="text-red-400">Erro ao enviar email. Tente novamente.</p>`);
  }
}

/**
 * POST /auth/logout
 */
async function logoutHandler(request, reply) {
  await request.session.destroy();
  return reply.redirect('/');
}

/**
 * POST /api/user/update-whatsapp
 */
async function updateWhatsappHandler(request, reply) {
    const { whatsapp } = request.body;
    if (!request.session.user) return reply.status(401).send();
    
    // Clean and validate
    const cleanWa = whatsapp.replace(/\D/g, '');
    if (cleanWa.length < 10) return reply.status(400).send('Número inválido');

    await prisma.user.update({
        where: { id: request.session.user.id },
        data: { whatsapp: cleanWa }
    });

    // Update session
    request.session.user.whatsapp = cleanWa;
    
    return reply.send(`<div class="text-green-400 font-bold">✅ WhatsApp salvo!</div>`);
}

/**
 * POST /api/user/dismiss-whatsapp
 */
async function dismissWhatsappHandler(request, reply) {
    if (!request.session.user) return reply.status(401).send();

    const user = await prisma.user.findUnique({ where: { id: request.session.user.id } });
    let metadata = {};
    try { metadata = JSON.parse(user.metadata || "{}"); } catch (e) {}

    metadata.whatsapp_prompt_dismissed = true;

    await prisma.user.update({
        where: { id: user.id },
        data: { metadata: JSON.stringify(metadata) }
    });

    return reply.send('OK');
}

export function registerAuthRoutes(app) {
  app.get('/login', loginPage);
  app.post('/auth/login', loginHandler);
  app.get('/auth/verify', verifyHandler);
  app.get('/auth/logout', logoutHandler);
  app.post('/auth/logout', logoutHandler);
  app.post('/auth/vote-request', voteRequestHandler);
  
  app.post('/api/user/update-whatsapp', updateWhatsappHandler);
  app.post('/api/user/dismiss-whatsapp', dismissWhatsappHandler);
}
