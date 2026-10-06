const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ChatGPTService, parseSSE } = require('./chatgpt.cjs');

class MockSafeStorage {
  constructor() {
    this.encryptionAvailable = true;
  }
  isEncryptionAvailable() { return this.encryptionAvailable; }
  encryptString(str) { return Buffer.from(str).toString('base64'); }
  decryptString(buffer) { return Buffer.from(buffer.toString(), 'base64').toString('utf-8'); }
}

function createMockOptions(userDataPath) {
  return {
    userDataPath,
    openExternal: async () => {},
    safeStorage: new MockSafeStorage(),
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    jwtVerify: async () => ({ payload: { sub: 'user1', iss: 'https://auth.openai.com', nonce: 'mock-nonce' } }),
    createRemoteJWKSet: () => ({})
  };
}

function createMockBody(chunks) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    getReader: () => ({
      read: async () => {
        if (index < chunks.length) {
          const chunk = chunks[index++];
          const val = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
          return { done: false, value: val };
        }
        return { done: true };
      },
      cancel: async () => {}
    })
  };
}

test('logout getSession disconnected but clientId retained', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-sec-test-'));
  const options = createMockOptions(dir);
  const service = new ChatGPTService(options);
  t.after(async () => {
    service.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  service.authData = {
    clientId: 'client-retained-123',
    access_token: 'acc-token',
    refresh_token: 'ref-token',
    scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'],
    email: 'user@example.com'
  };

  assert.strictEqual(service.getSession().connected, true);
  assert.strictEqual(service.getSession().sharing, true);

  await service.signOut();

  const session = service.getSession();
  assert.strictEqual(session.connected, false);
  assert.strictEqual(session.sharing, false);
  assert.strictEqual(service.authData.clientId, 'client-retained-123');
  assert.strictEqual(service.authData.access_token, undefined);
  assert.strictEqual(service.authData.refresh_token, undefined);

  const reloaded = new ChatGPTService(options);
  assert.strictEqual(reloaded.getSession().connected, false);
  assert.strictEqual(reloaded.authData.clientId, 'client-retained-123');
});

test('refresh own fetch AbortSignal aborted on signOut', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-sec-test-'));
  const options = createMockOptions(dir);
  let capturedSignal = null;
  let fetchStarted = false;

  options.fetch = async (url, fetchOptions) => {
    if (url.includes('.well-known')) {
      return { ok: true, json: async () => ({}) };
    }
    fetchStarted = true;
    capturedSignal = fetchOptions?.signal;
    return new Promise((resolve, reject) => {
      if (capturedSignal) {
        capturedSignal.addEventListener('abort', () => reject(new Error('fetch aborted')));
      }
    });
  };

  const service = new ChatGPTService(options);
  service.authData = {
    clientId: 'client-refresh',
    refresh_token: 'old-ref',
    scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'],
    expires_at: Date.now() - 10000
  };
  t.after(async () => {
    service.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const p = service._ensureToken();
  p.catch(() => {});

  for (let i = 0; i < 50 && !fetchStarted; i++) {
    await new Promise(r => setTimeout(r, 10));
  }
  assert.strictEqual(fetchStarted, true);

  await service.signOut();

  assert.strictEqual(capturedSignal?.aborted, true);
  await assert.rejects(p, /キャンセル|aborted/);
  assert.strictEqual(service.authData.access_token, undefined);
  assert.strictEqual(service.authData.refresh_token, undefined);
  assert.strictEqual(service.authData.clientId, 'client-refresh');
});

test('valid OAuth mock jwt verify options issuer/audience/requiredClaims and actual nonce from openExternal authorizeURL succeed getSession connected', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-sec-test-'));
  const options = createMockOptions(dir);
  let capturedVerifyOptions = null;
  let capturedNonce = null;

  options.openExternal = async (authUrl) => {
    const parsed = new URL(authUrl);
    capturedNonce = parsed.searchParams.get('nonce');
    const state = parsed.searchParams.get('state');
    const redirectUri = parsed.searchParams.get('redirect_uri');

    setImmediate(async () => {
      try {
        await fetch(`${redirectUri}?state=${state}&code=auth-code-123&client_id=dynamic-client-xyz`);
      } catch (err) {}
    });
  };

  options.fetch = async (url) => {
    if (url.includes('/oauth/token')) {
      return {
        ok: true,
        json: async () => ({
          token_type: 'Bearer',
          access_token: 'acc-oauth-token',
          expires_in: 3600,
          refresh_token: 'ref-oauth-token',
          scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
          id_token: 'id-token-oauth'
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  options.jwtVerify = async (idToken, jwks, verifyOptions) => {
    capturedVerifyOptions = verifyOptions;
    return {
      payload: {
        sub: 'sub-user-999',
        iss: 'https://auth.openai.com',
        nonce: capturedNonce,
        email: 'oauth-user@test.com'
      }
    };
  };

  const service = new ChatGPTService(options);
  t.after(async () => {
    service.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await service.signIn();

  assert.ok(capturedNonce);
  assert.strictEqual(capturedVerifyOptions.issuer, 'https://auth.openai.com');
  assert.strictEqual(capturedVerifyOptions.audience, 'dynamic-client-xyz');
  assert.deepStrictEqual(capturedVerifyOptions.requiredClaims, ['sub', 'exp', 'iat']);

  const session = service.getSession();
  assert.strictEqual(session.connected, true);
  assert.strictEqual(session.sharing, true);
  assert.strictEqual(session.email, 'oauth-user@test.com');
  assert.strictEqual(service.authData.clientId, 'dynamic-client-xyz');
});

test('wrong nonce rejected', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-sec-test-'));
  const options = createMockOptions(dir);

  options.openExternal = async (authUrl) => {
    const parsed = new URL(authUrl);
    const state = parsed.searchParams.get('state');
    const redirectUri = parsed.searchParams.get('redirect_uri');
    setImmediate(async () => {
      try {
        await fetch(`${redirectUri}?state=${state}&code=code123&client_id=client-abc`);
      } catch (err) {}
    });
  };

  options.fetch = async (url) => {
    if (url.includes('/oauth/token')) {
      return {
        ok: true,
        json: async () => ({
          token_type: 'Bearer',
          access_token: 'acc-token',
          expires_in: 3600,
          refresh_token: 'ref-token',
          scope: 'chatgpt.tokens.use.direct resource.invoke',
          id_token: 'id-token-abc'
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  options.jwtVerify = async () => ({
    payload: {
      sub: 'user1',
      iss: 'https://auth.openai.com',
      nonce: 'wrong-tampered-nonce'
    }
  });

  const service = new ChatGPTService(options);
  t.after(async () => {
    service.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await assert.rejects(service.signIn(), /Nonceが一致しません/);
  assert.strictEqual(service.getSession().connected, false);
});

test('cancel during deferred token exchange cannot restore credentials (pending.catch attach before cancel, old callback result release)', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-sec-test-'));
  const options = createMockOptions(dir);
  let resolveTokenFetch;
  let exchangeReached = false;
  let callbackUrl = null;

  options.openExternal = async (authUrl) => {
    const parsed = new URL(authUrl);
    callbackUrl = `${parsed.searchParams.get('redirect_uri')}?state=${parsed.searchParams.get('state')}&code=code-def&client_id=client-deferred`;
  };

  options.fetch = async (url) => {
    if (url.includes('/oauth/token')) {
      exchangeReached = true;
      return new Promise((resolve) => {
        resolveTokenFetch = resolve;
      });
    }
    return { ok: true, json: async () => ({}) };
  };

  const service = new ChatGPTService(options);
  t.after(async () => {
    service.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const pending = service.signIn();
  pending.catch(() => {});

  for (let i = 0; i < 50 && !callbackUrl; i++) {
    await new Promise(r => setTimeout(r, 10));
  }
  assert.ok(callbackUrl);

  fetch(callbackUrl).catch(() => {});

  for (let i = 0; i < 50 && !exchangeReached; i++) {
    await new Promise(r => setTimeout(r, 10));
  }
  assert.strictEqual(exchangeReached, true);

  await service.cancelSignIn();

  resolveTokenFetch({
    ok: true,
    json: async () => ({
      token_type: 'Bearer',
      access_token: 'restored-token',
      expires_in: 3600,
      refresh_token: 'restored-ref',
      scope: 'chatgpt.tokens.use.direct resource.invoke',
      id_token: 'restored-id'
    })
  });

  await new Promise(r => setTimeout(r, 50));

  await assert.rejects(pending, /キャンセル/);
  assert.strictEqual(service.authData?.access_token, undefined);
  assert.strictEqual(service.authData?.refresh_token, undefined);
  assert.strictEqual(service.getSession().connected, false);
});

test('generate modelcatalog403/malformed never calls /responses', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-sec-test-'));
  const options = createMockOptions(dir);
  let responsesCalls = 0;
  let modelCatalogStatus = 403;
  let modelCatalogData = null;

  options.fetch = async (url) => {
    if (url.includes('/responses')) {
      responsesCalls++;
      return { ok: true, body: {} };
    }
    if (url.includes('/models')) {
      if (modelCatalogStatus === 403) return { ok: false, status: 403 };
      return { ok: true, json: async () => modelCatalogData };
    }
    return { ok: true, json: async () => ({}) };
  };

  const service = new ChatGPTService(options);
  service.authData = {
    clientId: 'client-gen',
    access_token: 'acc-gen',
    refresh_token: 'ref-gen',
    scopes: ['chatgpt.tokens.use.direct', 'resource.invoke'],
    expires_at: Date.now() + 3600000
  };
  t.after(async () => {
    service.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const validReq = {
    model: 'gpt-4o',
    input: 'This prompt is definitely more than twenty characters long.',
    instructions: 'Be brief.'
  };

  // Case 1: 403 Forbidden
  modelCatalogStatus = 403;
  await assert.rejects(service.generate(validReq), /モデルカタログ/);
  assert.strictEqual(responsesCalls, 0);

  // Case 2: Malformed catalog JSON
  modelCatalogStatus = 200;
  modelCatalogData = { models: 'not-an-array' };
  await assert.rejects(service.generate(validReq), /モデルカタログが不正/);
  assert.strictEqual(responsesCalls, 0);
});

test('SSE error and malformed rejects', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-sec-test-'));
  const service = new ChatGPTService(createMockOptions(dir));
  t.after(async () => {
    service.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await assert.rejects(
    parseSSE(createMockBody(['data: {broken-json\n\n']), new AbortController()),
    /無効なJSONフォーマット/
  );

  await assert.rejects(
    parseSSE(createMockBody(['data: {"foo":"bar"}\n\n']), new AbortController()),
    /無効なイベントフォーマット/
  );

  await assert.rejects(
    parseSSE(createMockBody(['data: {"type":"error"}\n\n']), new AbortController()),
    /エラーが発生しました/
  );

  await assert.rejects(
    parseSSE(createMockBody(['data: {"type":"response.failed"}\n\n']), new AbortController()),
    /エラーが発生しました/
  );
});

test('multiline data JSON/UTF8 bytes split produces text', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-sec-test-'));
  const service = new ChatGPTService(createMockOptions(dir));
  t.after(async () => {
    service.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const rawSSE = [
    'data: {',
    'data:   "type": "response.output_text.delta",',
    'data:   "delta": "日本語マルチバイト分割テスト"',
    'data: }',
    '',
    'data: {"type": "response.completed"}',
    '',
    'data: [DONE]',
    '',
    ''
  ].join('\n');

  const fullBytes = new TextEncoder().encode(rawSSE);
  const byteChunks = [];
  for (let i = 0; i < fullBytes.length; i += 3) {
    byteChunks.push(fullBytes.subarray(i, i + 3));
  }

  const result = await parseSSE(createMockBody(byteChunks), new AbortController());
  assert.strictEqual(result, '日本語マルチバイト分割テスト');
});

test('response.completed without EOF resolves+reader cancel', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-sec-test-'));
  const service = new ChatGPTService(createMockOptions(dir));
  t.after(async () => {
    service.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  let readerCancelled = false;
  let readCount = 0;
  const mockBody = {
    getReader: () => ({
      read: async () => {
        readCount++;
        if (readCount === 1) {
          return {
            done: false,
            value: new TextEncoder().encode(
              'data: {"type":"response.output_text.delta","delta":"Fast resolve"}\n\n' +
              'data: {"type":"response.completed"}\n\n'
            )
          };
        }
        return new Promise(() => {});
      },
      cancel: async () => {
        readerCancelled = true;
      }
    })
  };

  const text = await parseSSE(mockBody, new AbortController());
  assert.strictEqual(text, 'Fast resolve');
  assert.strictEqual(readerCancelled, true);
});

test('no completed rejects even deltas', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-sec-test-'));
  const service = new ChatGPTService(createMockOptions(dir));
  t.after(async () => {
    service.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const chunks = [
    'data: {"type":"response.output_text.delta","delta":"Hello "}\n\n',
    'data: {"type":"response.output_text.delta","delta":"World"}\n\n'
  ];

  await assert.rejects(
    parseSSE(createMockBody(chunks), new AbortController()),
    /レスポンスが不完全です|完了イベントを受信する前に/
  );
});

test('completed.response.output content.type=output_text fallback', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-sec-test-'));
  const service = new ChatGPTService(createMockOptions(dir));
  t.after(async () => {
    service.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const completedEvent = {
    type: 'response.completed',
    response: {
      status: 'completed',
      output: [
        {
          content: [
            {
              type: 'output_text',
              text: 'Fallback text from completed output'
            }
          ]
        }
      ]
    }
  };

  const chunks = [`data: ${JSON.stringify(completedEvent)}\n\n`];
  const text = await parseSSE(createMockBody(chunks), new AbortController());
  assert.strictEqual(text, 'Fallback text from completed output');
});

test('aborted stalled SSE rejects', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-sec-test-'));
  const service = new ChatGPTService(createMockOptions(dir));
  t.after(async () => {
    service.shutdown();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  let resolveRead;
  let cancelCalled = false;
  const mockBody = {
    getReader: () => ({
      read: () => new Promise((resolve) => {
        resolveRead = resolve;
      }),
      cancel: async () => {
        cancelCalled = true;
        if (resolveRead) resolveRead({ done: true, value: undefined });
      }
    })
  };

  const ac = new AbortController();
  const p = parseSSE(mockBody, ac);
  p.catch(() => {});

  ac.abort();

  await assert.rejects(p, /キャンセル/);
  assert.strictEqual(cancelCalled, true);
});
