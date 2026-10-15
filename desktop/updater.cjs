const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO = 'z3nchamaaa/job-research';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const MAX_PACKAGE = 1024 * 1024 * 1024;
function version(value) {
  if (typeof value !== 'string' || value.length > 64) return null;
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  return match ? match.slice(1).map(BigInt) : null;
}
function newer(candidate, current) {
  const a = version(candidate), b = version(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
function packageName(tag, platform, arch, format) {
  if (!version(tag)) return null;
  const v = tag.replace(/^v/, '');
  if (platform === 'win32' && ['x64','arm64'].includes(arch)) return `job-research-${v}-win-${arch}.exe`;
  if (platform === 'darwin' && arch === 'arm64') return `job-research-${v}-mac-arm64.dmg`;
  if (platform === 'linux' && arch === 'x64' && format === 'deb') return `job-research-${v}-linux-amd64.deb`;
  if (platform === 'linux' && arch === 'x64' && format === 'rpm') return `job-research-${v}-linux-x86_64.rpm`;
  return null;
}
function trustedDownload(value, tag, name) {
  return value === `https://github.com/${REPO}/releases/download/${tag}/${name}`;
}
function safeRedirect(value) {
  const u = new URL(value);
  return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
    ['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname);
}
async function boundedText(response, max) {
  let bytes = 0, parts = [];
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > max) throw Error('更新情報が大きすぎます。');
    parts.push(Buffer.from(chunk));
  }
  return Buffer.concat(parts).toString('utf8');
}

class AppUpdater {
  constructor(options) {
    this.current = options.version;
    this.platform = options.platform || process.platform;
    this.arch = options.arch || process.arch;
    this.format = options.format;
    this.directory = path.join(options.userDataPath, 'updates');
    this.fetch = options.fetch || fetch;
    this.openInstaller = options.openInstaller;
    this.selection = null;
    this.downloaded = null;
    this.operation = null;
    this.controller = null;
    this.lastCheck = 0;
    this.state = { currentVersion: this.current, status: 'idle', available: false, progress: 0 };
  }
  getStatus() { return { ...this.state }; }
  async request(url, maxTime = 20000) {
    for (let i = 0; i < 6; i++) {
      const response = await this.fetch(url, { redirect: 'manual', headers: { Accept: url === API ? 'application/vnd.github+json' : 'application/octet-stream', 'User-Agent': 'JobResearch-Updater' }, signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(maxTime)]) });
      if ([301,302,303,307,308].includes(response.status)) {
        const next = new URL(response.headers.get('location'), url).href;
        await response.body?.cancel();
        if (!safeRedirect(next)) throw Error('更新ファイルの転送先を確認できませんでした。');
        url = next; continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw Error(response.status === 403 || response.status === 429 ? '更新確認の利用制限に達しました。少し時間を置いてお試しください。' : '更新情報を取得できませんでした。');
      }
      return response;
    }
    throw Error('更新ファイルを取得できませんでした。');
  }
  run(action) {
    if (this.operation) return this.operation;
    this.controller = new AbortController();
    this.operation = action().catch(error => {
      this.state = { ...this.state, status: 'error', error: error.message && /[\u3040-\u30ff\u4e00-\u9fff]/.test(error.message) ? error.message : '更新処理に失敗しました。接続を確認して、もう一度お試しください。' };
      return this.getStatus();
    }).finally(() => { this.operation = null; });
    return this.operation;
  }
  check() {
    if (this.operation || ['ready','opened'].includes(this.state.status)) return this.operation || Promise.resolve(this.getStatus());
    if (Date.now() - this.lastCheck < 60000) return Promise.resolve(this.getStatus());
    return this.run(async () => {
      this.state = { currentVersion: this.current, status: 'checking', available: false, progress: 0 };
      this.selection = null;
      const release = JSON.parse(await boundedText(await this.request(API), 2 * 1024 * 1024));
      if (release.draft || release.prerelease || !version(release.tag_name)) throw Error('正式版の更新情報を確認できませんでした。');
      if (!newer(release.tag_name, this.current)) { this.lastCheck = Date.now(); this.state.status = 'current'; return this.getStatus(); }
      const name = packageName(release.tag_name, this.platform, this.arch, this.format);
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const matches = assets.filter(a => a.name === name);
      const asset = matches[0];
      if (!name || matches.length !== 1 || asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > MAX_PACKAGE || !trustedDownload(asset.browser_download_url, release.tag_name, name) || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) {
        throw Error('この端末向けの検証可能な更新ファイルが見つかりませんでした。');
      }
      this.selection = Object.freeze({ tag: release.tag_name, name, url: asset.browser_download_url, size: asset.size, digest: asset.digest.slice(7) });
      this.lastCheck = Date.now();
      this.state = { ...this.state, status: 'available', available: true, latestVersion: release.tag_name.replace(/^v/, ''), size: asset.size, releaseNotes: typeof release.body === 'string' ? release.body.slice(0,30000) : '', releaseUrl: `https://github.com/${REPO}/releases/tag/${release.tag_name}` };
      return this.getStatus();
    });
  }
  download() {
    if (this.operation) return this.operation;
    if (this.downloaded) return Promise.resolve(this.getStatus());
    if (!this.selection) return Promise.reject(Error('先に更新を確認してください。'));
    return this.run(async () => {
      const asset = this.selection;
      this.state = { ...this.state, status: 'downloading', error: undefined, progress: 0 };
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      // Remove only week-old directories created by this updater, never user DB/profile files.
      for (const entry of fs.readdirSync(this.directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.isSymbolicLink() || !/^release-[a-zA-Z0-9]{6}$/.test(entry.name)) continue;
        const cached = path.join(this.directory, entry.name);
        try { if (Date.now() - fs.lstatSync(cached).mtimeMs > 7 * 86400000) fs.rmSync(cached, { recursive: true }); } catch { /* Installer may still have the file open. */ }
      }
      const folder = fs.mkdtempSync(path.join(this.directory, 'release-'));
      const file = path.join(folder, asset.name);
      let handle;
      try {
        const response = await this.request(asset.url, 15 * 60 * 1000);
        const sizeHeader = response.headers.get('content-length');
        if (sizeHeader !== null && Number(sizeHeader) !== asset.size) { await response.body.cancel(); throw Error('更新ファイルのサイズが一致しません。'); }
        handle = fs.openSync(file, 'wx', 0o600);
        const hash = crypto.createHash('sha256');
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > asset.size) throw Error('更新ファイルのサイズが一致しません。');
          hash.update(chunk);
          fs.writeFileSync(handle, chunk);
          this.state.progress = Math.floor(size / asset.size * 100);
        }
        fs.closeSync(handle); handle = undefined;
        if (size !== asset.size || hash.digest('hex') !== asset.digest) throw Error('更新ファイルのチェックサムが一致しません。インストールを中止しました。');
        this.downloaded = { ...asset, file };
        this.state.status = 'ready'; this.state.progress = 100;
        return this.getStatus();
      } catch (error) {
        if (handle !== undefined) fs.closeSync(handle);
        fs.rmSync(folder, { recursive: true, force: true });
        throw error;
      }
    });
  }
  async install() {
    if (this.operation || this.installing || !this.downloaded || this.state.status !== 'ready') throw Error('更新ファイルのダウンロードを完了してください。');
    this.installing = true;
    const item = this.downloaded;
    try {
      try {
        const stat = fs.lstatSync(item.file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== item.size) throw Error();
        const hash = crypto.createHash('sha256');
        let bytes = 0;
        for await (const chunk of fs.createReadStream(item.file)) {
          bytes += chunk.length;
          if (bytes > item.size) throw Error();
          hash.update(chunk);
        }
        if (bytes !== item.size || hash.digest('hex') !== item.digest) throw Error();
      } catch {
        this.downloaded = null;
        this.state = { ...this.state, status: 'error', error: '更新ファイルを確認できません。もう一度ダウンロードしてください。' };
        throw Error(this.state.error);
      }
      const result = await this.openInstaller(item.file);
      // WebView2 performs the actual launch in its native host, outside the Node Job Object.
      if (!result?.installerPath) this.state.status = 'opened';
      return result;
    } finally {
      this.installing = false;
    }
  }
  shutdown() { this.controller?.abort(); }
}
module.exports = { AppUpdater, newer, packageName, safeRedirect };
