const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const tar = require('tar');

const VERSION = 'v24.21.0';
const NODE_SHA256 = 'ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32';
const root = path.join(__dirname, '..');

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`ダウンロードに失敗しました: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function prepare() {
  const runtimeDir = path.join(root, 'desktop-runtime');
  if (!fs.existsSync(path.join(runtimeDir, 'server.js'))) {
    throw new Error('先にnpm run desktop:buildを実行してください。');
  }
  if (!fs.existsSync(path.join(runtimeDir, 'node_modules', '.prisma', 'client', 'query_engine-windows.dll.node'))) {
    throw new Error('Windows用のPrismaエンジンがありません。最新版のスキーマでdesktop:buildをやり直してください。');
  }
  // ビルドホストがMac/ARMでも、DBサーバーに必要なのはWindows x64版Sharp。
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const sharp = lock.packages['node_modules/@img/sharp-win32-x64'];
  if (!sharp?.resolved?.startsWith('https://registry.npmjs.org/@img/sharp-win32-x64/') ||
      !sharp.integrity?.startsWith('sha512-')) throw new Error('Sharpの固定依存情報を確認できません。');
  const archive = await download(sharp.resolved);
  if (`sha512-${crypto.createHash('sha512').update(archive).digest('base64')}` !== sharp.integrity) {
    throw new Error('Sharpのチェックサムが一致しません。');
  }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'job-research-sharp-'));
  try {
    const archivePath = path.join(scratch, 'sharp.tgz');
    fs.writeFileSync(archivePath, archive);
    const sharpDir = path.join(runtimeDir, 'node_modules', '@img', 'sharp-win32-x64');
    fs.mkdirSync(sharpDir, { recursive: true });
    await tar.x({ file: archivePath, cwd: sharpDir, strip: 1,
      filter: (name, entry) => name.startsWith('package/') && !name.split('/').includes('..') &&
        !name.includes('\\') && ['File', 'Directory'].includes(entry.type) });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  // バージョンとハッシュを固定し、取得したバイナリを保存前に確認する。
  const binary = await download(`https://nodejs.org/dist/${VERSION}/win-x64/node.exe`);
  if (crypto.createHash('sha256').update(binary).digest('hex') !== NODE_SHA256) {
    throw new Error('Node.jsのチェックサムが一致しません。');
  }
  const license = await download(`https://raw.githubusercontent.com/nodejs/node/${VERSION}/LICENSE`);
  const destination = path.join(runtimeDir, 'bin', 'win-x64');
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'node.exe'), binary);
  fs.writeFileSync(path.join(destination, 'LICENSE'), license);
  fs.copyFileSync(path.join(__dirname, 'server-parent.cjs'), path.join(runtimeDir, 'server-parent.cjs'));
  console.log(`Windows ARM64互換ランタイム: Node ${VERSION} x64 (SHA-256確認済み)`);
}

prepare().catch((error) => { console.error(error.message); process.exitCode = 1; });
