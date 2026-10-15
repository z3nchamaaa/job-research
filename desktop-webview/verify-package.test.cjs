const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspect } = require('./verify-package.cjs');

test('Evergreen package rejects bundled browsers and user data', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webview-package-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of ['JobResearch.WebView.exe', 'runtime/server.js', 'runtime/template.db', 'runtime/bin/win-x64/node.exe', 'backend/backend.cjs', 'backend/bridge.js']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), 'test-fixture');
  }
  assert.ok(inspect(root).total > 0);
  for (const file of ['msedgewebview2.exe', 'electron.exe', 'auth.enc', 'career-profile.json', '.env', 'syukatsu.db-wal']) {
    const target = path.join(root, file);
    fs.writeFileSync(target, 'must-not-ship');
    assert.throws(() => inspect(root), /Unexpected browser runtime or user data/);
    fs.unlinkSync(target);
  }
  fs.unlinkSync(path.join(root, 'runtime', 'template.db'));
  assert.throws(() => inspect(root), /Missing package file/);
});
