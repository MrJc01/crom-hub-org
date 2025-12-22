#!/usr/bin/env node
/**
 * Integrity Check Script
 * Verifies that essential files persist correctly
 */
import { existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

const checks = [
  { path: 'modules.json', description: 'Configuration file' },
  { path: 'prisma/schema.prisma', description: 'Database schema' },
  { path: 'prisma/data', description: 'Data directory', isDir: true },
  { path: '.env', description: 'Environment variables' },
];

console.log('🔍 Hub.org Integrity Check\n');

let passed = 0;
let failed = 0;

for (const check of checks) {
  const fullPath = join(ROOT_DIR, check.path);
  const exists = existsSync(fullPath);
  
  if (exists) {
    const stats = statSync(fullPath);
    const isCorrectType = check.isDir ? stats.isDirectory() : stats.isFile();
    
    if (isCorrectType) {
      console.log(`✅ ${check.description}: ${check.path}`);
      passed++;
    } else {
      console.log(`❌ ${check.description}: ${check.path} (wrong type)`);
      failed++;
    }
  } else {
    console.log(`❌ ${check.description}: ${check.path} (not found)`);
    failed++;
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log('\n⚠️  Some checks failed. Run the following to fix:');
  console.log('   1. Copy .env.example to .env');
  console.log('   2. Run: npx prisma db push');
  process.exit(1);
}

console.log('\n✅ All integrity checks passed!');
process.exit(0);
