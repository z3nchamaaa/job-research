const test = require('node:test');
const assert = require('node:assert');
const { ChatGPTService, parseSSE } = require('./chatgpt.cjs');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Mock safeStorage
class MockSafeStorage {
  constructor() {
    this.encryptionAvailable = true;
  }
  isEncryptionAvailable() { return this.encryptionAvailable; }
  encryptString(str) { return Buffer.from(str).toString('base64'); }
  decryptString(buffer) { return Buffer.from(buffer.toString(), 'base64').toString('utf-8'); }
}

function createMockOptions(userDataPath) {
  const options = {
    userDataPath,
    openExternal: async () => {},
    safeStorage: new MockSafeStorage(),
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    jwtVerify: async () => ({ payload: { sub: 'user1', iss: 'https://auth.openai.com', nonce: 'mock-nonce' } }),
    createRemoteJWKSet: () => ({})
  };
  return options;
}

test('Models format and order', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  
  const options = createMockOptions(dir);
  let fetchCalled = false;
  options.fetch = async (url) => {
    if (url.includes('models')) {
      fetchCalled = true;
      return {
        ok: true,
        json: async () => ({
          models: [
             { slug: 'model-a', display_name: 'Model A', visibility: 'list' },
             { slug: 'model-b', display_name: 'Model B', visibility: 'hidden' },
             { slug: 'model-c', display_name: 'Model C', visibility: 'list' }
          ]
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        token_type: 'Bearer',
        access_token: 'new-acc',
        expires_in: 3600,
        refresh_token: 'new-ref'
      })
    };
  };

  const service = new ChatGPTService(options);
  service.authData = { refresh_token: 'ref', scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'], expires_at: Date.now() - 10000 };
  
  const models = await service.listModels();
  assert.strictEqual(fetchCalled, true);
  assert.strictEqual(models.length, 2);
  assert.strictEqual(models[0].slug, 'model-a');
  assert.strictEqual(models[1].slug, 'model-c');
});

test('SSE parser: arbitrary chunks, CRLF, valid completion', async () => {
  const ac = new AbortController();
  const chunks = [
    "data: {\"type\":",
    "\"response.output_text.delta\",\"delta\":\"He\"}\r\n\r\n",
    "data: {\"type\":\"response.output_text.delta\",\"delta\":\"llo\"}\n\n",
    "data: {\"type\":\"response.completed\"}\r\n\r\n",
    "data: [DONE]\n\n"
  ];
  
  const encoder = new TextEncoder();
  let index = 0;
  const mockBody = {
    getReader: () => ({
      read: async () => {
        if (index < chunks.length) {
          return { done: false, value: encoder.encode(chunks[index++]) };
        }
        return { done: true };
      },
      cancel: async () => {}
    })
  };

  const text = await parseSSE(mockBody, ac);
  assert.strictEqual(text, 'Hello');
});

test('SSE parser: delta-only rejects (no completed event)', async () => {
  const ac = new AbortController();
  const chunks = [
    "data: {\"type\":\"response.output_text.delta\",\"delta\":\"Hello\"}\n\n",
    "data: [DONE]\n\n"
  ];
  const encoder = new TextEncoder();
  let index = 0;
  const mockBody = {
    getReader: () => ({
      read: async () => {
        if (index < chunks.length) return { done: false, value: encoder.encode(chunks[index++]) };
        return { done: true };
      },
      cancel: async () => {}
    })
  };

  await assert.rejects(parseSSE(mockBody, ac), /完了イベントを受信する前に/);
});

test('SSE parser: failed event rejects', async () => {
  const ac = new AbortController();
  const chunks = [
    "data: {\"type\":\"response.failed\"}\n\n",
  ];
  const encoder = new TextEncoder();
  let index = 0;
  const mockBody = {
    getReader: () => ({
      read: async () => {
        if (index < chunks.length) return { done: false, value: encoder.encode(chunks[index++]) };
        return { done: true };
      },
      cancel: async () => {}
    })
  };

  await assert.rejects(parseSSE(mockBody, ac), /エラーが発生しました/);
});

test('Refresh single-flight and rotation', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  
  const options = createMockOptions(dir);
  let fetchCount = 0;
  options.fetch = async () => {
    fetchCount++;
    await new Promise(r => setTimeout(r, 50));
    return {
      ok: true,
      json: async () => ({
        token_type: 'Bearer',
        access_token: `acc-${fetchCount}`,
        expires_in: 3600,
        refresh_token: `ref-${fetchCount}`,
        id_token: 'id-token-123'
      })
    };
  };

  const service = new ChatGPTService(options);
  service.authData = { refresh_token: 'ref-0', scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'], expires_at: Date.now() - 10000 };
  
  const ac = new AbortController();
  const [t1, t2] = await Promise.all([
    service._ensureToken(ac.signal),
    service._ensureToken(ac.signal)
  ]);
  
  assert.strictEqual(fetchCount, 1);
  assert.strictEqual(t1, 'acc-1');
  assert.strictEqual(t2, 'acc-1');
  assert.strictEqual(service.authData.refresh_token, 'ref-1');
});

test('Logout during delayed fetch prevents restoring tokens', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  
  const options = createMockOptions(dir);
  options.fetch = async (url) => {
    if (url && url.includes('.well-known')) {
      return { ok: true, json: async () => ({}) };
    }
    await new Promise(r => setTimeout(r, 100));
    return {
      ok: true,
      json: async () => ({
        token_type: 'Bearer',
        access_token: 'acc',
        expires_in: 3600,
        refresh_token: 'ref'
      })
    };
  };

  const service = new ChatGPTService(options);
  service.authData = { clientId: 'client', refresh_token: 'old-ref', scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'], expires_at: Date.now() - 10000 };
  
  const ac = new AbortController();
  const p = service._ensureToken(ac.signal);
  p.catch(() => {});
  
  // Interleave logout
  await service.signOut();
  
  await assert.rejects(p, /操作がキャンセル/);
  assert.strictEqual(service.authData.access_token, undefined);
  assert.strictEqual(service.authData.refresh_token, undefined);
  assert.strictEqual(service.authData.clientId, 'client');
});

test('Wrong-state OAuth error does not cancel login', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  
  const options = createMockOptions(dir);
  const service = new ChatGPTService(options);
  service.authData = { clientId: 'c1' };

  const p = service.signIn();
  p.catch(() => {});
  await new Promise(r => setTimeout(r, 100));
  
  const port = service.pendingLogin.server.address().port;
  
  // Make bad state request
  const res = await fetch(`http://127.0.0.1:${port}/auth/callback?state=wrong&error=access_denied`);
  assert.strictEqual(res.status, 400);
  
  // Pending login should still be active
  assert.notStrictEqual(service.pendingLogin, null);
  
  // Clean up
  await service.cancelSignIn();
  await assert.rejects(p, /キャンセル/);
});

test('Issued client ID persisted before exchange', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  
  const options = createMockOptions(dir);
  let fetchResolver;
  options.fetch = () => {
    return new Promise(r => {
      fetchResolver = r;
    });
  };
  const service = new ChatGPTService(options);
  
  const p = service.signIn();
  p.catch(() => {});
  await new Promise(r => setTimeout(r, 100));
  
  const port = service.pendingLogin.server.address().port;
  const state = service.pendingLogin.state;
  
  // Hit callback
  fetch(`http://127.0.0.1:${port}/auth/callback?state=${state}&code=123&client_id=new-client`).catch(() => {});
  
  await new Promise(r => setTimeout(r, 50));
  
  assert.strictEqual(service.authData.clientId, 'new-client');
  assert.strictEqual(service.authData.access_token, undefined);
  
  fetchResolver({ ok: false, status: 500 });
  await assert.rejects(p, /トークンの交換/);
});

test('preaborted no fetch', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = createMockOptions(dir);
  let fetched = false;
  options.fetch = async () => { fetched = true; return { ok: true, json: async () => ({}) }; };
  const service = new ChatGPTService(options);
  service.authData = { refresh_token: 'ref', scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'], expires_at: Date.now() - 10000 };
  
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(service._ensureToken(ac.signal), /キャンセル/);
  assert.strictEqual(fetched, false);
});

test('cancelled follower doesn\'t cancel other\'s refresh', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = createMockOptions(dir);
  options.fetch = async () => {
    await new Promise(r => setTimeout(r, 50));
    return { ok: true, json: async () => ({ token_type: 'Bearer', access_token: 'acc', expires_in: 3600, refresh_token: 'ref2' }) };
  };
  const service = new ChatGPTService(options);
  service.authData = { refresh_token: 'ref', scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'], expires_at: Date.now() - 10000 };
  
  const ac1 = new AbortController();
  const ac2 = new AbortController();
  
  const p1 = service._ensureToken(ac1.signal);
  const p2 = service._ensureToken(ac2.signal);
  
  ac2.abort();
  await assert.rejects(p2, /キャンセル/);
  const res1 = await p1;
  assert.strictEqual(res1, 'acc');
});

test('signOut revocation correct endpoint/form, status200', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = createMockOptions(dir);
  let requests = [];
  options.fetch = async (url, reqOptions) => {
    requests.push({ url, body: reqOptions?.body?.toString() });
    if (url.includes('.well-known')) {
      return { ok: true, json: async () => ({ revocation_endpoint: 'https://auth.openai.com/revoke' }) };
    }
    return { ok: true, status: 200 };
  };
  const service = new ChatGPTService(options);
  service.authData = { clientId: 'cid', refresh_token: 'ref' };
  
  const res = await service.signOut();
  assert.strictEqual(res.remoteRevoked, true);
  assert.strictEqual(requests.length, 2);
  assert.strictEqual(requests[1].url, 'https://auth.openai.com/revoke');
  assert.strictEqual(requests[1].body, 'token=ref&token_type_hint=refresh_token&client_id=cid');
});

test('metadata hostile origin never sent tokens', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = createMockOptions(dir);
  let requests = [];
  options.fetch = async (url, reqOptions) => {
    requests.push(url);
    if (url.includes('.well-known')) {
      return { ok: true, json: async () => ({ revocation_endpoint: 'https://evil.com/revoke' }) };
    }
    return { ok: true, status: 200 };
  };
  const service = new ChatGPTService(options);
  service.authData = { clientId: 'cid', refresh_token: 'ref' };
  
  const res = await service.signOut();
  assert.strictEqual(res.remoteRevoked, false);
  assert.strictEqual(requests.length, 1);
});

test('network/500 failure false and local cleared', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = createMockOptions(dir);
  let requests = [];
  options.fetch = async (url, reqOptions) => {
    requests.push(url);
    if (url.includes('.well-known')) {
      return { ok: true, json: async () => ({ revocation_endpoint: 'https://auth.openai.com/revoke' }) };
    }
    return { ok: false, status: 500 };
  };
  const service = new ChatGPTService(options);
  service.authData = { clientId: 'cid', refresh_token: 'ref' };
  
  const res = await service.signOut();
  assert.strictEqual(res.remoteRevoked, false);
  assert.strictEqual(service.authData.refresh_token, undefined);
  assert.strictEqual(requests.length, 3);
});

test('signOut delayed remote reply cannot overwrite subsequent session', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = createMockOptions(dir);
  let resolveRevoke;
  options.fetch = async (url, reqOptions) => {
    if (url.includes('.well-known')) {
      return { ok: true, json: async () => ({ revocation_endpoint: 'https://auth.openai.com/revoke' }) };
    }
    return new Promise(r => resolveRevoke = r);
  };
  const service = new ChatGPTService(options);
  service.authData = { clientId: 'cid', refresh_token: 'ref' };
  
  const p = service.signOut();
  await new Promise(r => setTimeout(r, 50));
  
  service.authData = { clientId: 'cid', refresh_token: 'ref-new' };
  
  resolveRevoke({ ok: true, status: 200 });
  await p;
  
  assert.strictEqual(service.authData.refresh_token, 'ref-new');
});

test('empty access token reject', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = createMockOptions(dir);
  options.fetch = async () => ({
    ok: true,
    json: async () => ({ token_type: 'Bearer', access_token: '', expires_in: 3600, refresh_token: 'ref2' })
  });
  const service = new ChatGPTService(options);
  service.authData = { refresh_token: 'ref', scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'], expires_at: Date.now() - 10000 };
  await assert.rejects(service._ensureToken(), /無効な/);
});

test('expired error families clear only tokens', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = createMockOptions(dir);
  options.fetch = async () => ({
    ok: false,
    json: async () => ({ error: 'invalid_grant' })
  });
  const service = new ChatGPTService(options);
  service.authData = { clientId: 'cid', refresh_token: 'ref', scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'], expires_at: Date.now() - 10000 };
  await assert.rejects(service._ensureToken(), /有効期限が切れました/);
  assert.strictEqual(service.authData.refresh_token, undefined);
  assert.strictEqual(service.authData.clientId, 'cid');
});

test('old refresh pending after reconnect not reused', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  const options = createMockOptions(dir);
  let resolvers = [];
  options.fetch = async () => {
    return new Promise(r => resolvers.push(r));
  };
  const service = new ChatGPTService(options);
  t.after(() => {
    service.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  service.authData = { clientId: 'cid', refresh_token: 'ref', scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'], expires_at: Date.now() - 10000 };
  
  const p1 = service._ensureToken();
  p1.catch(() => {});
  
  for (let i = 0; i < 50 && resolvers.length < 1; i++) await new Promise(r => setTimeout(r, 10));
  
  service.shutdown();
  
  service.authData = { clientId: 'cid', refresh_token: 'ref-new', scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'], expires_at: Date.now() - 10000 };
  const p2 = service._ensureToken(); 
  
  assert.notStrictEqual(p1, p2);
  
  for (let i = 0; i < 50 && resolvers.length < 2; i++) await new Promise(r => setTimeout(r, 10));
  
  resolvers[0]({ ok: true, json: async () => ({ token_type: 'Bearer', access_token: 'acc1', expires_in: 3600, refresh_token: 'ref1' }) });
  await assert.rejects(p1, /操作がキャンセル/);
  
  resolvers[1]({ ok: true, json: async () => ({ token_type: 'Bearer', access_token: 'acc2', expires_in: 3600, refresh_token: 'ref2' }) });
  const res2 = await p2;
  assert.strictEqual(res2, 'acc2');
  assert.strictEqual(service.authData.refresh_token, 'ref2');
});

test('revocation rejects nondefault port', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = createMockOptions(dir);
  options.fetch = async (url) => {
    if (url.includes('.well-known')) {
      return { ok: true, json: async () => ({ revocation_endpoint: 'https://auth.openai.com:8443/revoke' }) };
    }
    return { status: 200 };
  };
  const service = new ChatGPTService(options);
  service.authData = { clientId: 'cid', refresh_token: 'ref' };
  
  const res = await service.signOut();
  assert.strictEqual(res.remoteRevoked, false);
});

test('revocation status 202 not confirmed', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = createMockOptions(dir);
  options.fetch = async (url) => {
    if (url.includes('.well-known')) {
      return { ok: true, json: async () => ({ revocation_endpoint: 'https://auth.openai.com/revoke' }) };
    }
    return { status: 202 };
  };
  const service = new ChatGPTService(options);
  service.authData = { clientId: 'cid', refresh_token: 'ref' };
  
  const res = await service.signOut();
  assert.strictEqual(res.remoteRevoked, false);
});

test('discovery retries once on 5xx', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = createMockOptions(dir);
  let attempts = 0;
  options.fetch = async (url) => {
    if (url.includes('.well-known')) {
      attempts++;
      if (attempts === 1) return { ok: false, status: 502 };
      return { ok: true, json: async () => ({ revocation_endpoint: 'https://auth.openai.com/revoke' }) };
    }
    return { status: 200 };
  };
  const service = new ChatGPTService(options);
  service.authData = { clientId: 'cid', refresh_token: 'ref' };
  
  const res = await service.signOut();
  assert.strictEqual(res.remoteRevoked, true);
  assert.strictEqual(attempts, 2);
});

test('terminal error families LOOP all six', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  
  const errors = ['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused'];
  
  for (const errCode of errors) {
    const options = createMockOptions(dir);
    options.fetch = async () => ({
      ok: false,
      json: async () => ({ error: errCode })
    });
    const service = new ChatGPTService(options);
    service.authData = { clientId: 'cid', refresh_token: 'ref', scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'], expires_at: Date.now() - 10000 };
    await assert.rejects(service._ensureToken(), /有効期限が切れました/);
    assert.strictEqual(service.authData.refresh_token, undefined, `Failed for ${errCode}`);
    assert.strictEqual(service.authData.clientId, 'cid');
  }
});

test('synchronous throw recovery', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const options = createMockOptions(dir);
  let attempt = 0;
  options.fetch = () => {
    attempt++;
    if (attempt === 1) {
      throw new Error('Sync throw network error');
    }
    return Promise.resolve({ ok: true, json: async () => ({ token_type: 'Bearer', access_token: 'acc-recovered', expires_in: 3600, refresh_token: 'ref' }) });
  };
  const service = new ChatGPTService(options);
  service.authData = { clientId: 'cid', refresh_token: 'ref', scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'], expires_at: Date.now() - 10000 };
  
  await assert.rejects(service._ensureToken(), /Sync throw/);
  assert.strictEqual(service.refreshPromise, null); // should not be left hanging forever
  
  const res = await service._ensureToken();
  assert.strictEqual(res, 'acc-recovered');
});

test('cancelled-before-start ensures zero network calls', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-test-'));
  const options = createMockOptions(dir);
  let networkCalls = 0;
  options.fetch = async () => {
    networkCalls++;
    return { ok: true, json: async () => ({ token_type: 'Bearer', access_token: 'acc', expires_in: 3600, refresh_token: 'ref2' }) };
  };
  const service = new ChatGPTService(options);
  t.after(() => {
    service.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  service.authData = { clientId: 'cid', refresh_token: 'ref', scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'], expires_at: Date.now() - 10000 };
  
  const p = service._ensureToken();
  service.shutdown();
  
  await assert.rejects(p, /操作がキャンセル/);
  assert.strictEqual(networkCalls, 0);
});
