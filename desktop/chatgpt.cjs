const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');

class ChatGPTService {
  constructor(options) {
    this.userDataPath = options.userDataPath;
    this.openExternal = options.openExternal;
    this.safeStorage = options.safeStorage;
    if (!this.safeStorage) {
      try {
        this.safeStorage = require('electron').safeStorage;
      } catch (e) {}
    }
    if (!this.safeStorage) {
      throw new Error('OSの暗号化機能（safeStorage）が利用できません。');
    }
    this.fetch = options.fetch || fetch;
    this.jwtVerify = options.jwtVerify;
    this.createRemoteJWKSet = options.createRemoteJWKSet;
    
    this.authFilePath = path.join(this.userDataPath, 'auth.enc');
    this.hostIdFilePath = path.join(this.userDataPath, 'host_id.txt');
    
    this.pendingLogin = null;
    this.generateAbortController = null;
    this.refreshPromise = null;
    this.refreshAbortController = null;
    
    this.authLoadError = null;
    this.epoch = 0;

    this.hostId = this._loadHostId();
    this.authData = this._loadAuth();
  }

  _loadHostId() {
    if (fs.existsSync(this.hostIdFilePath)) {
      return fs.readFileSync(this.hostIdFilePath, 'utf-8');
    }
    const newId = `urn:uuid:${crypto.randomUUID()}`;
    fs.writeFileSync(this.hostIdFilePath, newId, { encoding: 'utf-8', mode: 0o600 });
    return newId;
  }

  _loadAuth() {
    if (!fs.existsSync(this.authFilePath)) return null;
    
    if (this.safeStorage && !this.safeStorage.isEncryptionAvailable()) {
      this.authLoadError = new Error('OSの暗号化機能が利用できません。アプリの権限等を確認してください。');
      return null;
    }
    
    try {
      const encrypted = fs.readFileSync(this.authFilePath);
      const decrypted = this.safeStorage.decryptString(encrypted);
      const data = JSON.parse(decrypted);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid format');
      if (data.access_token && typeof data.access_token !== 'string') throw new Error('Invalid token');
      if (data.clientId && typeof data.clientId !== 'string') throw new Error('Invalid clientId');
      return data;
    } catch (err) {
      this.authLoadError = new Error('認証データの復号に失敗しました。キーチェーン等が変更された可能性があります。');
      return null;
    }
  }

  _saveAuth(data, currentEpoch) {
    if (currentEpoch !== undefined && currentEpoch !== this.epoch) {
      throw new Error('stale epoch');
    }
    
    if (this.safeStorage && !this.safeStorage.isEncryptionAvailable()) {
      throw new Error('OSの暗号化機能が利用できないため、認証データを保存できません。');
    }
    
    const encrypted = this.safeStorage.encryptString(JSON.stringify(data));
    const tempPath = `${this.authFilePath}.tmp`;
    
    fs.writeFileSync(tempPath, encrypted, { mode: 0o600 });
    fs.chmodSync(tempPath, 0o600);
    fs.renameSync(tempPath, this.authFilePath);
    this.authData = data;
    this.authLoadError = null;
  }

  _hasSharingGrant(scopes) {
    if (!scopes || !Array.isArray(scopes)) return false;
    return scopes.includes('chatgpt.tokens.use.direct') && scopes.includes('resource.invoke');
  }

  getSession() {
    if (this.authLoadError) {
      throw this.authLoadError;
    }
    if (!this.authData) {
      return { connected: false, sharing: false, email: undefined };
    }
    const hasTokens = !!this.authData.access_token || !!this.authData.refresh_token;
    return {
      connected: hasTokens,
      sharing: hasTokens ? this._hasSharingGrant(this.authData.scopes) : false,
      email: typeof this.authData.email === 'string' ? this.authData.email : undefined
    };
  }

  shutdown() {
    this.epoch++;
    if (this.generateAbortController) {
      this.generateAbortController.abort();
      this.generateAbortController = null;
    }
    if (this.refreshAbortController) {
      this.refreshAbortController.abort();
      this.refreshAbortController = null;
    }
    this.refreshPromise = null;
    if (this.pendingLogin) {
      if (this.pendingLogin.timeoutId) clearTimeout(this.pendingLogin.timeoutId);
      if (this.pendingLogin.ac) this.pendingLogin.ac.abort();
      this.pendingLogin.reject(new Error('シャットダウンによりキャンセルされました。'));
      if (this.pendingLogin.server) this.pendingLogin.server.close();
      this.pendingLogin = null;
    }
  }

  async signOut() {
    this.epoch++;
    if (this.generateAbortController) {
      this.generateAbortController.abort();
      this.generateAbortController = null;
    }
    if (this.refreshAbortController) {
      this.refreshAbortController.abort();
      this.refreshAbortController = null;
    }
    this.refreshPromise = null;
    if (this.pendingLogin) {
      if (this.pendingLogin.timeoutId) clearTimeout(this.pendingLogin.timeoutId);
      if (this.pendingLogin.ac) this.pendingLogin.ac.abort();
      this.pendingLogin.reject(new Error('サインアウトによりキャンセルされました。'));
      if (this.pendingLogin.server) this.pendingLogin.server.close();
      this.pendingLogin = null;
    }
    
    if (this.authLoadError) {
      throw this.authLoadError;
    }

    if (!this.authData) {
      return { remoteRevoked: true };
    }

    const snapshotAuthData = this.authData;
    
    this._saveAuth({
      clientId: snapshotAuthData.clientId,
      sub: snapshotAuthData.sub,
      issuer: snapshotAuthData.issuer,
      email: snapshotAuthData.email
    }, this.epoch);

    if (!snapshotAuthData.refresh_token) {
      return { remoteRevoked: true };
    }

    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), 8000);

    let remoteRevoked = false;
    try {
      let discoEndpoint = null;
      let attemptDisco = 0;
      while (attemptDisco < 2) {
        try {
          const discoRes = await this.fetch('https://auth.openai.com/.well-known/openid-configuration', {
            redirect: 'error',
            signal: ac.signal
          });
          if (discoRes.ok) {
            const discoData = await discoRes.json();
            discoEndpoint = discoData.revocation_endpoint;
            break;
          }
          if (discoRes.status >= 500) {
             throw new Error();
          }
          break;
        } catch (e) {
          if (ac.signal.aborted) break;
          attemptDisco++;
          if (attemptDisco < 2) {
            await new Promise(r => setTimeout(r, 100));
          }
        }
      }
      
      if (!discoEndpoint || typeof discoEndpoint !== 'string') throw new Error();
      
      const revokeUrl = new URL(discoEndpoint);
      if (revokeUrl.protocol !== 'https:' || revokeUrl.hostname !== 'auth.openai.com' || revokeUrl.port !== '' || revokeUrl.username || revokeUrl.password) {
        throw new Error();
      }

      const body = new URLSearchParams({
        token: snapshotAuthData.refresh_token,
        token_type_hint: 'refresh_token',
        client_id: snapshotAuthData.clientId
      });

      let attemptRevoke = 0;
      while (attemptRevoke < 2) {
        try {
          const revokeRes = await this.fetch(revokeUrl.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            redirect: 'error',
            signal: ac.signal
          });
          if (revokeRes.status === 200) {
            remoteRevoked = true;
            break;
          }
          if (revokeRes.status >= 500) {
             throw new Error();
          }
          break;
        } catch (e) {
          if (ac.signal.aborted) break;
          attemptRevoke++;
          if (attemptRevoke < 2) {
            await new Promise(r => setTimeout(r, 100));
          }
        }
      }
    } catch (e) {
      // Ignored
    } finally {
      clearTimeout(timeoutId);
    }
    
    return { remoteRevoked };
  }

  async cancelSignIn() {
    this.epoch++;
    this.refreshPromise = null;
    if (this.refreshAbortController) {
      this.refreshAbortController.abort();
      this.refreshAbortController = null;
    }
    if (this.pendingLogin) {
      if (this.pendingLogin.timeoutId) clearTimeout(this.pendingLogin.timeoutId);
      if (this.pendingLogin.ac) this.pendingLogin.ac.abort();
      this.pendingLogin.reject(new Error('ログインがキャンセルされました。'));
      if (this.pendingLogin.server) this.pendingLogin.server.close();
      this.pendingLogin = null;
    }
  }

  async signIn() {
    if (this.authLoadError) throw this.authLoadError;
    if (this.pendingLogin) throw new Error('既にログイン処理が進行中です。');
    if (this.refreshAbortController) {
      this.refreshAbortController.abort();
      this.refreshAbortController = null;
    }
    this.refreshPromise = null;
    
    this.epoch++;
    const currentEpoch = this.epoch;

    const state = crypto.randomBytes(32).toString('base64url');
    const nonce = crypto.randomBytes(32).toString('base64url');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    return new Promise((resolve, reject) => {
      const ac = new AbortController();
      let timeoutId;
      
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (server) {
          server.close();
        }
        if (this.pendingLogin && this.pendingLogin.state === state) {
          this.pendingLogin = null;
        }
      };

      const server = http.createServer(async (req, res) => {
        if (currentEpoch !== this.epoch) return;

        try {
          const url = new URL(req.url, `http://127.0.0.1:${server.address().port}`);
          if (req.method !== 'GET' || url.pathname !== '/auth/callback') {
            res.writeHead(404);
            res.end();
            return;
          }

          if (url.searchParams.get('state') !== state) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('State mismatch or unknown request.');
            return;
          }
          
          if (this.pendingLogin.consumed) {
             res.writeHead(409, { 'Content-Type': 'text/plain; charset=utf-8' });
             res.end('Callback already consumed.');
             return;
          }
          this.pendingLogin.consumed = true;

          if (url.searchParams.get('error')) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('認証が拒否されました。');
            throw new Error('OAuth Error: 認証が拒否されました。');
          }

          const code = url.searchParams.get('code');
          const issuedClientId = url.searchParams.get('client_id');

          if (!code) throw new Error('コードが提供されていません。');

          const isFirstTime = !this.authData || !this.authData.clientId;
          if (isFirstTime) {
            if (!issuedClientId || issuedClientId === 'dynamic_agent_client') {
              throw new Error('コールバックからのclient_idが不正です。');
            }
          } else if (issuedClientId && issuedClientId !== this.authData.clientId) {
            throw new Error('返却されたclient_idが一致しません。');
          }

          const currentClientId = isFirstTime ? issuedClientId : this.authData.clientId;
          
          if (isFirstTime) {
            this._saveAuth({
              clientId: currentClientId
            }, currentEpoch);
          }

          const redirectUri = `http://127.0.0.1:${server.address().port}/auth/callback`;

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body>アプリで認証を確認しています。このウィンドウを閉じてアプリに戻ってください。</body></html>');

          const tokenRes = await this.fetch('https://auth.openai.com/api/accounts/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: currentClientId,
              code,
              code_verifier: codeVerifier,
              redirect_uri: redirectUri,
              resource: 'https://api.openai.com/v1'
            }),
            signal: ac.signal
          });

          if (!tokenRes.ok) {
            throw new Error('トークンの交換に失敗しました。');
          }

          const tokenData = await tokenRes.json();
          if (currentEpoch !== this.epoch) throw new Error('操作がキャンセルされました。');
          if (ac.signal.aborted) throw new Error('操作がキャンセルされました。');

          if (!tokenData.id_token || typeof tokenData.id_token !== 'string') throw new Error('id_tokenが含まれていません。');
          if (typeof tokenData.token_type !== 'string' || tokenData.token_type.toLowerCase() !== 'bearer' || 
              !tokenData.access_token || typeof tokenData.access_token !== 'string' || 
              !Number.isFinite(tokenData.expires_in) || tokenData.expires_in <= 0 || 
              !tokenData.refresh_token || typeof tokenData.refresh_token !== 'string' ||
              !tokenData.scope || typeof tokenData.scope !== 'string') {
            throw new Error('無効なトークンレスポンスです。');
          }

          let jwtVerifyFn = this.jwtVerify;
          let createRemoteJWKSetFn = this.createRemoteJWKSet;
          
          if (!jwtVerifyFn) {
            const jose = await import('jose');
            jwtVerifyFn = jose.jwtVerify;
            createRemoteJWKSetFn = jose.createRemoteJWKSet;
          }
          
          const JWKS = createRemoteJWKSetFn(new URL('https://auth.openai.com/.well-known/jwks.json'));
          
          const { payload } = await jwtVerifyFn(tokenData.id_token, JWKS, {
            issuer: 'https://auth.openai.com',
            audience: currentClientId,
            requiredClaims: ['sub', 'exp', 'iat']
          });

          if (currentEpoch !== this.epoch) throw new Error('操作がキャンセルされました。');
          if (ac.signal.aborted) throw new Error('操作がキャンセルされました。');

          if (payload.nonce !== nonce) {
            throw new Error('Nonceが一致しません。');
          }

          if (this.authData && this.authData.sub && this.authData.issuer) {
            if (payload.sub !== this.authData.sub || payload.iss !== this.authData.issuer) {
              throw new Error('保存されているアイデンティティと一致しません。');
            }
          }

          const scopes = (typeof tokenData.scope === 'string') ? tokenData.scope.split(' ') : [];
          
          this._saveAuth({
            clientId: currentClientId,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: Date.now() + (tokenData.expires_in * 1000),
            scopes,
            sub: payload.sub,
            issuer: payload.iss,
            email: payload.email,
            id_token: tokenData.id_token
          }, currentEpoch);

          resolve();
          cleanup();
        } catch (err) {
          if (!res.headersSent) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('エラーが発生しました。');
          }
          if (currentEpoch === this.epoch) {
            reject(err);
            cleanup();
          }
        }
      });

      this.pendingLogin = {
        state,
        resolve,
        reject,
        ac,
        server,
        consumed: false
      };

      server.on('error', (err) => {
        if (currentEpoch === this.epoch) {
          reject(err);
          cleanup();
        }
      });

      server.listen(0, '127.0.0.1', async () => {
        if (currentEpoch !== this.epoch) {
          cleanup();
          return;
        }

        const port = server.address().port;
        const redirectUri = `http://127.0.0.1:${port}/auth/callback`;
        
        const isFirstTime = !this.authData || !this.authData.clientId;
        const clientId = isFirstTime ? 'dynamic_agent_client' : this.authData.clientId;
        
        const params = new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: redirectUri,
          scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
          state: state,
          nonce: nonce,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          resource: 'https://api.openai.com/v1',
          ext_agent_host_id: this.hostId
        });

        if (isFirstTime) {
          params.append('agent_name_hint', '就活Tracker');
        } else if (this.authData && typeof this.authData.id_token === 'string') {
          params.append('id_token_hint', this.authData.id_token);
        }

        const authUrl = `https://auth.openai.com/api/accounts/authorize?${params.toString()}`;
        
        if (currentEpoch === this.epoch) {
          timeoutId = setTimeout(() => {
            if (currentEpoch === this.epoch) {
              ac.abort();
              reject(new Error('ログインがタイムアウトしました。'));
              cleanup();
            }
          }, 3 * 60 * 1000);
          if (this.pendingLogin && this.pendingLogin.state === state) {
            this.pendingLogin.timeoutId = timeoutId;
          }
        }

        try {
          await this.openExternal(authUrl);
        } catch (err) {
          if (currentEpoch === this.epoch) {
            reject(new Error('ブラウザを開けませんでした。'));
            cleanup();
          }
        }
      });
    });
  }

  async _ensureToken(acSignal) {
    if (this.authLoadError) throw this.authLoadError;
    if (!this.authData || !this.authData.refresh_token) {
      throw new Error('未ログインです。ログインしてください。');
    }
    
    if (!this._hasSharingGrant(this.authData.scopes)) {
      throw new Error('権限が不足しています。');
    }

    if (acSignal && acSignal.aborted) {
      throw new Error('操作がキャンセルされました。');
    }

    if (Date.now() < this.authData.expires_at - 60000) {
      if (!this.authData.access_token) {
         throw new Error('無効なトークンレスポンスです。');
      }
      return this.authData.access_token;
    }

    const waitPromise = (promise, signal) => {
      if (!signal) return promise;
      return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new Error('操作がキャンセルされました。'));
        const abortHandler = () => {
          signal.removeEventListener('abort', abortHandler);
          reject(new Error('操作がキャンセルされました。'));
        };
        signal.addEventListener('abort', abortHandler);
        promise.then(
          res => { signal.removeEventListener('abort', abortHandler); resolve(res); },
          err => { signal.removeEventListener('abort', abortHandler); reject(err); }
        );
      });
    };

    if (this.refreshPromise) {
      return waitPromise(this.refreshPromise, acSignal);
    }

    const currentEpoch = this.epoch;
    const snapshotAuthData = this.authData;
    const refreshAc = new AbortController();
    this.refreshAbortController = refreshAc;
    const timeoutId = setTimeout(() => refreshAc.abort(), 60000);
    
    const refreshPromise = Promise.resolve().then(async () => {
      try {
        if (currentEpoch !== this.epoch || refreshAc.signal.aborted) throw new Error('操作がキャンセルされました。');
        
        const tokenRes = await this.fetch('https://auth.openai.com/api/accounts/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: snapshotAuthData.clientId,
            refresh_token: snapshotAuthData.refresh_token,
            resource: 'https://api.openai.com/v1'
          }),
          signal: refreshAc.signal
        });

        if (currentEpoch !== this.epoch) throw new Error('操作がキャンセルされました。');

        const tokenData = await tokenRes.json().catch(() => ({}));

        if (!tokenRes.ok) {
          const terminalErrors = ['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused'];
          if (terminalErrors.includes(tokenData.error)) {
             if (currentEpoch === this.epoch && !refreshAc.signal.aborted) {
               this._saveAuth({
                 clientId: snapshotAuthData.clientId,
                 sub: snapshotAuthData.sub,
                 issuer: snapshotAuthData.issuer,
                 email: snapshotAuthData.email
               }, currentEpoch);
             }
             throw new Error('認証の有効期限が切れました。再度ログインしてください。');
          }
          throw new Error('トークンの更新に失敗しました。');
        }

        if (currentEpoch !== this.epoch || refreshAc.signal.aborted) throw new Error('操作がキャンセルされました。');

        if (typeof tokenData.token_type !== 'string' || tokenData.token_type.toLowerCase() !== 'bearer' || 
            typeof tokenData.access_token !== 'string' || !tokenData.access_token ||
            !Number.isFinite(tokenData.expires_in) || tokenData.expires_in <= 0) {
           throw new Error('無効なトークンレスポンスです。');
        }

        const scopes = (typeof tokenData.scope === 'string') ? tokenData.scope.split(' ') : snapshotAuthData.scopes;

        this._saveAuth({
          ...snapshotAuthData,
          access_token: tokenData.access_token,
          refresh_token: (typeof tokenData.refresh_token === 'string' && tokenData.refresh_token) ? tokenData.refresh_token : snapshotAuthData.refresh_token,
          expires_at: Date.now() + (tokenData.expires_in * 1000),
          scopes,
          id_token: (typeof tokenData.id_token === 'string' && tokenData.id_token) ? tokenData.id_token : snapshotAuthData.id_token
        }, currentEpoch);

        return tokenData.access_token;
      } finally {
        clearTimeout(timeoutId);
        if (this.refreshAbortController === refreshAc) {
          this.refreshPromise = null;
          this.refreshAbortController = null;
        }
      }
    });

    this.refreshPromise = refreshPromise;
    return waitPromise(this.refreshPromise, acSignal);
  }

  async listModels() {
    const currentEpoch = this.epoch;
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 10000);
    try {
      const token = await this._ensureToken(ac.signal);
      if (currentEpoch !== this.epoch) throw new Error('操作がキャンセルされました。');
      const res = await this.fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: ac.signal
      });
      if (!res.ok) {
         if (res.status === 401 || res.status === 403) {
            throw new Error('モデルリストの取得権限がありません。再ログインしてください。');
         }
         throw new Error('モデルの取得に失敗しました。');
      }
      const data = await res.json();
      if (currentEpoch !== this.epoch) throw new Error('操作がキャンセルされました。');
      if (ac.signal.aborted) throw new Error('操作がキャンセルされました。');
      if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.models)) {
        throw new Error('無効なモデル形式です。');
      }
      return data.models
        .filter(m => m && typeof m.slug === 'string' && m.visibility === 'list')
        .map(m => ({ slug: m.slug, displayName: typeof m.display_name === 'string' ? m.display_name : m.slug }));
    } finally {
      clearTimeout(timeout);
    }
  }

  async generate(request) {
    if (!request || typeof request !== 'object') {
       throw new Error('リクエストが無効です。');
    }
    if (!request.model || typeof request.model !== 'string' || request.model.length > 100) {
      throw new Error('無効なモデル指定です。');
    }
    if (!request.input || typeof request.input !== 'string' || request.input.length < 20 || request.input.length > 100000) {
      throw new Error('入力サイズが制限を超えています（20〜100000文字）。');
    }
    if (request.instructions !== undefined) {
      if (typeof request.instructions !== 'string' || request.instructions.length < 1 || request.instructions.length > 30000) {
        throw new Error('インストラクションのサイズが制限を超えています（1〜30000文字）。');
      }
    }
    if (request.webSearch !== undefined && typeof request.webSearch !== 'boolean') {
      throw new Error('無効なwebSearch指定です。');
    }

    if (this.generateAbortController) {
      throw new Error('既に生成処理が実行中です。');
    }

    const currentEpoch = this.epoch;
    this.generateAbortController = new AbortController();
    const localAc = this.generateAbortController;

    const timeoutDuration = request.webSearch === true ? 180 * 1000 : 120 * 1000;
    const timeout = setTimeout(() => {
      localAc.abort();
    }, timeoutDuration);

    try {
      const token = await this._ensureToken(localAc.signal);
      if (currentEpoch !== this.epoch) throw new Error('操作がキャンセルされました。');

      const modelsRes = await this.fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: localAc.signal
      });
      if (!modelsRes.ok) {
         throw new Error('モデルカタログの取得に失敗しました。');
      }
      const modelsData = await modelsRes.json();
      if (currentEpoch !== this.epoch) throw new Error('操作がキャンセルされました。');
      if (localAc.signal.aborted) throw new Error('操作がキャンセルされました。');
      if (!modelsData || typeof modelsData !== 'object' || Array.isArray(modelsData) || !Array.isArray(modelsData.models)) {
         throw new Error('モデルカタログが不正です。');
      }
      const isValidModel = modelsData.models.some(m => m && typeof m.slug === 'string' && m.slug === request.model && m.visibility === 'list');
      if (!isValidModel) {
         throw new Error('指定されたモデルは現在利用できません。');
      }

      const requestBody = {
        model: request.model,
        input: [{ role: 'user', content: request.input }],
        store: false,
        stream: true
      };
      if (request.instructions !== undefined) {
        requestBody.instructions = request.instructions;
      }
      if (request.webSearch === true) {
        requestBody.tools = [{ type: 'web_search' }];
        requestBody.tool_choice = 'required';
      }
      
      const res = await this.fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: localAc.signal
      });

      if (!res.ok) {
        if (request.webSearch === true && (res.status === 400 || res.status === 403)) {
          throw new Error('Web検索がこのモデルまたはアカウントでは利用できない可能性があります。別のモデルを選ぶか、同じプロンプトをコピーしてChatGPTで実行してください。');
        }
        if (res.status === 401) {
           throw new Error('認証に失敗しました。再ログインしてください。');
        } else if (res.status === 403) {
           throw new Error('アクセス権限がありません。');
        } else if (res.status === 429) {
           throw new Error('リクエスト制限に達しました。しばらく待ってから再度お試しください。');
        } else if (res.status >= 500) {
           throw new Error('サーバーでエラーが発生しました。');
        }
        throw new Error('生成リクエストに失敗しました。');
      }

      const result = await parseSSE(res.body, localAc);
      if (currentEpoch !== this.epoch) throw new Error('操作がキャンセルされました。');
      if (localAc.signal.aborted) throw new Error('操作がキャンセルされました。');
      return result;

    } finally {
      clearTimeout(timeout);
      if (this.generateAbortController === localAc) {
        this.generateAbortController = null;
      }
    }
  }

  async openUsage() {
    await this.openExternal('https://chatgpt.com/settings/usage');
  }
}

async function parseSSE(body, ac) {
  if (ac.signal.aborted) throw new Error('生成処理がキャンセルされました。');
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';
  let completed = false;

  const abortHandler = () => {
    reader.cancel(new Error('生成処理がキャンセルされました。')).catch(() => {});
  };
  ac.signal.addEventListener('abort', abortHandler);

  try {
    while (!completed) {
      const { done, value } = await reader.read();
      if (ac.signal.aborted) throw new Error('生成処理がキャンセルされました。');
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 1000000) throw new Error('バッファサイズが制限を超えました。');
      }
      if (done) {
        buffer += decoder.decode();
      }

      while (!completed) {
        let boundaryMatch = buffer.match(/\r?\n\r?\n/);
        let block;
        if (boundaryMatch) {
          block = buffer.slice(0, boundaryMatch.index);
          buffer = buffer.slice(boundaryMatch.index + boundaryMatch[0].length);
        } else if (done && buffer.trim()) {
          block = buffer;
          buffer = '';
        } else {
          break;
        }

        if (!block.trim()) continue;

        const lines = block.split(/\r?\n/);
        let dataPayload = '';

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const dataStr = line.slice(line.startsWith('data: ') ? 6 : 5);
            if (dataStr === '[DONE]') {
              if (!completed) throw new Error('完了イベントを受信する前に終了しました。');
              break;
            }
            if (dataPayload.length > 0) dataPayload += '\n';
            dataPayload += dataStr;
          }
        }

        if (dataPayload) {
          let event;
          try {
            event = JSON.parse(dataPayload);
          } catch (e) {
            throw new Error('無効なJSONフォーマットです。');
          }

          if (!event || typeof event !== 'object' || Array.isArray(event) || !event.type) {
             throw new Error('無効なイベントフォーマットです。');
          }

          if (event.type === 'error' || event.error || event.response?.error) {
            throw new Error('生成が中断されたか、エラーが発生しました。');
          } else if (event.type === 'response.output_text.delta') {
            if (event.delta && typeof event.delta === 'string') {
              fullText += event.delta;
              if (fullText.length > 500000) {
                 throw new Error('出力サイズが制限を超えました。');
              }
            }
          } else if (event.type === 'response.completed') {
            completed = true;
            if (event.response?.status === 'incomplete' || event.response?.status === 'failed') {
              throw new Error('生成が中断されたか、エラーが発生しました。');
            }
            if (!fullText && event.response?.output) {
              for (const out of event.response.output) {
                 if (out.content) {
                   for (const c of out.content) {
                     if ((c.type === 'text' || c.type === 'output_text') && typeof c.text === 'string' && c.text) {
                        fullText += c.text;
                        if (fullText.length > 500000) throw new Error('出力サイズが制限を超えました。');
                     }
                   }
                 }
              }
            }
            break;
          } else if (event.type === 'response.failed' || event.type === 'response.incomplete') {
            throw new Error('生成が中断されたか、エラーが発生しました。');
          }
        }
      }
      if (done) break;
    }
  } finally {
    ac.signal.removeEventListener('abort', abortHandler);
    try {
      await reader.cancel();
    } catch(e) {}
  }

  if (!completed) {
    throw new Error('レスポンスが不完全です。');
  }
  if (!fullText) {
    throw new Error('生成されたテキストが空です。');
  }

  return fullText;
}

module.exports = { ChatGPTService, parseSSE };
