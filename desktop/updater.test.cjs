const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { AppUpdater, newer, packageName, safeRedirect } = require('./updater.cjs');
const bytes = Buffer.from('synthetic installer fixture');
const digest = crypto.createHash('sha256').update(bytes).digest('hex');
const asset = { name: 'job-research-1.0.6-win-arm64.exe', state: 'uploaded', size: bytes.length, digest: `sha256:${digest}`, browser_download_url: 'https://github.com/z3nchamaaa/job-research/releases/download/v1.0.6/job-research-1.0.6-win-arm64.exe' };
const release = { tag_name: 'v1.0.6', draft: false, prerelease: false, body: '変更内容', assets: [asset] };
function setup(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-update-test-'));
  let calls = [], opened = [];
  const updater = new AppUpdater({ version: '1.0.5', platform: 'win32', arch: 'arm64', userDataPath: root,
    fetch: async url => { calls.push(url); return url.endsWith('/latest') ? Response.json(options.release || release) : new Response(options.bytes || bytes, { headers: { 'content-length': String((options.bytes || bytes).length) } }); },
    openInstaller: async file => { opened.push(file); return { opened: true }; }, ...options });
  t.after(() => { updater.shutdown(); fs.rmSync(root, { recursive: true, force: true }); });
  return { updater, root, calls, opened };
}
test('Numeric versions reject prereleases, invalid versions and downgrades', () => {
  assert.ok(newer('v1.10.0','1.9.9'));
  for (const candidate of ['v1.0.5','v1.0.4','v1.0.6-dev','v01.0.6','https://evil.test']) assert.equal(newer(candidate,'1.0.5'), false);
});
test('Architecture selection and redirect origins are constrained', () => {
  assert.equal(packageName('v1.0.6','win32','arm64'), asset.name);
  assert.equal(packageName('v1.0.6','darwin','arm64'), 'job-research-1.0.6-mac-arm64.dmg');
  assert.equal(packageName('v1.0.6','linux','x64','rpm'), 'job-research-1.0.6-linux-x86_64.rpm');
  assert.equal(packageName('v1.0.6','linux','arm64','deb'), null);
  for (const url of ['http://github.com/file','https://evil.test/file','https://github.com.evil.test/file','https://user@github.com/file','https://github.com:444/file']) assert.equal(safeRedirect(url), false);
  assert.ok(safeRedirect('https://release-assets.githubusercontent.com/file'));
});
test('Checks are single flight, do not download/launch, and install requires verified bytes', async t => {
  const { updater, calls, opened } = setup(t);
  const [one, two] = await Promise.all([updater.check(), updater.check()]);
  assert.equal(one.status, 'available'); assert.deepEqual(one, two);
  assert.equal(calls.length, 1); assert.equal(opened.length, 0);
  await assert.rejects(updater.install(), /ダウンロード/);
  assert.equal((await updater.download()).status, 'ready');
  assert.equal(opened.length, 0);
  assert.equal((await updater.install()).opened, true);
  assert.equal(opened.length, 1);
  assert.equal(path.basename(opened[0]), asset.name);
});
test('Prereleases, foreign URLs, missing hashes and oversized packages are refused', async t => {
  for (const change of [{ prerelease: true },{ draft: true },{ assets: [{ ...asset, browser_download_url: 'https://evil.test/app.exe' }] },{ assets: [{ ...asset, digest: null }] },{ assets: [{ ...asset, size: 2**32 }] },{ assets: [asset, asset] }]) {
    const { updater, calls } = setup(t, { release: { ...release, ...change } });
    assert.equal((await updater.check()).status, 'error');
    await assert.rejects(updater.download());
    assert.equal(calls.length, 1);
  }
});
test('Older/latest version never permits installation or downgrade', async t => {
  const { updater } = setup(t, { release: { ...release, tag_name: 'v1.0.4' } });
  assert.equal((await updater.check()).status, 'current');
  await assert.rejects(updater.download());
});
test('Checksum mismatch removes the partial package and does not launch', async t => {
  const { updater, root, opened } = setup(t, { bytes: Buffer.alloc(bytes.length, 0) });
  await updater.check();
  assert.equal((await updater.download()).status, 'error');
  assert.deepEqual(fs.readdirSync(path.join(root,'updates')), []);
  await assert.rejects(updater.install()); assert.equal(opened.length, 0);
});
test('Tampering after download is rechecked and rejected', async t => {
  const { updater, opened } = setup(t);
  await updater.check(); await updater.download();
  fs.writeFileSync(updater.downloaded.file, Buffer.alloc(bytes.length, 0));
  await assert.rejects(updater.install(), /もう一度ダウンロード/);
  assert.equal(opened.length, 0);
});
test('Untrusted redirects cannot fetch arbitrary hosts', async t => {
  let calls = 0;
  const { updater } = setup(t, { fetch: async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://evil.test' } }); } });
  assert.equal((await updater.check()).status, 'error'); assert.equal(calls, 1);
});
test('Network failure can be retried without deleting user data', async t => {
  let calls = 0;
  const { updater, root } = setup(t, { fetch: async () => { if (!calls++) throw Error('offline'); return Response.json(release); } });
  fs.writeFileSync(path.join(root, 'syukatsu.db'), 'untouched');
  assert.equal((await updater.check()).status, 'error');
  assert.equal((await updater.check()).status, 'available');
  assert.equal(fs.readFileSync(path.join(root, 'syukatsu.db'), 'utf8'), 'untouched');
});

test('Truncated downloads and size headers are rejected', async t => {
  for (const response of [() => new Response(bytes.subarray(1)), () => new Response(bytes, { headers: { 'content-length': '1' } })]) {
    const { updater, root } = setup(t, { fetch: async url => url.endsWith('/latest') ? Response.json(release) : response() });
    await updater.check();
    assert.equal((await updater.download()).status, 'error');
    assert.deepEqual(fs.readdirSync(path.join(root, 'updates')), []);
    await assert.rejects(updater.install());
  }
});
test('Download is single flight and API requests never send authentication headers', async t => {
  let downloads = 0;
  const { updater } = setup(t, { fetch: async (url, options) => {
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers['x-desktop-token'], undefined);
    if (url.endsWith('/latest')) return Response.json(release);
    downloads++; return new Response(bytes);
  } });
  await updater.check();
  await Promise.all([updater.download(), updater.download()]);
  assert.equal(downloads, 1);
});
test('A missing downloaded file cannot be opened and permits another download', async t => {
  const { updater, opened } = setup(t);
  await updater.check(); await updater.download();
  fs.unlinkSync(updater.downloaded.file);
  await assert.rejects(updater.install(), /もう一度/);
  assert.equal(opened.length, 0);
  assert.equal((await updater.download()).status, 'ready');
});
test('Installer opening failure leaves the app/data intact and supports retry', async t => {
  let attempts = 0;
  const { updater } = setup(t, { openInstaller: async () => { if (!attempts++) throw Error('cannot open'); return { opened: true }; } });
  await updater.check(); await updater.download();
  await assert.rejects(updater.install());
  assert.equal(updater.getStatus().status, 'ready');
  assert.equal((await updater.install()).opened, true);
});
test('Rate limits return an actionable error, not latest-version success', async t => {
  const { updater } = setup(t, { fetch: async () => new Response(null, { status: 403 }) });
  assert.match((await updater.check()).error, /利用制限/);
});
