#!/usr/bin/env node
/**
 * Build-time environment variable checker for Vercel deployments
 * Run this script before build to verify env vars are set
 */

const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

const optionalEnvVars = [
  'NEXT_PUBLIC_DASHBOARD_URL',
];

function checkEnvVars() {
  console.log('🔍 Checking environment variables...\n');
  
  let hasErrors = false;
  
  // Check required vars
  for (const envVar of requiredEnvVars) {
    const value = process.env[envVar];
    if (!value) {
      console.error(`❌ ${envVar}: MISSING`);
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
