import { config, isAdmin } from '../config/loader.js';

/**
 * Admin Middleware
 * Verifica se o usuário é admin baseado no email.
 * Em produção, o email viria de uma sessão autenticada.
 * Em desenvolvimento, aceita o header x-admin-email para testes.
 */
export async function adminMiddleware(request, reply) {
  // Em desenvolvimento, aceita header para facilitar testes
  // Check session first, then dev header
  const email = request.session?.user?.email || (config.isDev ? request.headers['x-admin-email'] : null);

  if (!email) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Autenticação necessária',
    });
  }

  if (!isAdmin(email)) {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Acesso restrito a administradores',
    });
  }

  // Adiciona flag de admin no request
  request.isAdmin = true;
  request.adminEmail = email;
}

/**
 * Optional Admin Check
 * Não bloqueia, apenas adiciona flag se for admin
 */
export async function optionalAdminMiddleware(request, reply) {
  const email = request.session?.user?.email || (config.isDev ? request.headers['x-admin-email'] : null);

  request.isAdmin = email ? isAdmin(email) : false;
  request.adminEmail = email || null;
}

export default adminMiddleware;
