const { app, BrowserWindow, utilityProcess, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const net = require('net');
const os = require('os');
const { ChatGPTService } = require('./chatgpt.cjs');
const { CareerProfileStore } = require('./career-profile.cjs');
const { serverEnvironment, startServer } = require('./server-process.cjs');

app.setName('就活トラッカー');
const getAppIconPath = () => app.isPackaged
  ? path.join(process.resourcesPath, 'branding', 'app-icon.png')
  : path.join(__dirname, '..', 'assets', 'icons', 'app-icon.png');
const isSmokeTest = process.argv.includes('--smoke-test');

if (isSmokeTest) {
  if (app.isPackaged) {
    console.error('Smoke tests cannot be run on packaged app.');
    process.exit(1);
  }
  const testUserData = process.env.SYUKATSU_TEST_USER_DATA;
  const rel = testUserData ? path.relative(os.tmpdir(), path.resolve(testUserData)) : '';
  const isUnderTmp = Boolean(
    testUserData &&
    path.isAbsolute(testUserData) &&
    rel !== '' &&
    !rel.startsWith('..') &&
    !path.isAbsolute(rel)
  );
  if (!isUnderTmp) {
    console.error('Smoke tests require absolute SYUKATSU_TEST_USER_DATA under os.tmpdir().');
    process.exit(1);
  }
  app.setPath('userData', testUserData);
} else {
  app.setPath('userData', path.join(app.getPath('appData'), 'syukatsu-tracker-desktop'));
}

let mainWindow;
let serverProcess;
let chatGPTService;
let careerProfileStore;
let expectedOrigin = '';

function getCareerProfileStore() {
  if (!careerProfileStore) {
    careerProfileStore = new CareerProfileStore(app.getPath('userData'));
  }
  return careerProfileStore;
}
let childExited = false;
let serverLogs = [];
let isQuitting = false;
let isServerReady = false;
let serverErrorShown = false;
const DESKTOP_AUTH_TOKEN = crypto.randomBytes(32).toString('hex');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock && !isSmokeTest) {
  app.quit();
  process.exit(0);
}

if (!isSmokeTest) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function checkServerReady(port, token) {
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 30000;
  
  while (Date.now() < deadline) {
    if (childExited) {
      throw new Error('サーバープロセスが早期に終了しました。\n' + serverLogs.join(''));
    }
    let timeoutId;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(url, {
        headers: { 'x-desktop-token': token },
        signal: controller.signal
      });
      try {
        if (res.body?.cancel) {
          await res.body.cancel();
        } else {
          await res.arrayBuffer();
        }
      } catch (e) {}
      if (res.status === 200) {
        return true;
      }
    } catch (e) {
      // ignore
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
    if (childExited) {
      throw new Error('サーバープロセスが早期に終了しました。\n' + serverLogs.join(''));
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function runSmokeTests(port) {
  try {
    const url = `http://127.0.0.1:${port}/api/companies`;
    const res = await fetch(url, { headers: { 'x-desktop-token': DESKTOP_AUTH_TOKEN } });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = await res.json();
    if (data.success !== true || !Array.isArray(data.companies) || data.companies.length !== 0) {
      throw new Error('Invalid response from /api/companies');
    }

    expectedOrigin = `http://127.0.0.1:${port}`;
    mainWindow = new BrowserWindow({
      show: false,
      icon: getAppIconPath(),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
      { urls: [`${expectedOrigin}/*`] },
      (details, callback) => {
        details.requestHeaders['x-desktop-token'] = DESKTOP_AUTH_TOKEN;
        callback({ requestHeaders: details.requestHeaders });
      }
    );

    await mainWindow.loadURL(expectedOrigin);
    await mainWindow.webContents.executeJavaScript('window.syukatsuDesktop.getSession()');

    console.log('Smoke test success.');
    app.quit();
  } catch (err) {
    console.error('Smoke test failed:', err);
    if (serverProcess) {
      serverProcess.kill();
    }
    if (chatGPTService) {
      chatGPTService.shutdown();
    }
    app.exit(1);
  }
}

async function createWindow(port) {
  if (isSmokeTest) return runSmokeTests(port);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  expectedOrigin = `http://127.0.0.1:${port}`;

  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: [`${expectedOrigin}/*`] },
    (details, callback) => {
      details.requestHeaders['x-desktop-token'] = DESKTOP_AUTH_TOKEN;
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  mainWindow.webContents.session.webRequest.onHeadersReceived(
    { urls: [`${expectedOrigin}/*`] },
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-src 'none'"]
        }
      });
    }
  );

  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(false); // Deny by default
  });
  
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    return false; // Deny by default
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') {
        shell.openExternal(parsedUrl.href);
      }
    } catch (e) {}
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const targetUrl = url || event?.url;
      const parsedUrl = new URL(targetUrl);
      if (parsedUrl.origin !== expectedOrigin) {
        event.preventDefault();
        if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') {
          shell.openExternal(parsedUrl.href);
        }
      }
    } catch (e) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('will-redirect', (event, url) => {
    try {
      const targetUrl = url || event?.url;
      const parsedUrl = new URL(targetUrl);
      if (parsedUrl.origin !== expectedOrigin) {
        event.preventDefault();
      }
    } catch (e) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame === true) return;
    try {
      const parsedUrl = new URL(event.url);
      if (parsedUrl.origin !== expectedOrigin) {
        event.preventDefault();
      }
    } catch (e) {
      event.preventDefault();
    }
  });

  await mainWindow.loadURL(expectedOrigin);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function validateSender(event) {
  if (!serverProcess || !mainWindow) return false;
  if (event.sender !== mainWindow.webContents) return false;
  if (event.senderFrame !== mainWindow.webContents.mainFrame) return false;
  
  try {
    const origin = new URL(event.senderFrame.url).origin;
    return origin === expectedOrigin;
  } catch(e) {
    return false;
  }
}

app.whenReady().then(async () => {
  try {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true, mode: 0o700 });
    }
    
    const dbPath = path.join(userDataPath, 'syukatsu.db');
    
    if (!fs.existsSync(dbPath)) {
      const templatePath = app.isPackaged 
        ? path.join(process.resourcesPath, 'runtime', 'template.db')
        : path.join(__dirname, '..', 'desktop-runtime', 'template.db');
        
      if (fs.existsSync(templatePath)) {
        fs.copyFileSync(templatePath, dbPath);
        fs.chmodSync(dbPath, 0o600);
      } else {
        throw new Error('Database template not found');
      }
    }

    chatGPTService = new ChatGPTService({
      userDataPath: userDataPath,
      openExternal: async (url) => {
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            await shell.openExternal(parsed.href);
          }
        } catch(e) {
          throw new Error('Invalid URL');
        }
      }
    });

    ipcMain.handle('desktop:getSession', (event) => {
      if (!validateSender(event)) throw new Error('Unauthorized');
      return chatGPTService.getSession();
    });
    ipcMain.handle('desktop:signIn', (event) => {
      if (!validateSender(event)) throw new Error('Unauthorized');
      return chatGPTService.signIn();
    });
    ipcMain.handle('desktop:cancelSignIn', (event) => {
      if (!validateSender(event)) throw new Error('Unauthorized');
      return chatGPTService.cancelSignIn();
    });
    ipcMain.handle('desktop:signOut', (event) => {
      if (!validateSender(event)) throw new Error('Unauthorized');
      return chatGPTService.signOut();
    });
    ipcMain.handle('desktop:listModels', (event) => {
      if (!validateSender(event)) throw new Error('Unauthorized');
      return chatGPTService.listModels();
    });
    ipcMain.handle('desktop:generate', (event, request) => {
      if (!validateSender(event)) throw new Error('Unauthorized');
      return chatGPTService.generate(request);
    });
    ipcMain.handle('desktop:openUsage', (event) => {
      if (!validateSender(event)) throw new Error('Unauthorized');
      return chatGPTService.openUsage();
    });
    ipcMain.handle('desktop:getCareerProfile', (event) => {
      if (!validateSender(event)) throw new Error('Unauthorized');
      return getCareerProfileStore().getProfile();
    });
    ipcMain.handle('desktop:saveCareerProfile', (event, profile) => {
      if (!validateSender(event)) throw new Error('Unauthorized');
      return getCareerProfileStore().saveProfile(profile);
    });

    const port = await getFreePort();
    
    const serverPath = app.isPackaged
      ? path.join(process.resourcesPath, 'runtime', 'server.js')
      : path.join(__dirname, '..', 'desktop-runtime', 'server.js');

    serverProcess = startServer({
      platform: process.platform,
      arch: process.arch,
      serverPath,
      utilityProcess,
      env: {
        ...serverEnvironment(process.env),
        NODE_ENV: 'production',
        HOSTNAME: '127.0.0.1',
        PORT: port.toString(),
        DATABASE_URL: `file:${dbPath}`,
        DESKTOP_RUNTIME: '1',
        DESKTOP_AUTH_TOKEN: DESKTOP_AUTH_TOKEN
      }
    });

    serverProcess.on('error', (err) => {
      serverLogs.push(err.message);
      childExited = true;
      if (isQuitting || !isServerReady || serverErrorShown) return;
      serverErrorShown = true;
      dialog.showErrorBox('エラー', '内部サーバーでエラーが発生しました。アプリを再起動してください。');
      app.quit();
    });

    if (serverProcess.stderr) {
      serverProcess.stderr.on('data', (data) => {
        serverLogs.push(data.toString());
        if (serverLogs.length > 50) serverLogs.shift();
      });
    }

    serverProcess.on('exit', (code) => {
      childExited = true;
      console.log(`Server process exited with code ${code}`);
      if (isQuitting) return;
      if (isServerReady && !serverErrorShown) {
        serverErrorShown = true;
        if (chatGPTService) {
          chatGPTService.shutdown();
        }
        dialog.showErrorBox('エラー', '内部サーバーが停止しました。アプリケーションを再起動してください。');
        app.quit();
      }
    });

    const isReady = await checkServerReady(port, DESKTOP_AUTH_TOKEN);
    if (!isReady) {
      throw new Error('Next.js server failed to start or respond in time.');
    }

    isServerReady = true;
    await createWindow(port);
  } catch (err) {
    if (isSmokeTest) {
      console.error(err);
      if (serverProcess) {
        serverProcess.kill();
      }
      app.exit(1);
    } else {
      dialog.showErrorBox('Startup Error', err.message);
      app.quit();
    }
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  isQuitting = true;
  app.quit();
});

app.on('will-quit', () => {
  if (chatGPTService) {
    chatGPTService.shutdown();
  }
  if (serverProcess) {
    serverProcess.kill();
  }
});

if (!isSmokeTest) {
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      app.quit();
    }
  });
}
