const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { methods, nativeStorage, prepareData } = require('./backend.cjs');
const os = require('node:os');

test('Existing Electron DB/profile/auth are preserved and WebView credentials are separate', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webview-data-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const data = path.join(root, 'data');
  const runtime = path.join(root, 'runtime');
  fs.mkdirSync(data); fs.mkdirSync(runtime);
  fs.writeFileSync(path.join(runtime, 'template.db'), 'empty-template');
  const originals = { 'syukatsu.db': 'existing-db', 'syukatsu.db-wal': 'existing-wal', 'career-profile.json': '{"version":1}', 'auth.enc': 'electron-auth', 'host_id.txt': 'electron-host' };
  for (const [name, value] of Object.entries(originals)) fs.writeFileSync(path.join(data, name), value);
  const result = prepareData(data, runtime);
  assert.equal(result.db, path.join(data, 'syukatsu.db'));
  assert.equal(result.auth, path.join(data, 'webview-auth'));
  fs.writeFileSync(path.join(result.auth, 'auth.enc'), 'webview-auth');
  prepareData(data, runtime);
  for (const [name, value] of Object.entries(originals)) assert.equal(fs.readFileSync(path.join(data, name), 'utf8'), value);
  assert.equal(fs.readFileSync(path.join(result.auth, 'auth.enc'), 'utf8'), 'webview-auth');
});

test('A new installation gets only the empty template and separate auth directory', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webview-new-data-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'template.db'), 'empty-template');
  const { db, auth } = prepareData(path.join(root, 'new'), root);
  assert.equal(fs.readFileSync(db, 'utf8'), 'empty-template');
  assert.deepEqual(fs.readdirSync(auth), []);
});

test('Backend exposes only the existing desktop bridge allowlist', async () => {
  const calls = [];
  const service = Object.fromEntries(['getSession','signIn','cancelSignIn','signOut','listModels','generate','openUsage'].map(name=>[name,argument=>{calls.push([name,argument]);return 'result';}]));
  const api = methods(service,{getProfile:()=>({version:1}),saveProfile:value=>value});
  assert.deepEqual(Object.keys(api).sort(),['getSession','signIn','cancelSignIn','signOut','listModels','generate','openUsage','getCareerProfile','saveCareerProfile','getUpdateStatus','checkForUpdates','downloadUpdate','installUpdate'].sort());
  assert.ok(Object.isFrozen(api));
  assert.equal(Object.hasOwn(api,'constructor'),false);
  assert.equal(api.generate({input:'test'}),'result');
  assert.deepEqual(calls,[['generate',{input:'test'}]]);
  assert.deepEqual(api.saveCareerProfile({version:1}),{version:1});
});

function bridge(origin, frame = false) {
  const sent = [];
  let listener;
  const window = { chrome: {webview:{addEventListener:(_,fn)=>{listener=fn;},postMessage:value=>sent.push(value)}} };
  window.top = frame ? {} : window;
  let id = 0;
  const script = fs.readFileSync(path.join(__dirname,'bridge.js'),'utf8').replace('__EXPECTED_ORIGIN__',JSON.stringify('http://127.0.0.1:1234'));
  vm.runInNewContext(script,{window,location:{origin},crypto:{randomUUID:()=>`uuid-${++id}`}});
  return {window,sent,receive:value=>listener({data:value})};
}
test('Bridge is unavailable in external origins and subframes',()=>{
  assert.equal(bridge('https://example.com').window.syukatsuDesktop,undefined);
  assert.equal(bridge('http://127.0.0.1:1234',true).window.syukatsuDesktop,undefined);
});
test('Bridge routes replies, rejects errors, and exposes no token or native shell',async()=>{
  const context = bridge('http://127.0.0.1:1234');
  const pending = context.window.syukatsuDesktop.getSession();
  assert.equal(context.sent[0].method,'getSession');
  context.receive({type:'reply',id:context.sent[0].id,result:{connected:false}});
  assert.deepEqual(await pending,{connected:false});
  const failing = context.window.syukatsuDesktop.signIn();
  context.receive({type:'reply',id:context.sent[1].id,error:'ログイン失敗'});
  await assert.rejects(failing,/ログイン失敗/);
  assert.ok(Object.isFrozen(context.window.syukatsuDesktop));
  assert.equal(context.window.syukatsuDesktop.openExternal,undefined);
});
test('Storage refuses to use plaintext encryption on non-Windows', {skip:process.platform==='win32'},()=>{
  assert.equal(nativeStorage('missing-host').isEncryptionAvailable(),false);
  assert.throws(()=>nativeStorage('missing-host').encryptString('secret'),/暗号化/);
});
test('Actual Windows DPAPI helper roundtrip and damaged ciphertext rejection', {skip:!process.env.JOB_WEBVIEW_TEST_HOST},()=>{
  const storage = nativeStorage(process.env.JOB_WEBVIEW_TEST_HOST);
  const text = 'test token 日本語';
  const encrypted = storage.encryptString(text);
  assert.ok(!encrypted.includes(Buffer.from(text)));
  assert.equal(storage.decryptString(encrypted),text);
  assert.throws(()=>storage.decryptString(Buffer.from('broken')),/暗号化/);
});

test('Native DPAPI session recovery removes only WebView auth and survives restart', {skip:!process.env.JOB_WEBVIEW_TEST_HOST}, async t => {
  const { ChatGPTService } = require('../desktop/chatgpt.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webview-auth-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'template.db'), 'test-template');
  fs.writeFileSync(path.join(root, 'auth.enc'), 'untouched-electron-auth');
  const { auth } = prepareData(root, root);
  const file = path.join(auth, 'auth.enc');
  fs.writeFileSync(file, 'damaged-ciphertext');
  const safeStorage = nativeStorage(process.env.JOB_WEBVIEW_TEST_HOST);
  const create = () => new ChatGPTService({ userDataPath: auth, safeStorage, openExternal: async () => {}, fetch: async () => { throw Error('Unexpected network access'); } });
  const service = create();
  t.after(() => service.shutdown());
  assert.equal(service.getSession().needsReauthentication, true);
  await service.signOut();
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readFileSync(path.join(root, 'auth.enc'), 'utf8'), 'untouched-electron-auth');
  fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify({ clientId: 'test-client' })));
  const restarted = create();
  t.after(() => restarted.shutdown());
  assert.equal(restarted.getSession().needsReauthentication, undefined);
  assert.equal(restarted.authData.clientId, 'test-client');
});
