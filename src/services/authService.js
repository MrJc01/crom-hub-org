import { prisma } from '../db/client.js';
import { sendEmail } from './emailService.js';
import { findOrCreateUser } from './userService.js';
import { config } from '../config/loader.js';
import crypto from 'crypto';

/**
 * Generate a magic link token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Request a login magic link
 * @param {string} email User email
 */
export async function requestLogin(email) {
  const user = await findOrCreateUser(email);
  
  // Create token
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  
  await prisma.authToken.create({
    data: {
      token,
      userId: user.id,
      type: 'login',
      expiresAt,
    },
  });

  // Send email
  const link = `${config.appUrl}/auth/verify?token=${token}`;
  
  await sendEmail({
    to: email,
    subject: 'Login Hub.org',
    text: `Seu link de login: ${link}`,
    html: `
      <h2>Login Hub.org</h2>
      <p>Clique no link abaixo para entrar no painel:</p>
      <a href="${link}" style="padding: 10px 20px; background: #6366f1; color: white; border-radius: 5px; text-decoration: none;">Entrar Agora</a>
      <p style="margin-top: 20px; font-size: 12px; color: #888;">Este link expira em 15 minutos.</p>
    `,
  });

  return true;
}

/**
 * Verify a magic link token
 * @param {string} token 
 */
export async function verifyToken(token) {
  const authToken = await prisma.authToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!authToken) {
    throw new Error('Token inválido');
  }

  if (authToken.usedAt) {
    throw new Error('Token já utilizado');
  }

  if (authToken.expiresAt < new Date()) {
    throw new Error('Token expirado');
  }

  // Mark used
  await prisma.authToken.update({
    where: { id: authToken.id },
    data: { usedAt: new Date() },
  });

  // Mark session active (optional, simplified for now)
  await prisma.user.update({
    where: { id: authToken.userId },
    data: { activeSession: true },
  });

  return authToken.user;
}
