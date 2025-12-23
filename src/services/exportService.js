import archiver from 'archiver';
import { createWriteStream, readFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config/loader.js';

const EXCLUDED_DIRS = ['node_modules', '.git', 'dist', 'tmp', 'backups', '.gemini', 'db.sqlite'];
const EXCLUDED_FILES = ['.env', 'ds_store', 'thumbs.db'];

/**
 * Generates a ZIP stream of the project with custom configuration
 * @param {Object} options Configuration overrides
 * @param {import('fastify').FastifyReply} reply Fastify reply object to stream to
 */
export async function generateProjectZip(options, reply) {
  const archive = archiver('zip', {
    zlib: { level: 9 } // Sets the compression level.
  });

  // Handle errors
  archive.on('error', function(err) {
    throw err;
  });

  // Set the response headers
  reply.header('Content-Type', 'application/zip');
  reply.header('Content-Disposition', `attachment; filename="${options.appName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.zip"`);

  // Pipe archive data to the response
  archive.pipe(reply.raw);

  // 1. Add Source Files
  // We'll verify files before adding to exclude secrets and binaries we don't want
  archive.glob('**/*', {
    cwd: process.cwd(),
    ignore: [
      '**/node_modules/**', 
      '**/.git/**', 
      '**/dist/**', 
      '**/tmp/**', 
      '**/backups/**',
      '**/.gemini/**',
      '**/*.sqlite',
      '**/.env'
    ],
    dot: true
  });

  // 2. Generate Custom modules.json
  // We read the current one, overlay the options, and add it to the zip
  const currentModules = JSON.parse(readFileSync(join(process.cwd(), 'modules.json'), 'utf-8'));
  
  // Apply overrides
  if (options.appName) currentModules.organization.name = options.appName;
  if (options.description) currentModules.organization.description = options.description;
  if (options.primaryColor) currentModules.organization.primary_color = options.primaryColor;
  if (options.logoUrl) currentModules.organization.logo_url = options.logoUrl;
  
  // Apply module toggles if provided in options.modules
  if (options.modules) {
    for (const [key, enabled] of Object.entries(options.modules)) {
        if (currentModules.modules[key]) {
            currentModules.modules[key].enabled = enabled === 'true'; // checkboxes send 'true' string
        }
    }
  }

  archive.append(JSON.stringify(currentModules, null, 2), { name: 'modules.json' });

  // 3. Generate .env.example
  // We create a fresh .env.example populated with the structure, but empty or default values
  // We can imply some values from the current config or the User's input
  const envContent = `
# Environment Configuration
NODE_ENV=production
PORT=3000
APP_URL=http://localhost:3000

# Database
# Supports: file:./dev.db (SQLite) or postgresql://...
DATABASE_URL="file:./dev.db"

# Security
SESSION_SECRET="${generateRandomString(32)}"
ADMIN_EMAILS="${options.adminEmail || 'admin@example.com'}"

# Integrations (Optional) - Add your keys here
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@example.com
`.trim();

  archive.append(envContent, { name: '.env.example' });
  
  // Also add it as .env for immediate use if they want
  archive.append(envContent, { name: '.env' });

  await archive.finalize();
}

function generateRandomString(length) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
    let res = '';
    for (let i = 0; i < length; i++) {
        res += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return res;
}
