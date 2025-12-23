import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import view from '@fastify/view';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import ejs from 'ejs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { config, isAdmin } from './config/loader.js';
import { connectDatabase, disconnectDatabase } from './db/client.js';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import { registerFinanceRoutes } from './routes/finance.js';
import { registerPageRoutes } from './routes/pages.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerCronRoutes } from './routes/cron.js';
import { registerUserRoutes } from './routes/user.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================
// Fastify Instance
// ============================================
const app = Fastify({
  logger: config.isDev ? true : {
    level: 'info',
    // Omit sensitive data in production
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  },
});

// ============================================
// Security Plugins
// ============================================
await app.register(helmet, {
  contentSecurityPolicy: false, // Disabled for CDN scripts (Tailwind, HTMX)
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  // Stricter limits for auth endpoints
  keyGenerator: (request) => request.ip,
});

// ============================================
// Plugins
// ============================================
await app.register(cors, {
  origin: config.isDev ? true : config.appUrl,
});

await app.register(fastifyMultipart, {
    attachFieldsToBody: true,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

await app.register(fastifyCookie);
await app.register(fastifySession, {
  secret: config.sessionSecret,
  cookie: {
    secure: !config.isDev,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
  },
  saveUninitialized: false,
});

// Static files
await app.register(fastifyStatic, {
  root: join(__dirname, '..', 'public'),
  prefix: '/',
});

// View engine (EJS)
await app.register(view, {
  engine: { ejs },
  root: join(__dirname, 'views'),
  // Layout removed globally to allow per-route configuration
  defaultContext: {
    organization: config.organization,
    modules: config.modules,
  },
});

import { findUserById } from './services/userService.js';
import { getUserBadges } from './utils/rewards.js';

// ...

// Inject user session into all views
app.addHook('preHandler', async (request, reply) => {
  let user = null;
  let badges = [];
  
  if (request.session?.user?.id) {
      try {
          user = await findUserById(request.session.user.id);
          if (user) {
              badges = getUserBadges(user.totalDonated);
              // Update session if needed (optional)
          }
      } catch (err) {
          // If DB fail, fallback to session data
          user = request.session.user;
      }
  }

  // Make user available in all views
  reply.locals = {
    user: user || null,
    userBadges: badges,
    isAdmin: user ? isAdmin(user.email) : false,
  };
});

// Form body parser
app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => {
  const parsed = Object.fromEntries(new URLSearchParams(body));
  done(null, parsed);
});

// ============================================
// Routes
// ============================================
registerFinanceRoutes(app);
registerAuthRoutes(app);
registerAdminRoutes(app);
registerUserRoutes(app);
registerWebhookRoutes(app);
registerCronRoutes(app);
registerPageRoutes(app);

// Error handler
app.setErrorHandler(async (error, request, reply) => {
  const statusCode = error.statusCode || 500;
  
  // Log error in dev
  if (config.isDev) {
    console.error('[Error]', error);
  }
  
  // Render error page for HTML requests
  if (request.headers.accept?.includes('text/html')) {
    return reply.status(statusCode).view('pages/error.ejs', {
      title: `Erro ${statusCode}`,
      statusCode,
      message: error.message,
    }, { layout: 'layout.ejs' });
  }
  
  // JSON response for API requests
  return reply.status(statusCode).send({
    error: error.message,
    statusCode,
  });
});

// 404 handler
app.setNotFoundHandler(async (request, reply) => {
  if (request.headers.accept?.includes('text/html')) {
    return reply.status(404).view('pages/error.ejs', {
      title: 'Página não encontrada',
      statusCode: 404,
      message: null,
    }, { layout: 'layout.ejs' });
  }
  return reply.status(404).send({ error: 'Not found' });
});

// ============================================
// Startup
// ============================================
async function start() {
  try {
    // Connect to database
    const dbConnected = await connectDatabase();
    if (!dbConnected) {
      console.error('❌ Falha ao conectar ao banco de dados. Abortando...');
      process.exit(1);
    }

    // Start server
    await app.listen({ port: config.port, host: '0.0.0.0' });
    
    console.log('');
    console.log('🚀 Hub.org está rodando!');
    console.log(`   Dashboard: http://localhost:${config.port}`);
    console.log(`   Status: http://localhost:${config.port}/status`);
    console.log(`   Ambiente: ${config.env}`);
    console.log('');
    
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// ============================================
// Graceful Shutdown
// ============================================
const signals = ['SIGINT', 'SIGTERM'];
signals.forEach(signal => {
  process.on(signal, async () => {
    console.log(`\n${signal} recebido. Encerrando...`);
    await app.close();
    await disconnectDatabase();
    process.exit(0);
  });
});

// Start the server
start();

export default app;
