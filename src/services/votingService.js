/**
 * Voting Service - Proposals and Votes Management
 */
import { prisma } from '../db/client.js';
import { config } from '../config/loader.js';

/**
 * Get active proposals
 */
export async function getActiveProposals() {
  return prisma.proposal.findMany({
    where: {
      status: { in: ['active', 'voting'] },
      endsAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      author: {
        select: { handle: true },
      },
      _count: {
        select: { 
          votes: true,
          comments: true 
        },
      },
    },
  });
}

/**
 * Get all proposals (for admin/history)
 */
export async function getAllProposals(limit = 50) {
  return prisma.proposal.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      author: {
        select: { handle: true },
      },
      _count: {
        select: { votes: true, comments: true },
      },
    },
  });
}

/**
 * Get single proposal by ID
 */
export async function getProposalById(id) {
  return prisma.proposal.findUnique({
    where: { id },
    include: {
      author: {
        select: { handle: true },
      },
      votes: {
        include: {
          user: {
            select: { handle: true },
          },
        },
      },
      comments: {
        orderBy: { createdAt: 'desc' },
        include: {
            author: {
                select: { handle: true }
            }
        }
      }
    },
  });
}

/**
 * Create a new proposal
 */
export async function createProposal({ title, description, authorHandle }) {
  const settings = config.modules.voting?.settings;
  const user = await prisma.user.findUnique({ where: { handle: authorHandle } });
  
  // 1. Check Role
  if (settings?.create_proposal_role === 'admin' && user.role !== 'admin') {
      throw new Error('Apenas administradores podem criar propostas.');
  }

  // 2. Check Payment (if not admin, or if admin also subject to it? Usually admin bypasses, but let's stick to simple logic: Role check first. If allowed by role (e.g. user), then check payment)
  if (user.role !== 'admin' && settings?.pay_to_create?.enabled) {
      if ((user.totalDonated || 0) < settings.pay_to_create.amount) {
          throw new Error(`Requer doação mínima de R$ ${settings.pay_to_create.amount} para criar propostas.`);
      }
  }

  const durationDays = settings?.duration_days || 7;
  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + durationDays);

  return prisma.proposal.create({
    data: {
      title,
      description,
      authorHandle,
      status: 'active',
      endsAt,
    },
  });
}

/**
 * Cast a vote
 */
export async function castVote({ proposalId, userHandle, vote }) {
  // Check permission
  const settings = config.modules.voting?.settings;
  const user = await prisma.user.findUnique({ where: { handle: userHandle } });
  
  if (settings?.pay_to_vote?.enabled) {
      if ((user.totalDonated || 0) < settings.pay_to_vote.amount) {
          throw new Error(`Requer doação mínima de R$ ${settings.pay_to_vote.amount} para votar.`);
      }
  }

  // Check if user already voted
  const existingVote = await prisma.vote.findUnique({
    where: {
      proposalId_userHandle: { proposalId, userHandle },
    },
  });

  if (existingVote) {
    throw new Error('Você já votou nesta proposta');
  }
  
  // Create vote
  const newVote = await prisma.vote.create({
    data: {
      proposalId,
      userHandle,
      vote,
    },
  });

  // Update proposal counts
  const countField = vote === 'yes' ? 'yesCount' : vote === 'no' ? 'noCount' : 'abstainCount';
  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      [countField]: { increment: 1 },
    },
  });

  return newVote;
}

/**
 * Check if user has voted on proposal
 */
export async function hasUserVoted(proposalId, userHandle) {
  const vote = await prisma.vote.findUnique({
    where: {
      proposalId_userHandle: { proposalId, userHandle },
    },
  });
  return !!vote;
}

/**
 * Add a comment to a proposal
 */
export async function addProposalComment({ proposalId, userHandle, content }) {
    const user = await prisma.user.findUnique({ where: { handle: userHandle } });
    if (!user) throw new Error('User not found');

    // TODO: Payment check logic

    return prisma.comment.create({
        data: {
            content,
            proposalId,
            authorId: user.id
        },
        include: {
            author: { select: { handle: true } }
        }
    });
}
