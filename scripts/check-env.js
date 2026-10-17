const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const frontendEnv = path.join(ROOT_DIR, 'frontend', '.env.local');

console.log('🔍 Checking Cortexdesk environment configuration...\n');

let issuesFound = 0;

if (!fs.existsSync(frontendEnv)) {
  console.warn('⚠️  frontend/.env.local is missing! Run `npm run setup` to create it from template.');
  issuesFound++;
} else {
  const content = fs.readFileSync(frontendEnv, 'utf8');
  if (content.includes('YOUR_PROJECT_REF') || content.includes('YOUR_PUBLISHABLE_OR_ANON_KEY')) {
    console.warn('⚠️  frontend/.env.local contains placeholder Supabase values. Please update them with your real project keys.');
    issuesFound++;
  } else {
    console.log('✅ frontend/.env.local is present and configured.');
  }
}

if (issuesFound === 0) {
  console.log('\n✨ All environment checks passed!\n');
} else {
  console.log(`\n⚠️  Found ${issuesFound} item(s) to verify.\n`);
}
