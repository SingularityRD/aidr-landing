#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Build-time environment variable checker for Vercel deployments
 * Run this script before build to verify env vars are set
 */

const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).replace(/\\n/g, '\n');
  }
  return trimmed;
}

function loadEnvFile(fileName) {
  const filePath = join(process.cwd(), fileName);
  if (!existsSync(filePath)) return;

  const contents = readFileSync(filePath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = unquoteEnvValue(trimmed.slice(equalsIndex + 1));
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.production');
loadEnvFile('.env.local');

const requiredEnvVars = [
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'AIDR_AGENT_TOKEN_SECRET',
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'POLAR_ACCESS_TOKEN',
  'POLAR_PRICE_MONTHLY_ID',
  'POLAR_WEBHOOK_SECRET',
];

const optionalEnvVars = [
  'NEXT_PUBLIC_DASHBOARD_URL',
  'AIDR_CRON_SECRET',
  'AIDR_POLICY_SIGNING_SECRET',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_DSN',
];

const validators = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: (value) => /^pk_(test|live)_[A-Za-z0-9_-]{24,}$/.test(value),
  CLERK_SECRET_KEY: (value) => /^sk_(test|live)_[A-Za-z0-9_-]{24,}$/.test(value),
  AIDR_AGENT_TOKEN_SECRET: (value) => value.length >= 32,
  POLAR_WEBHOOK_SECRET: (value) => value.length >= 16,
};

const validationMessages = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'must be a full Clerk key starting with pk_test_ or pk_live_',
  CLERK_SECRET_KEY: 'must be a full Clerk key starting with sk_test_ or sk_live_',
  AIDR_AGENT_TOKEN_SECRET: 'must be at least 32 characters',
  POLAR_WEBHOOK_SECRET: 'must be at least 16 characters',
};

function checkEnvVars() {
  console.log('🔍 Checking environment variables...\n');
  
  let hasErrors = false;
  
  // Check required vars
  for (const envVar of requiredEnvVars) {
    const value = process.env[envVar];
    if (!value) {
      console.error(`❌ ${envVar}: MISSING`);
      hasErrors = true;
    } else if (validators[envVar] && !validators[envVar](value)) {
      console.error(`❌ ${envVar}: INVALID (${validationMessages[envVar]})`);
      hasErrors = true;
    } else {
      // Mask the value for security
      const masked = value.length > 20 
        ? `${value.slice(0, 10)}...${value.slice(-5)}`
        : '***';
      console.log(`✅ ${envVar}: ${masked} (${value.length} chars)`);
    }
  }
  
  // Check optional vars
  console.log('\n📋 Optional variables:');
  for (const envVar of optionalEnvVars) {
    const value = process.env[envVar];
    if (!value) {
      console.log(`⚠️  ${envVar}: not set (optional)`);
    } else {
      console.log(`✅ ${envVar}: set`);
    }
  }
  
  console.log('\n---');
  
  if (hasErrors) {
    console.error('\n❌ CRITICAL: Required environment variables are missing!');
    console.error('\nFor Vercel deployments:');
    console.error('1. Go to https://vercel.com/dashboard');
    console.error('2. Select your project → Settings → Environment Variables');
    console.error('3. Add the missing variables for Production environment');
    console.error('4. Redeploy with "Build Cache" disabled');
    console.error('\nFor local development:');
    console.error('Create a .env.local file with these variables.\n');
    process.exit(1);
  } else {
    console.log('\n✅ All required environment variables are set!\n');
    process.exit(0);
  }
}

checkEnvVars();
