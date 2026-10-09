const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const readline = require('node:readline');
const { fork, spawnSync } = require('node:child_process');

function nativeStorage(host) {
  const transform = (mode, value) => {
    const result = spawnSync(host, [mode], { input: value, encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error('Windowsの認証暗号化機能を利用できません。');
    return result.stdout;
  };
  return {
    isEncryptionAvailable: () => {
      if (process.platform !== 'win32') return false;
      try { transform('--protect', 'availability-check'); return true; } catch { return false; }
    },
    encryptString: value => Buffer.from(transform('--protect', value), 'base64'),
    decryptString: value => transform('--unprotect', value.toString('base64')),
  };
}

function methods(service, profiles) {
  return Object.freeze({
    getSession: () => service.getSession(), signIn: () => service.signIn(),
    cancelSignIn: () => service.cancelSignIn(), signOut: () => service.signOut(),
    listModels: () => service.listModels(), generate: argument => service.generate(argument),
    openUsage: () => service.openUsage(), getCareerProfile: () => profiles.getProfile(),
    saveCareerProfile: argument => profiles.saveProfile(argument),
  });
}

async function main() {
  const { ChatGPTService } = require('./chatgpt.cjs');
  const { CareerProfileStore } = require('./career-profile.cjs');
  const { serverEnvironment } = require('./server-process.cjs');
  const data = process.env.JOB_WEBVIEW_DATA;
  const runtime = path.resolve(__dirname, '../runtime');
  if (!data || !path.isAbsolute(data) || !process.env.DESKTOP_AUTH_TOKEN || !process.env.JOB_WEBVIEW_HOST) throw Error('Invalid host configuration');
  fs.mkdirSync(data, { recursive: true, mode: 0o700 });
  const db = path.join(data, 'syukatsu.db');
  if (!fs.existsSync(db)) fs.copyFileSync(path.join(runtime, 'template.db'), db, fs.constants.COPYFILE_EXCL);
  const send = value => process.stdout.write(JSON.stringify(value) + '\n');
  const service = new ChatGPTService({ userDataPath: data, safeStorage: nativeStorage(process.env.JOB_WEBVIEW_HOST), openExternal: async url => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw Error('Invalid external URL');
    send({ type: 'openExternal', url: parsed.href });
  } });
  const dispatch = methods(service, new CareerProfileStore(data));
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = fork(path.join(runtime, 'server-parent.cjs'), [], { execPath: process.execPath, execArgv: [], silent: true, windowsHide: true, cwd: runtime,
    env: { ...serverEnvironment(process.env), NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port), DATABASE_URL: `file:${db}`, DESKTOP_RUNTIME: '1', DESKTOP_AUTH_TOKEN: process.env.DESKTOP_AUTH_TOKEN } });
  // Never mix server logs into the JSON RPC stdout stream or forward token-bearing errors.
  child.stdout.resume(); child.stderr.resume();
  let closing = false;
  const shutdown = () => { if (closing) return; closing = true; service.shutdown(); child.kill(); process.exit(0); };
  process.stdin.on('end', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  child.on('error', () => { send({ type: 'fatal', error: '内部サーバーを起動できませんでした。' }); shutdown(); });
  child.on('exit', () => { if (!closing) { send({ type: 'fatal', error: '内部サーバーが停止しました。' }); shutdown(); } });
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on('line', async line => {
    let request;
    try {
      if (line.length > 1024 * 1024) throw Error('入力が大きすぎます。');
      request = JSON.parse(line);
      if (!Number.isSafeInteger(request.id) || !Object.hasOwn(dispatch, request.method)) throw Error('利用できない操作です。');
      const result = await dispatch[request.method](request.argument);
      send({ type: 'reply', id: request.id, result: result ?? null });
    } catch (error) {
      const message = typeof error.message === 'string' && /[\u3040-\u30ff\u4e00-\u9fff]/.test(error.message) && !/token|bearer|secret|eyJ/i.test(error.message)
        ? error.message.slice(0, 400) : '操作に失敗しました。もう一度お試しください。';
      send({ type: 'reply', id: request?.id, error: message });
    }
  });
  for (let i = 0; i < 300; i++) {
    if (closing) return;
    try {
      const response = await fetch(origin + '/api/companies', { headers: { 'x-desktop-token': process.env.DESKTOP_AUTH_TOKEN }, signal: AbortSignal.timeout(500) });
      if (response.ok) { send({ type: 'ready', origin }); return; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  send({ type: 'fatal', error: '内部サーバーの起動がタイムアウトしました。' }); shutdown();
}
if (require.main === module) main().catch(() => { process.stdout.write(JSON.stringify({ type: 'fatal', error: 'アプリを起動できませんでした。' }) + '\n'); process.exit(1); });
module.exports = { nativeStorage, methods };
