/**
 * Update Service - Blog/Changelog Management
 */
import { prisma } from '../db/client.js';

/**
 * Get recent updates for display
 */
export async function getRecentUpdates(limit = 10) {
  return prisma.update.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      author: {
        select: { handle: true },
      },
      _count: {
        select: { comments: true }
      }
    },
  });
}

/**
 * Get single update by ID
 */
export async function getUpdateById(id) {
  return prisma.update.findUnique({
    where: { id },
    include: {
      author: {
        select: { handle: true },
      },
      comments: {
        orderBy: { createdAt: 'desc' },
        include: {
            author: { select: { handle: true } }
        }
      }
    },
  });
}

/**
 * Create a new update
 */
export async function createUpdate({ title, content, type, authorId }) {
  return prisma.update.create({
    data: {
      title,
      content,
      type: type || 'DONE',
      authorId,
    },
  });
}

/**
 * Get updates by type
 */
export async function getUpdatesByType(type, limit = 10) {
  return prisma.update.findMany({
    where: { type },
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      author: {
        select: { handle: true },
      },
      _count: {
          select: { comments: true }
      }
    },
  });
}

/**
 * Add a comment to an update
 */
export async function addUpdateComment({ updateId, userHandle, content }) {
    const user = await prisma.user.findUnique({ where: { handle: userHandle } });
    if (!user) throw new Error('User not found');

    return prisma.comment.create({
        data: {
            content,
            updateId,
            authorId: user.id
        },
        include: {
            author: { select: { handle: true } }
        }
    });
}
