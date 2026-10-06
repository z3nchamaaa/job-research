const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { serverEnvironment, startServer } = require('./server-process.cjs');

test('Windowsの必須環境を残し、Node注入・認証・開発用変数は除く', () => {
  const env = serverEnvironment({ SystemRoot: 'C:\\Windows', TEMP: 'C:\\Temp',
    PATH: 'bin', NODE_OPTIONS: '--require evil', NODE_PATH: 'evil', ELECTRON_RUN_AS_NODE: '1',
    OPENAI_API_KEY: 'secret', DATABASE_URL: 'private' });
  assert.deepEqual(env, { SystemRoot: 'C:\\Windows', TEMP: 'C:\\Temp', PATH: 'bin' });
});

test('Windows ARM64だけが同梱x64 Nodeを直接起動する', () => {
  let captured;
  const child = {};
  const env = { DESKTOP_AUTH_TOKEN: 'secret' };
  const runtime = path.join(os.tmpdir(), 'runtime with spaces');
  const result = startServer({ platform: 'win32', arch: 'arm64', serverPath: path.join(runtime, 'server.js'), env }, {
    existsSync: () => true,
    fork: (...args) => { captured = args; return child; }
  });
  assert.equal(result, child);
  assert.equal(captured[0], path.join(runtime, 'server-parent.cjs'));
  assert.deepEqual(captured[1], []);
  assert.equal(captured[2].execPath, path.join(runtime, 'bin', 'win-x64', 'node.exe'));
  assert.deepEqual(captured[2].execArgv, []);
  assert.equal(captured[2].env, env);
  assert.equal(captured[2].silent, true);
  assert.equal(captured[2].windowsHide, true);
  assert.equal(captured[2].detached, false);
  assert.equal(captured[2].shell, undefined);
});

test('Mac ARM64・Windows x64・Linux x64は既存のutilityProcessを使用する', () => {
  for (const [platform, arch] of [['darwin', 'arm64'], ['win32', 'x64'], ['linux', 'x64']]) {
    let called = false;
    const utilityProcess = { fork: () => { called = true; return 'utility'; } };
    assert.equal(startServer({ platform, arch, serverPath: '/runtime/server.js', env: {}, utilityProcess }), 'utility');
    assert.equal(called, true);
  }
});

test('Windows ARM64で同梱Nodeが欠落したらARM64のDB処理にフォールバックしない', () => {
  assert.throws(() => startServer({ platform: 'win32', arch: 'arm64', serverPath: '/runtime/server.js' },
    { existsSync: () => false }), /互換ランタイムが見つかりません/);
});

test('互換サーバーは親のIPC切断で終了する', { timeout: 5000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-research-parent-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(__dirname, 'server-parent.cjs'), path.join(dir, 'server-parent.cjs'));
  fs.writeFileSync(path.join(dir, 'server.js'), "setInterval(() => {}, 1000); process.send('ready');");
  const child = fork(path.join(dir, 'server-parent.cjs'), [], { silent: true, execArgv: [] });
  t.after(() => child.kill());
  await once(child, 'message');
  const exited = once(child, 'exit');
  child.disconnect();
  const [code] = await exited;
  assert.equal(code, 0);
});
