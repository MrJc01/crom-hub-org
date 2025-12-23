import { randomBytes } from 'crypto';
import { prisma } from '../db/client.js';
import { isAdmin } from '../config/loader.js';

/**
 * Generate a unique @handle from email
 * Format: @prefix_randomhex (e.g., @dev_a1b2c3)
 */
function generateHandle(email) {
  const prefix = email.split('@')[0].slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, '');
  const suffix = randomBytes(3).toString('hex');
  return `@${prefix}_${suffix}`;
}

/**
 * Find user by email or create a new one with generated @handle
 * @param {string} email - User email
 * @returns {Promise<User>} - User record
 */
export async function findOrCreateUser(email, whatsapp = null) {
  if (!email) {
    throw new Error('Email é obrigatório');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const cleanWhatsapp = whatsapp ? whatsapp.replace(/\D/g, '') : null;

  // Try to find existing user
  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (user) {
    // Update role if user became admin (added to ADMIN_EMAILS)
    // Also update whatsapp if provided and not present
    let updateData = {};
    if (isAdmin(normalizedEmail) && user.role !== 'admin') {
        updateData.role = 'admin';
    }
    if (cleanWhatsapp && !user.whatsapp) {
        updateData.whatsapp = cleanWhatsapp;
    }

    if (Object.keys(updateData).length > 0) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    }
    return user;
  }

  // Create new user with unique handle
  let handle = generateHandle(normalizedEmail);
  
  // Ensure handle is unique (retry if collision)
  let attempts = 0;
  while (attempts < 5) {
    const existing = await prisma.user.findUnique({ where: { handle } });
    if (!existing) break;
    handle = generateHandle(normalizedEmail);
    attempts++;
  }

  const role = isAdmin(normalizedEmail) ? 'admin' : 'user';

  user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      handle,
      role,
      whatsapp: cleanWhatsapp,
    },
  });

  console.log(`✅ Novo usuário criado: ${handle} (${role})`);
  return user;
}

/**
 * Find user by handle
 */
export async function findUserByHandle(handle) {
  return prisma.user.findUnique({
    where: { handle },
  });
}

/**
 * Find user by ID
 */
export async function findUserById(id) {
  return prisma.user.findUnique({
    where: { id },
  });
}

/**
 * Ban a user
 */
export async function banUser(handle, reason) {
  return prisma.user.update({
    where: { handle },
    data: {
      banned: true,
      bannedAt: new Date(),
      bannedReason: reason,
    },
  });
}

/**
 * Unban a user
 */
export async function unbanUser(handle) {
  return prisma.user.update({
    where: { handle },
    data: {
      banned: false,
      bannedAt: null,
      bannedReason: null,
    },
  });
}

export default {
  findOrCreateUser,
  findUserByHandle,
  findUserById,
  banUser,
  unbanUser,
};
