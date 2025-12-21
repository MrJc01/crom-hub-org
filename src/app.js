import Fastify from 'fastify';
import cors from '@fastify/cors';
import view from '@fastify/view';
import fastifyStatic from '@fastify/static';
import ejs from 'ejs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { config } from './config/loader.js';
import { connectDatabase, disconnectDatabase } from './db/client.js';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import { registerFinanceRoutes } from './routes/finance.js';
import { registerPageRoutes } from './routes/pages.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================
// Fastify Instance
// ============================================
const app = Fastify({
  logger: config.isDev,
});

// ============================================
// Plugins
// ============================================
await app.register(cors, {
  origin: config.isDev ? true : config.appUrl,
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
  layout: 'layout.ejs',
  defaultContext: {
    organization: config.organization,
  },
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
registerPageRoutes(app);

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
