import { config } from '../config/loader.js';
import { getFinancialSummary, getRecentTransactions, createDonation } from '../services/financeService.js';
import { getPublicLogs } from '../services/auditService.js';
import { checkDatabaseHealth } from '../db/client.js';
import { findOrCreateUser } from '../services/userService.js';
import { donateSchema } from '../schemas/validation.js';
import { getRecentUpdates, getUpdateById, addUpdateComment } from '../services/updateService.js';
import { getActiveProposals, castVote, addProposalComment, getProposalById } from '../services/votingService.js';
import ejs from 'ejs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewsPath = join(__dirname, '..', 'views');

/**
 * Render partial without layout (for HTMX)
 */
async function renderPartial(reply, template, data) {
  const html = await ejs.renderFile(join(viewsPath, template), data);
  reply.type('text/html').send(html);
}

/**
 * GET / - Dashboard page
 */
async function dashboardPage(request, reply) {
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

  // Unified data object for all sections
  const data = {
    currency: config.organization.currency || 'BRL',
    balance: summary.summary.balance,
    totalIn: summary.summary.total_in,
    totalOut: summary.summary.total_out,
    donationCount: summary.counts.donations,
    expenseCount: summary.counts.expenses,
    goal: summary.goal,
    transactions: mappedTransactions,
    updates: await getRecentUpdates(3),
  };

  /* Check for one-time prompt */
  const showWhatsappPopup = !!request.session.flash_whatsapp_prompt;
  if (showWhatsappPopup) request.session.flash_whatsapp_prompt = false;

  return reply.view('pages/dashboard.ejs', {
    title: config.organization.name,
    organization: config.organization,
    showWhatsappPopup: showWhatsappPopup, // Pass to view
    modules: config.modules,
    config: config, // Pass full config for sections that need it (e.g. donate/payments)
    sections_order: config.landingPage.sections_order,
    sections_data: config.landingPage.sections_data,
    data,
  }, { layout: 'layout.ejs' });
}

/**
 * GET /donate - Donation Page
 */
async function donatePage(request, reply) {
    return reply.view('pages/donate.ejs', {
        title: 'Faça uma doação',
        organization: config.organization,
        modules: config.modules,
        config: config // Pass full config for payments
    }, { layout: 'layout.ejs' });
}

/**
 * POST /donate - Handle donation (HTMX or redirect to Stripe)
 */
/**
 * POST /donate - Handle donation (HTMX or redirect to Stripe)
 */
async function donateHandler(request, reply) {
  const body = request.body;
  
  const amount = parseFloat(body.amount?.value || body.amount);
  const message = body.message?.value || body.message;
  const email = body.email?.value || body.email;
  const method = body.method?.value || body.method || 'auto';
  const proofFile = body.proof;

  const result = donateSchema.safeParse({
    amount: amount,
    message: message || undefined,
    email: email || undefined,
  });

  if (!result.success) {
    return renderPartial(reply, 'partials/donation-form.ejs', {
      error: result.error.errors[0]?.message || 'Dados inválidos',
      config: config // ensure config is passed back on error
    });
  }

  try {
    let donor = null;
    let donorHandle = null;

    if (email) {
      donor = await findOrCreateUser(email);
      donorHandle = donor.handle;
    }

    // 1. Manual Payment (Pix + Proof)
    if (method === 'manual') {
        let proofUrl = null;
        
        if (proofFile && proofFile.filename) {
            const { pipeline } = await import('stream/promises');
            const { createWriteStream } = await import('fs');
            const { mkdir } = await import('fs/promises');
            const { randomUUID } = await import('crypto');
            
            const uploadDir = join(__dirname, '..', '..', 'public', 'uploads');
            await mkdir(uploadDir, { recursive: true });
            
            const ext = proofFile.filename.split('.').pop();
            const filename = `proof-${randomUUID()}.${ext}`;
            const filepath = join(uploadDir, filename);
            
            await pipeline(proofFile.file, createWriteStream(filepath));
            proofUrl = `/uploads/${filename}`;
        }

        const transaction = await createDonation({
             amount,
             message,
             donorId: donor?.id,
             donorHandle,
             externalId: 'MANUAL',
             proofUrl: proofUrl,
             status: 'pending' 
        });

        return renderPartial(reply, 'partials/donation-success.ejs', {
            amount: transaction.amount,
            handle: donorHandle,
            manual: true
        });
    }

    // 2. Stripe Checkout
    const { isStripeEnabled, createCheckoutSession } = await import('../services/stripeService.js');
    if (method === 'stripe' && isStripeEnabled()) {
      const session = await createCheckoutSession({
        amount,
        handle: donorHandle,
        message,
        email,
        successUrl: `${config.appUrl}/donate/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${config.appUrl}/#donate`,
      });

      return reply
        .header('HX-Redirect', session.url)
        .send({ redirect: session.url });
    }

    // 3. Other Providers (Mock/Placeholder)
    // For now, we simulate a pending transaction for Mercado Pago, AbacatePay, etc.
    const transaction = await createDonation({
        amount,
        message,
        donorId: donor?.id,
        donorHandle,
        externalId: `${method.toUpperCase()}_MOCK`,
        status: 'pending' // Pending redirect/webhook
    });

    // Provide a detailed success message for these mock methods
    const providerNames = {
        mercadopago: 'Mercado Pago',
        abacatepay: 'AbacatePay',
        asaas: 'Asaas',
        paypal: 'PayPal'
    };
    const prettyName = providerNames[method] || method;

    return reply.send(`
        <div class="text-center p-8 bg-green-500/10 rounded-xl border border-green-500/30">
            <div class="text-4xl mb-4">⏳</div>
            <h3 class="text-2xl font-bold text-white mb-2">Redirecionando...</h3>
            <p class="text-gray-300">Iniciando pagamento via <strong>${prettyName}</strong>.</p>
            <p class="text-sm text-gray-500 mt-4">(Simulação: Em produção, isso redirecionaria para o gateway)</p>
            <button onclick="window.location.reload()" class="mt-6 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition text-sm">
                Voltar
            </button>
        </div>
    `);

  } catch (err) {
    console.error(err);
    return renderPartial(reply, 'partials/donation-form.ejs', {
      error: err.message,
      config: config
    });
  }
}

/**
 * GET /transparency - Full transactions page
 */
async function transparencyPage(request, reply) {
  const summary = await getFinancialSummary();
  const transactions = await getRecentTransactions({ limit: 50 });
  
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

  return reply.view('pages/transparency.ejs', {
    title: 'Transparência',
    organization: config.organization,
    currency: config.organization.currency || 'BRL',
    balance: summary.summary.balance,
    totalIn: summary.summary.total_in,
    totalOut: summary.summary.total_out,
    transactions: mappedTransactions,
  }, { layout: 'layout.ejs' });
}

/**
 * GET /status - Audit log page
 */
async function auditLogPage(request, reply) {
  const dbHealth = await checkDatabaseHealth();
  const { logs } = await getPublicLogs({ limit: 50 });
  
  return reply.view('pages/audit-log.ejs', {
    title: 'Audit Log',
    organization: config.organization,
    status: {
      database: dbHealth,
      version: config.version,
      environment: config.env,
    },
    logs,
  }, { layout: 'layout.ejs' });
}

/**
 * GET /updates - Updates/changelog page
 */
async function updatesPage(request, reply) {
  const updates = await getRecentUpdates(20);
  
  return reply.view('pages/updates.ejs', {
    title: 'Atualizações',
    organization: config.organization,
    updates,
  }, { layout: 'layout.ejs' });
}

/**
 * GET /updates/:id - Single Update Page
 */
async function singleUpdatePage(request, reply) {
    const { id } = request.params;
    const update = await getUpdateById(parseInt(id));
    
    if (!update) return reply.status(404).send('Not Found');

    return reply.view('pages/single-update.ejs', {
        title: update.title,
        organization: config.organization,
        update,
        user: request.session?.user
    }, { layout: 'layout.ejs' });
}

/**
 * POST /updates/:id/comment - Comment on update
 */
async function commentUpdateHandler(request, reply) {
    const { id } = request.params;
    const { content } = request.body;
    const user = request.session?.user;
    
    if (!user) return reply.status(401).send('Unauthorized');
    if (!content) return reply.status(400).send('Content required');

    // Pay to Comment Check
    const blogConfig = config.modules.blog;
    if (blogConfig?.pay_to_comment?.enabled) {
        // Refresh user data to get latest totalDonated
        const freshUser = await findOrCreateUser(user.email);
        const minAmount = blogConfig.pay_to_comment.amount || 0;
        
        if ((freshUser.totalDonated || 0) < minAmount) {
             return reply.status(403).send(`
                <div class="p-4 bg-red-500/20 text-red-400 rounded-xl border border-red-500/50">
                    🔒 Você precisa ter doado no mínimo <b>R$ ${minAmount}</b> para comentar aqui.
                    <a href="/donate" class="underline hover:text-white">Fazer doação</a>
                </div>
             `);
        }
    }

    try {
        await addUpdateComment({ updateId: parseInt(id), userHandle: user.handle, content });
        // Return updated comments list (partial)
        const update = await getUpdateById(parseInt(id));
        return renderPartial(reply, 'partials/comments-list.ejs', { comments: update.comments });
    } catch (err) {
        return reply.status(500).send(err.message);
    }
}

/**
 * GET /voting - Voting page
 */
async function votingPage(request, reply) {
  const proposals = await getActiveProposals();
  
  return reply.view('pages/voting.ejs', {
    title: 'Votação e Governança',
    organization: config.organization,
    proposals,
    config: config.modules.voting.settings,
  }, { layout: 'layout.ejs' });
}

/**
 * POST /voting/:id/vote - Cast a vote
 */
async function voteHandler(request, reply) {
  const { id } = request.params;
  const { vote } = request.body;
  const user = request.session?.user;

  if (!user) {
    return reply.status(401).send({ error: 'Você precisa estar logado para votar.' });
  }

  try {
    const result = await castVote({
        proposalId: parseInt(id),
        userHandle: user.handle,
        vote: vote
    });
    
    // Return button state update via HTMX (or simple success)
    if (request.headers['hx-request']) {
        return reply.send(`<div class="text-green-400 font-bold">✅ Voto registrado: ${vote.toUpperCase()}</div>`);
    }

    return reply.redirect('/voting');
  } catch (err) {
    return reply.status(400).send({ error: err.message });
  }
}

/**
 * POST /voting/:id/comment - Comment on proposal
 */
async function commentProposalHandler(request, reply) {
    const { id } = request.params;
    const { content } = request.body;
    const user = request.session?.user;

    if (!user) return reply.status(401).send('Unauthorized');
    
    // Pay to Comment Check
    const votingConfig = config.modules.voting?.settings;
    if (votingConfig?.pay_to_comment?.enabled) {
        const freshUser = await findOrCreateUser(user.email);
        const minAmount = votingConfig.pay_to_comment.amount || 0;
        
        if ((freshUser.totalDonated || 0) < minAmount) {
             return reply.status(403).send(`
                <div class="p-4 bg-red-500/20 text-red-400 rounded-xl border border-red-500/50">
                    🔒 Você precisa ter doado no mínimo <b>R$ ${minAmount}</b> para comentar em propostas.
                    <a href="/donate" class="underline hover:text-white">Fazer doação</a>
                </div>
             `);
        }
    }
    
    try {
        await addProposalComment({ proposalId: parseInt(id), userHandle: user.handle, content });
        // Fetch fresh proposal data for the comments list
        const proposal = await getProposalById(parseInt(id));
        return renderPartial(reply, 'partials/comments-list.ejs', { comments: proposal.comments });
    } catch (err) {
        return reply.status(400).send(err.message);
    }
}

/**
 * GET /voting/:id/comments - Get comments section for proposal (HTMX)
 */
async function getProposalComments(request, reply) {
    const { id } = request.params;
    const proposal = await getProposalById(parseInt(id));
    
    if (!proposal) return reply.status(404).send('Not Found');

    return renderPartial(reply, 'partials/comments-section.ejs', {
        comments: proposal.comments,
        postUrl: `/voting/${proposal.id}/comment`,
        user: request.session?.user
    });
}

/**
 * Register page routes
 */
export function registerPageRoutes(app) {
  app.get('/', dashboardPage);
  app.get('/donate', donatePage);
  app.post('/donate', donateHandler);
  app.get('/transparency', transparencyPage);
  app.get('/status', auditLogPage);
  
  app.get('/updates', updatesPage);
  app.get('/updates/:id', singleUpdatePage);
  app.post('/updates/:id/comment', commentUpdateHandler);

  app.get('/voting', votingPage);
  app.get('/voting/:id/comments', getProposalComments);
  app.post('/voting/:id/vote', voteHandler);
  app.post('/voting/:id/comment', commentProposalHandler);
}

