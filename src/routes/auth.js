import { requestLogin, verifyToken } from '../services/authService.js';
import { config } from '../config/loader.js';
import { z } from 'zod';

const emailSchema = z.string().email('Email inválido');

/**
 * GET /login
 */
async function loginPage(request, reply) {
  if (request.session.user) {
    return reply.redirect('/admin');
  }
  return reply.view('pages/login.ejs', { 
    title: 'Login - ' + config.organization.name,
    organization: config.organization,
    error: null, 
    sent: false 
  });
}

/**
 * POST /auth/login (HTMX)
 */
async function loginHandler(request, reply) {
  const { email } = request.body;
  
  const result = emailSchema.safeParse(email);
  
  if (!result.success) {
    return reply.viewAsync('pages/login.ejs', { 
      title: 'Login - ' + config.organization.name,
      organization: config.organization,
      error: result.error.errors[0].message,
      sent: false 
    }, { layout: false });
  }

  try {
    await requestLogin(email);
    return reply.viewAsync('pages/login.ejs', { 
      title: 'Login - ' + config.organization.name,
      organization: config.organization,
      error: null,
      sent: true,
      email 
    }, { layout: false });
  } catch (err) {
    return reply.viewAsync('pages/login.ejs', { 
      title: 'Login - ' + config.organization.name,
      organization: config.organization,
      error: 'Erro ao enviar email. Tente novamente.',
      sent: false 
    }, { layout: false });
  }
}

/**
 * GET /auth/verify
 */
async function verifyHandler(request, reply) {
  const { token } = request.query;

  try {
    const user = await verifyToken(token);
    
    // Set session
    request.session.user = {
      id: user.id,
      handle: user.handle,
      email: user.email,
      role: user.role,
    };
    
    return reply.redirect('/admin');
  } catch (err) {
    return reply.view('pages/login.ejs', { 
      title: 'Erro Login - ' + config.organization.name,
      organization: config.organization,
      error: err.message,
      sent: false 
    });
  }
}

/**
 * POST /auth/logout
 */
async function logoutHandler(request, reply) {
  await request.session.destroy();
  return reply.redirect('/');
}

export function registerAuthRoutes(app) {
  app.get('/login', loginPage);
  app.post('/auth/login', loginHandler);
  app.get('/auth/verify', verifyHandler);
  app.post('/auth/logout', logoutHandler);
}
