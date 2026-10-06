const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const rootDir = path.join(__dirname, '..');
const runtimeDir = path.join(rootDir, 'desktop-runtime');
const templateDbPath = path.join(runtimeDir, 'template.db');

async function copyRecursive(src, dest) {
  const stats = await fs.promises.stat(src);
  if (stats.isDirectory()) {
    await fs.promises.mkdir(dest, { recursive: true });
    const entries = await fs.promises.readdir(src);
    for (const entry of entries) {
      if (entry.startsWith('.env') || /\.db(?:$|[-.])/i.test(entry)) {
        continue;
      }
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    const filename = path.basename(src);
    if (filename.startsWith('.env') || /\.db(?:$|[-.])/i.test(filename)) {
      return;
    }
    await fs.promises.copyFile(src, dest);
  }
}

async function prepare() {
  console.log('Generating Prisma Client...');
  execSync('npx prisma generate', { stdio: 'inherit', cwd: rootDir });

  console.log('Building Next.js standalone...');
  execSync('npx next build', { 
    stdio: 'inherit', 
    cwd: rootDir 
  });

  console.log('Staging desktop-runtime...');
  if (fs.existsSync(runtimeDir)) {
    await fs.promises.rm(runtimeDir, { recursive: true, force: true });
  }
  
  await copyRecursive(path.join(rootDir, '.next', 'standalone'), runtimeDir);
  await copyRecursive(path.join(rootDir, '.next', 'static'), path.join(runtimeDir, '.next', 'static'));
  await fs.promises.copyFile(path.join(__dirname, 'server-parent.cjs'), path.join(runtimeDir, 'server-parent.cjs'));
  
  if (fs.existsSync(path.join(rootDir, 'public'))) {
    await copyRecursive(path.join(rootDir, 'public'), path.join(runtimeDir, 'public'));
  }

  console.log('Creating empty template db...');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syukatsu-db-'));
  const tempDbPath = path.join(tempDir, 'temp.db');
  
  try {
    fs.closeSync(fs.openSync(tempDbPath, 'wx', 0o600));
    execSync('npx prisma db push --skip-generate', {
      stdio: 'inherit',
      cwd: rootDir,
      env: {
        ...process.env,
        DATABASE_URL: `file:${tempDbPath}`
      }
    });
    
    await fs.promises.copyFile(tempDbPath, templateDbPath);
    console.log('Template db created at', templateDbPath);
  } finally {
    if (fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }

  console.log('Desktop prepare complete.');
}

prepare().catch((err) => {
  console.error(err);
  process.exit(1);
});
