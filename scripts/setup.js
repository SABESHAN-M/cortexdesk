const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');

console.log('\n🚀 Starting Cortexdesk project setup...\n');

// 1. Check Node.js version
const nodeVersion = process.versions.node;
const majorVersion = parseInt(nodeVersion.split('.')[0], 10);
if (majorVersion < 20) {
  console.warn(`⚠️  Warning: Node.js version is ${nodeVersion}. Node 20 or newer is recommended.`);
} else {
  console.log(`✅ Node.js version ${nodeVersion} detected.`);
}

// Helper to copy example env file if destination doesn't exist
function ensureEnvFile(srcRelative, destRelative) {
  const src = path.join(ROOT_DIR, srcRelative);
  const dest = path.join(ROOT_DIR, destRelative);

  if (!fs.existsSync(dest)) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`📄 Created ${destRelative} from ${srcRelative}`);
    } else {
      console.warn(`⚠️  Template ${srcRelative} not found.`);
    }
  } else {
    console.log(`✅ ${destRelative} already exists.`);
  }
}

// 2. Ensure environment files exist
console.log('\n--- Checking Environment Files ---');
ensureEnvFile('.env.example', '.env');
ensureEnvFile('frontend/.env.example', 'frontend/.env.local');
ensureEnvFile('backend/.env.example', 'backend/.env');

// 3. Install frontend dependencies
console.log('\n--- Installing Frontend Dependencies ---');
try {
  console.log('📦 Running npm install in frontend directory...');
  execSync('npm install', { cwd: FRONTEND_DIR, stdio: 'inherit' });
  console.log('✅ Frontend dependencies installed successfully.');
} catch (err) {
  console.error('❌ Failed to install frontend dependencies:', err.message);
}

// 4. Check / install backend dependencies
console.log('\n--- Checking Python Backend Environment ---');
let hasUv = false;
try {
  execSync('uv --version', { stdio: 'ignore' });
  hasUv = true;
} catch {
  hasUv = false;
}

if (hasUv) {
  console.log('✅ `uv` package manager detected.');
  try {
    console.log('🐍 Syncing Python environment with `uv sync`...');
    execSync('uv sync', { cwd: BACKEND_DIR, stdio: 'inherit' });
    console.log('✅ Backend environment synced successfully.');
  } catch (err) {
    console.warn('⚠️  `uv sync` encountered an issue. You can manually run: cd backend && uv sync');
  }
} else {
  console.log('ℹ️  `uv` is not installed on this system.');
  console.log('👉 We recommend installing uv (fastest Python manager):');
  console.log('   Windows: powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"');
  console.log('   macOS/Linux: curl -LsSf https://astral.sh/uv/install.sh | sh');
  console.log('👉 Alternatively, use standard python:');
  console.log('   cd backend');
  console.log('   python -m venv .venv');
  console.log('   pip install -r ../requirements.txt');
}

console.log('\n=============================================');
console.log('🎉 Setup finished!');
console.log('To start development, run:');
console.log('   npm run dev');
console.log('=============================================\n');
