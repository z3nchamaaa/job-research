const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChatGPTService } = require('./chatgpt.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-auth-recovery-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'auth.enc'), 'old-encrypted-data', { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'syukatsu.db'), 'company data must remain');
  fs.writeFileSync(path.join(dir, 'career-profile.json'), 'profile must remain');
  let available = true;
  const storage = {
    isEncryptionAvailable: () => available,
    decryptString(buffer) { if (buffer.toString() === 'old-encrypted-data') throw Error('key changed'); return buffer.toString(); },
    encryptString: text => Buffer.from(text),
  };
  let authorizeUrl;
  const service = new ChatGPTService({ userDataPath: dir, safeStorage: storage,
    openExternal: async url => { authorizeUrl = url; },
    fetch: async () => { throw Error('Unexpected remote call'); } });
  t.after(() => service.shutdown());
  return { dir, service, storage, setAvailable: value => { available = value; }, getAuthorizeUrl: () => authorizeUrl };
}

test('Unreadable auth is reported as recoverable disconnected session, not an IPC exception', t => {
  const { service, dir } = fixture(t);
  assert.equal(service.getSession().connected, false);
  assert.equal(service.getSession().needsReauthentication, true);
  assert.match(service.getSession().authError, /復号/);
  assert.ok(fs.existsSync(path.join(dir, 'auth.enc')));
});

test('Explicit logout removes only unreadable auth and does not claim remote revocation', async t => {
  const { service, dir } = fixture(t);
  const hostId = fs.readFileSync(path.join(dir, 'host_id.txt'), 'utf8');
  assert.deepEqual(await service.signOut(), { remoteRevoked: false });
  assert.deepEqual(service.getSession(), { connected: false, sharing: false, email: undefined });
  assert.ok(!fs.existsSync(path.join(dir, 'auth.enc')));
  assert.equal(fs.readFileSync(path.join(dir, 'syukatsu.db'), 'utf8'), 'company data must remain');
  assert.equal(fs.readFileSync(path.join(dir, 'career-profile.json'), 'utf8'), 'profile must remain');
  assert.equal(fs.readFileSync(path.join(dir, 'host_id.txt'), 'utf8'), hostId);
  assert.equal(new ChatGPTService({ userDataPath: dir, safeStorage: service.safeStorage }).getSession().needsReauthentication, undefined);
});

test('Reset followed by login can store fresh credentials and survive restart', async t => {
  const { service, dir, storage, getAuthorizeUrl } = fixture(t);
  await service.signOut();
  service.fetch = async () => ({ ok: true, json: async () => ({ token_type: 'Bearer', access_token: 'new-test-token', refresh_token: 'new-test-refresh', id_token: 'test-id-token', expires_in: 3600, scope: 'resource.invoke chatgpt.tokens.use.direct' }) });
  service.createRemoteJWKSet = () => ({});
  service.jwtVerify = async () => ({ payload: { sub: 'test-user', iss: 'https://auth.openai.com', nonce: new URL(getAuthorizeUrl()).searchParams.get('nonce') } });
  const login = service.signIn();
  login.catch(() => {});
  for (let i = 0; i < 100 && !getAuthorizeUrl(); i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(getAuthorizeUrl());
  const url = new URL(getAuthorizeUrl());
  assert.equal(url.searchParams.get('client_id'), 'dynamic_agent_client');
  const callback = new URL(url.searchParams.get('redirect_uri'));
  callback.search = new URLSearchParams({ state: url.searchParams.get('state'), code: 'test-code', client_id: 'new-test-client' }).toString();
  await fetch(callback);
  await login;
  assert.equal(service.getSession().connected, true);
  assert.equal(service.getSession().sharing, true);
  assert.equal(new ChatGPTService({ userDataPath: dir, safeStorage: storage }).getSession().connected, true);
});

test('Unavailable keychain blocks reset without deleting existing auth', async t => {
  const { service, dir, setAvailable } = fixture(t);
  setAvailable(false);
  await assert.rejects(service.signOut(), /認証情報は変更していません/);
  assert.equal(fs.readFileSync(path.join(dir, 'auth.enc'), 'utf8'), 'old-encrypted-data');
  assert.equal(service.getSession().needsReauthentication, true);
});

test('A failed local reset remains recoverable; no encryption fallback is used', async t => {
  const { service } = fixture(t);
  const unlink = fs.unlinkSync;
  fs.unlinkSync = file => { if (file === service.authFilePath) throw Object.assign(Error('denied'), { code: 'EACCES' }); return unlink(file); };
  try { await assert.rejects(service.signOut(), /削除できませんでした/); }
  finally { fs.unlinkSync = unlink; }
  assert.equal(service.getSession().needsReauthentication, true);
  await service.signOut();
  assert.equal(service.getSession().connected, false);
});
