const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const EventEmitter = require('node:events');

const mainCjsPath = path.resolve(__dirname, 'main.cjs');
const getMainCjsCode = () => fs.readFileSync(mainCjsPath, 'utf8');

function createMockEnvironment(options = {}) {
  const appListeners = new Map();
  const ipcHandlers = new Map();
  const webContentsListeners = new Map();
  let windowOpenHandler = null;
  const singleInstanceLock = true;
  const appDataDir = options.tempDir || os.tmpdir();
  let userDataDir = path.join(appDataDir, 'syukatsu-tracker-desktop');

  const childProcess = new EventEmitter();
  childProcess.stderr = new EventEmitter();
  childProcess.kill = () => {
    childProcess.killed = true;
  };

  const dialogCalls = [];
  const shellOpenCalls = [];
  const quitCalls = [];
  let chatGPTRef = null;
  let mainWindowInstance = null;

  class MockChatGPTService {
    constructor(opts) {
      this.options = opts;
      this.isShutdown = false;
      chatGPTRef = this;
    }
    shutdown() {
      this.isShutdown = true;
    }
    getSession() {
      return { connected: true };
    }
    signIn() { return Promise.resolve(); }
    cancelSignIn() { return Promise.resolve(); }
    signOut() { return Promise.resolve(); }
    listModels() { return Promise.resolve([]); }
    generate() { return Promise.resolve('mock-generated'); }
    openUsage() { return Promise.resolve(); }
  }

  const app = {
    isPackaged: false,
    setName: (n) => { app.name = n; },
    getName: () => app.name,
    setPath: (name, p) => {
      if (name === 'userData') userDataDir = p;
    },
    getPath: (name) => {
      if (name === 'appData') return appDataDir;
      if (name === 'userData') return userDataDir;
      return os.tmpdir();
    },
    requestSingleInstanceLock: () => singleInstanceLock,
    on: (evt, cb) => {
      if (!appListeners.has(evt)) appListeners.set(evt, []);
      appListeners.get(evt).push(cb);
      return app;
    },
    emit: (evt, ...args) => {
      const cbs = appListeners.get(evt) || [];
      for (const cb of cbs) cb(...args);
    },
    whenReady: () => Promise.resolve(),
    quit: () => {
      quitCalls.push(true);
      app.emit('before-quit');
      app.emit('will-quit');
    },
    exit: (code) => {
      quitCalls.push(code);
    }
  };

  class MockBrowserWindow {
    constructor(opts) {
      mainWindowInstance = this;
      this.opts = opts;
      this.isDestroyedFlag = false;
      this.mainFrame = { url: '' };
      this.webContents = {
        mainFrame: this.mainFrame,
        session: {
          webRequest: {
            onBeforeSendHeaders: () => {},
            onHeadersReceived: () => {}
          },
          setPermissionRequestHandler: () => {},
          setPermissionCheckHandler: () => {}
        },
        setWindowOpenHandler: (handler) => {
          windowOpenHandler = handler;
        },
        on: (evt, cb) => {
          if (!webContentsListeners.has(evt)) webContentsListeners.set(evt, []);
          webContentsListeners.get(evt).push(cb);
        },
        emit: (evt, ...args) => {
          const cbs = webContentsListeners.get(evt) || [];
          for (const cb of cbs) cb(...args);
        },
        loadURL: async (url) => {
          this.mainFrame.url = url;
          this.loadedURL = url;
        },
        executeJavaScript: async () => {}
      };
      this.webContents.sender = this.webContents;
    }
    async loadURL(url) {
      this.loadedURL = url;
      this.mainFrame.url = url;
      return await this.webContents.loadURL(url);
    }
    isMinimized() { return false; }
    restore() {}
    focus() {}
    close() {
      this.emit('closed');
    }
    on(evt, cb) {
      this.onEvents = this.onEvents || new Map();
      if (!this.onEvents.has(evt)) this.onEvents.set(evt, []);
      this.onEvents.get(evt).push(cb);
    }
    emit(evt, ...args) {
      const cbs = (this.onEvents && this.onEvents.get(evt)) || [];
      for (const cb of cbs) cb(...args);
    }
    static getAllWindows() {
      return mainWindowInstance ? [mainWindowInstance] : [];
    }
  }

  const mockElectron = {
    app,
    BrowserWindow: MockBrowserWindow,
    utilityProcess: {
      fork: () => childProcess
    },
    dialog: {
      showErrorBox: (title, message) => {
        dialogCalls.push({ title, message });
      }
    },
    shell: {
      openExternal: async (url) => {
        shellOpenCalls.push(url);
      }
    },
    ipcMain: {
      handle: (ch, handler) => {
        ipcHandlers.set(ch, handler);
      }
    }
  };

  const defaultMockFetch = async () => {
    return {
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => ({})
    };
  };

  return {
    app,
    mockElectron,
    MockChatGPTService,
    mockFetch: options.mockFetch || defaultMockFetch,
    childProcess,
    dialogCalls,
    shellOpenCalls,
    quitCalls,
    ipcHandlers,
    webContentsListeners,
    getWindowOpenHandler: () => windowOpenHandler,
    getChatGPTRef: () => chatGPTRef,
    getMainWindow: () => mainWindowInstance,
    emitWebContents: (evt, ...args) => {
      const cbs = webContentsListeners.get(evt) || [];
      for (const cb of cbs) cb(...args);
    },
    emitApp: (evt, ...args) => {
      const cbs = appListeners.get(evt) || [];
      for (const cb of cbs) cb(...args);
    }
  };
}

function runMainInVm(mockEnv, testDir) {
  const customRequire = (id) => {
    if (id === 'electron') return mockEnv.mockElectron;
    if (id === './chatgpt.cjs' || id.endsWith('chatgpt.cjs')) {
      return { ChatGPTService: mockEnv.MockChatGPTService };
    }
    if (id === 'net') {
      return {
        createServer: () => {
          let listeningCb;
          const srv = {
            listen: (port, host, cb) => {
              listeningCb = cb;
              setImmediate(() => {
                if (listeningCb) listeningCb();
              });
              return srv;
            },
            address: () => ({ port: 34567 }),
            close: (cb) => {
              setImmediate(() => {
                if (cb) cb();
              });
            },
            on: () => srv
          };
          return srv;
        }
      };
    }
    return require(id);
  };

  const customProcess = {
    ...process,
    argv: ['node', path.join(__dirname, 'main.cjs')],
    env: { ...process.env, TMPDIR: testDir },
    exit: (code) => mockEnv.app.exit(code)
  };

  const sandbox = {
    require: customRequire,
    process: customProcess,
    console,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
    URL,
    URLSearchParams,
    AbortController,
    TextEncoder,
    TextDecoder,
    fetch: mockEnv.mockFetch,
    __filename: path.join(__dirname, 'main.cjs'),
    __dirname: __dirname,
    module: { exports: {} },
    exports: {}
  };

  const context = vm.createContext(sandbox);
  const script = new vm.Script(getMainCjsCode(), { filename: 'main.cjs' });
  script.runInContext(context);
}

async function startApp(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syukatsu-main-test-'));
  try {
    const env = createMockEnvironment({ ...options, tempDir: dir });
    runMainInVm(env, dir);

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const win = env.getMainWindow();
      if (win && win.loadedURL) {
        break;
      }
      await new Promise(r => setTimeout(r, 10));
    }

    if (!env.getMainWindow() || !env.getMainWindow().loadedURL) {
      throw new Error('Timed out waiting for main app to initialize in test');
    }

    return { env, dir };
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

test('Child process exit: active exit triggers ChatGPT shutdown, ONE Japanese error dialog, and app.quit', async (t) => {
  const { env, dir } = await startApp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.strictEqual(env.getChatGPTRef().isShutdown, false);
  assert.strictEqual(env.dialogCalls.length, 0);

  // Unexpected exit while running
  env.childProcess.emit('exit', 1);

  // ChatGPT shutdown immediately
  assert.strictEqual(env.getChatGPTRef().isShutdown, true);

  // Exactly ONE Japanese error box explaining internal server stopped and restart app
  assert.strictEqual(env.dialogCalls.length, 1);
  const err = env.dialogCalls[0];
  assert.strictEqual(err.title, 'エラー');
  assert.match(err.message, /内部サーバーが停止しました/);
  assert.match(err.message, /再起動/);

  // App quit called
  assert.ok(env.quitCalls.length >= 1);

  // Subsequent exit does not show a second error dialog
  env.childProcess.emit('exit', 1);
  assert.strictEqual(env.dialogCalls.length, 1);
});

test('Child process exit: intentional quit (before-quit) shows no error dialogs', async (t) => {
  const { env, dir } = await startApp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  // Simulate intentional quit via before-quit
  env.app.emit('before-quit');

  // Child process exits
  env.childProcess.emit('exit', 0);

  // No error dialog shown
  assert.strictEqual(env.dialogCalls.length, 0);
});

test('Child process exit: startup failure leaves readiness detect/reject', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syukatsu-main-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  let envRef;
  const failingFetch = async () => {
    if (envRef) {
      envRef.childProcess.emit('exit', 1);
    }
    return { status: 500, arrayBuffer: async () => new ArrayBuffer(0) };
  };

  const env = createMockEnvironment({ tempDir: dir, mockFetch: failingFetch });
  envRef = env;
  runMainInVm(env, dir);

  // Wait for startup catch block to execute
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && env.dialogCalls.length === 0) {
    await new Promise(r => setTimeout(r, 10));
  }

  assert.strictEqual(env.dialogCalls.length, 1);
  assert.strictEqual(env.dialogCalls[0].title, 'Startup Error');
  assert.match(env.dialogCalls[0].message, /サーバープロセスが早期に終了しました/);
});

test('Navigation guards: will-navigate allows loopback and delegates external HTTP/HTTPS to shell.openExternal', async (t) => {
  const { env, dir } = await startApp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const win = env.getMainWindow();
  const origin = win.loadedURL;

  // Loopback navigation allowed
  let prevented = false;
  const loopbackEvent = { preventDefault: () => { prevented = true; } };
  env.emitWebContents('will-navigate', loopbackEvent, `${origin}/dashboard`);
  assert.strictEqual(prevented, false);
  assert.strictEqual(env.shellOpenCalls.length, 0);

  // External HTTP/HTTPS navigation prevented and opened externally
  prevented = false;
  const externalEvent = { preventDefault: () => { prevented = true; } };
  env.emitWebContents('will-navigate', externalEvent, 'https://example.com/external');
  assert.strictEqual(prevented, true);
  assert.strictEqual(env.shellOpenCalls.length, 1);
  assert.strictEqual(env.shellOpenCalls[0], 'https://example.com/external');

  // Invalid URL prevented
  prevented = false;
  const invalidEvent = { preventDefault: () => { prevented = true; } };
  env.emitWebContents('will-navigate', invalidEvent, 'invalid://url');
  assert.strictEqual(prevented, true);
});

test('Navigation guards: will-redirect allows loopback, blocks external and does NOT open external automatically', async (t) => {
  const { env, dir } = await startApp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const win = env.getMainWindow();
  const origin = win.loadedURL;

  // Loopback redirect allowed
  let prevented = false;
  const loopbackEvent = { preventDefault: () => { prevented = true; } };
  env.emitWebContents('will-redirect', loopbackEvent, `${origin}/auth/callback`);
  assert.strictEqual(prevented, false);
  assert.strictEqual(env.shellOpenCalls.length, 0);

  // External redirect blocked, NOT opened externally automatically
  prevented = false;
  const externalEvent = { preventDefault: () => { prevented = true; } };
  env.emitWebContents('will-redirect', externalEvent, 'https://evil.com/phish');
  assert.strictEqual(prevented, true);
  assert.strictEqual(env.shellOpenCalls.length, 0, 'Redirect targets must not open externally automatically');
});

test('Navigation guards: will-frame-navigate uses event.url, allows loopback, blocks external without opening', async (t) => {
  const { env, dir } = await startApp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const win = env.getMainWindow();
  const origin = win.loadedURL;

  // Loopback frame navigate allowed
  let prevented = false;
  const loopbackFrameEvent = {
    url: `${origin}/subframe`,
    preventDefault: () => { prevented = true; }
  };
  env.emitWebContents('will-frame-navigate', loopbackFrameEvent);
  assert.strictEqual(prevented, false);
  assert.strictEqual(env.shellOpenCalls.length, 0);

  // External frame navigate blocked, NOT opened externally
  prevented = false;
  const externalFrameEvent = {
    url: 'https://attacker.com/malicious-frame',
    preventDefault: () => { prevented = true; }
  };
  env.emitWebContents('will-frame-navigate', externalFrameEvent);
  assert.strictEqual(prevented, true);
  assert.strictEqual(env.shellOpenCalls.length, 0, 'Frame navigate must not open externally automatically');
});

test('Navigation guards regression: main frame event not prevented, then will-navigate prevents+opens exactly once; subframe false blocked/no shell', async (t) => {
  const { env, dir } = await startApp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const targetUrl = 'https://example.com/external';

  // Main frame will-frame-navigate: not prevented so will-navigate can handle it
  let framePrevented = false;
  const mainFrameEvent = {
    url: targetUrl,
    isMainFrame: true,
    preventDefault: () => { framePrevented = true; }
  };
  env.emitWebContents('will-frame-navigate', mainFrameEvent);
  assert.strictEqual(framePrevented, false, 'Main frame will-frame-navigate must not be prevented');
  assert.strictEqual(env.shellOpenCalls.length, 0);

  // Then will-navigate prevents and opens exactly once
  let navPrevented = false;
  const navEvent = {
    preventDefault: () => { navPrevented = true; }
  };
  env.emitWebContents('will-navigate', navEvent, targetUrl);
  assert.strictEqual(navPrevented, true, 'will-navigate must prevent navigation');
  assert.strictEqual(env.shellOpenCalls.length, 1, 'shell.openExternal must be called exactly once');
  assert.strictEqual(env.shellOpenCalls[0], targetUrl);

  // Subframe with isMainFrame: false is blocked and no shell call is made
  let subframePrevented = false;
  const subframeEvent = {
    url: 'https://attacker.com/nested',
    isMainFrame: false,
    preventDefault: () => { subframePrevented = true; }
  };
  env.emitWebContents('will-frame-navigate', subframeEvent);
  assert.strictEqual(subframePrevented, true, 'Subframe navigation must be blocked');
  assert.strictEqual(env.shellOpenCalls.length, 1, 'Subframe navigation must not trigger shell.openExternal');
});

test('Navigation guards: setWindowOpenHandler denies all in-app and opens external HTTP/HTTPS', async (t) => {
  const { env, dir } = await startApp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const handler = env.getWindowOpenHandler();
  assert.ok(handler, 'setWindowOpenHandler registered');

  // External https
  const res1 = handler({ url: 'https://example.com/help' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(res1)), { action: 'deny' });
  assert.strictEqual(env.shellOpenCalls.includes('https://example.com/help'), true);

  // Non-http denied and not opened
  env.shellOpenCalls.length = 0;
  const res2 = handler({ url: 'javascript:alert(1)' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(res2)), { action: 'deny' });
  assert.strictEqual(env.shellOpenCalls.length, 0);
});

test('IPC: foreign frame, foreign origin, and non-mainWindow sender are denied with Unauthorized; valid mainFrame allowed', async (t) => {
  const { env, dir } = await startApp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const win = env.getMainWindow();
  const getSessionHandler = env.ipcHandlers.get('desktop:getSession');
  assert.ok(getSessionHandler, 'desktop:getSession handler registered');

  // Foreign frame object (different reference than mainFrame)
  const foreignFrameEvent = {
    sender: win.webContents,
    senderFrame: { url: win.loadedURL }
  };
  await assert.rejects(async () => {
    await getSessionHandler(foreignFrameEvent);
  }, /Unauthorized/);

  // Foreign origin
  const foreignOriginEvent = {
    sender: win.webContents,
    senderFrame: { ...win.webContents.mainFrame, url: 'https://evil.com/page' }
  };
  await assert.rejects(async () => {
    await getSessionHandler(foreignOriginEvent);
  }, /Unauthorized/);

  // Wrong sender
  const wrongSenderEvent = {
    sender: {},
    senderFrame: win.webContents.mainFrame
  };
  await assert.rejects(async () => {
    await getSessionHandler(wrongSenderEvent);
  }, /Unauthorized/);

  // Valid mainFrame and expectedOrigin
  const validEvent = {
    sender: win.webContents,
    senderFrame: win.webContents.mainFrame
  };
  const session = await getSessionHandler(validEvent);
  assert.deepStrictEqual(session, { connected: true });
});
