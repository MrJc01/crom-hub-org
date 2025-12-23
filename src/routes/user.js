import { config } from '../config/loader.js';
import { prisma } from '../db/client.js';
import { generateProjectZip } from '../services/exportService.js';
import { getFinancialSummary, getRecentTransactions } from '../services/financeService.js';
import { getRecentUpdates } from '../services/updateService.js';

/**
 * Middleware to ensure user is logged in
 */
async function requireAuth(request, reply) {
  if (!request.session.user) {
    return reply.redirect('/login');
  }
}

/**
 * GET /me - User Profile Dashboard
 */
async function userProfile(request, reply) {
  const user = await prisma.user.findUnique({
    where: { id: request.session.user.id },
    include: {
      _count: {
        select: {
          transactions: true,
          votes: true
        }
      }
    }
  });

  // Calculate total donated
  const donationStats = await prisma.transaction.aggregate({
    where: { 
      type: 'IN',
      donorId: user.id
    },
    _sum: {
      amount: true
    }
  });

  return reply.view('pages/user/profile.ejs', {
    title: 'Meu Perfil',
    organization: config.organization,
    currentPage: 'profile',
    breadcrumb: 'Visão Geral',
    user,
    stats: {
      totalDonated: donationStats._sum.amount || 0,
      donationCount: user._count.transactions,
      voteCount: user._count.votes
    },
    modules: config.modules
  }, { layout: 'user-layout.ejs' });
}

/**
 * GET /me/activity - User Activity Log
 */
async function userActivity(request, reply) {
  const votes = await prisma.vote.findMany({
    where: { userHandle: request.session.user.handle },
    include: {
      proposal: {
        select: { title: true }
      }
    },
    orderBy: { votedAt: 'desc' },
    take: 20
  });

  const donations = await prisma.transaction.findMany({
    where: { 
      donorId: request.session.user.id,
      type: 'IN'
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  // Combine and sort
  const activity = [
    ...votes.map(v => ({ type: 'vote', date: v.votedAt, data: v })),
    ...donations.map(d => ({ type: 'donation', date: d.createdAt, data: d }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return reply.view('pages/user/activity.ejs', {
    title: 'Minha Atividade',
    organization: config.organization,
    currentPage: 'activity',
    breadcrumb: 'Atividade',
    activity,
    modules: config.modules
  }, { layout: 'user-layout.ejs' });
}

/**
 * GET /me/settings - User Settings
 */
async function userSettings(request, reply) {
  const user = await prisma.user.findUnique({
    where: { id: request.session.user.id }
  });

  return reply.view('pages/user/settings.ejs', {
    title: 'Configurações',
    organization: config.organization,
    currentPage: 'settings',
    breadcrumb: 'Configurações',
    user,
    modules: config.modules
  }, { layout: 'user-layout.ejs' });
}

/**
 * POST /me/settings/update - Update user profile
 */
async function updateSettings(request, reply) {
  const { handle, newsletter } = request.body;
  const userId = request.session.user.id;

  try {
    // Basic validation
    if (handle && handle.length < 3) {
      throw new Error('Handle muito curto');
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        handle: handle || undefined,
        // newsletter: newsletter === 'on' // Schema update needed if we want newsletter preference
      }
    });

    // Update session
    request.session.user = {
      ...request.session.user,
      handle: updated.handle
    };

    return reply.redirect('/me/settings?success=true');
  } catch (err) {
    return reply.view('pages/user/settings.ejs', {
      title: 'Configurações',
      organization: config.organization,
      currentPage: 'settings',
      breadcrumb: 'Configurações',
      user: request.session.user,
      error: err.message,
      modules: config.modules
    }, { layout: 'user-layout.ejs' });
  }
}

/**
 * GET /me/export - User Export Page
 */
async function userExportPage(request, reply) {
  if (!config.modules.export?.settings?.allow_user_export) {
    return reply.status(403).send({ error: 'Funcionalidade desabilitada para usuários.' });
  }

  return reply.view('pages/admin/export.ejs', {
    title: 'Exportar Projeto',
    organization: config.organization,
    currentPage: 'export',
    breadcrumb: 'Exportar',
    adminEmail: request.session.user.email,
    config: config,
    postUrl: '/me/export',
    previewUrl: '/me/export/preview',
    user: request.session.user,
    modules: config.modules
  }, { layout: 'user-layout.ejs' });
}

/**
 * POST /me/export - Generate Zip
 */
async function userExportHandler(request, reply) {
    if (!config.modules.export?.settings?.allow_user_export) {
        return reply.status(403).send({ error: 'Forbidden' });
    }

    const { appName, description, primaryColor, logoUrl, adminEmail, modules } = request.body;

    try {
        await generateProjectZip({
            appName,
            description,
            primaryColor,
            logoUrl,
            adminEmail: adminEmail || request.session.user.email,
            modules
        }, reply);
        
        // Log? Maybe not necessary for user or use simple log
    } catch (err) {
        request.log.error(err);
        return reply.status(500).send({ error: 'Failed to generate export' });
    }
}

/**
 * POST /me/export/preview - Preview
 */
async function userPreviewExport(request, reply) {
    if (!config.modules.export?.settings?.allow_user_export) {
        return reply.status(403).send({ error: 'Forbidden' });
    }

    const { org_name, org_desc, org_color, org_logo } = request.body;
    
    // Mock config for preview
    const previewConfig = JSON.parse(JSON.stringify(config));
    previewConfig.organization.name = org_name;
    previewConfig.organization.description = org_desc;
    previewConfig.organization.primary_color = org_color;
    previewConfig.organization.logo_url = org_logo;
    
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
        isPreview: true
    }, { layout: 'layout.ejs' });
}

/**
 * Register user routes
 */
export function registerUserRoutes(app) {
  app.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/me')) {
      return requireAuth(request, reply);
    }
  });

  app.get('/me', userProfile);
  app.get('/me/activity', userActivity);
  app.get('/me/settings', userSettings);
  app.post('/me/settings/update', updateSettings);
  
  app.get('/me/export', userExportPage);
  app.post('/me/export', userExportHandler);
  app.post('/me/export/preview', userPreviewExport);
}
