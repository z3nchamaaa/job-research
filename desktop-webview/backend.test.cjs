const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { methods, nativeStorage } = require('./backend.cjs');

test('Backend exposes only the existing desktop bridge allowlist', async () => {
  const calls = [];
  const service = Object.fromEntries(['getSession','signIn','cancelSignIn','signOut','listModels','generate','openUsage'].map(name=>[name,argument=>{calls.push([name,argument]);return 'result';}]));
  const api = methods(service,{getProfile:()=>({version:1}),saveProfile:value=>value});
  assert.deepEqual(Object.keys(api).sort(),['getSession','signIn','cancelSignIn','signOut','listModels','generate','openUsage','getCareerProfile','saveCareerProfile'].sort());
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
