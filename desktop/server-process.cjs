const path = require('node:path');
const fs = require('node:fs');
const { fork } = require('node:child_process');

function serverEnvironment(source) {
  const allowed = new Set(['PATH', 'HOME', 'USER', 'LANG', 'TMPDIR',
    'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA']);
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key.toUpperCase())));
}

function startServer({ platform, arch, serverPath, env, utilityProcess }, dependencies = {}) {
  if (platform !== 'win32' || arch !== 'arm64') {
    return utilityProcess.fork(serverPath, [], { env });
  }
  const runtimeDir = path.dirname(serverPath);
  const execPath = path.join(runtimeDir, 'bin', 'win-x64', 'node.exe');
  if (!(dependencies.existsSync || fs.existsSync)(execPath)) {
    throw new Error('Windows ARM64用の互換ランタイムが見つかりません。アプリを再インストールしてください。');
  }
  // x64 Nodeを直接起動する。シェル・PATH探索・外部のNodeインストールは使わない。
  return (dependencies.fork || fork)(path.join(runtimeDir, 'server-parent.cjs'), [], {
    execPath,
    execArgv: [],
    env,
    cwd: runtimeDir,
    silent: true,
    windowsHide: true,
    detached: false
  });
}

module.exports = { serverEnvironment, startServer };
