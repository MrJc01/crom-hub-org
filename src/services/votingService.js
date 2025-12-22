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
        select: { votes: true },
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
    },
  });
}

/**
 * Create a new proposal
 */
export async function createProposal({ title, description, authorHandle }) {
  const durationDays = config.modules.voting?.settings?.duration_days || 7;
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
