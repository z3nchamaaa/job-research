const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function inspect(root) {
  const sizes = { total: 0, backend: 0, runtime: 0, host: 0 };
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error('Unexpected package symlink');
      if (entry.isDirectory()) { walk(file); continue; }
      if (/^(electron\.exe|msedgewebview2\.exe|chrome\.dll|libcef\.dll|auth\.enc.*|career-profile.*\.json|host_id\.txt|syukatsu\.db.*|dev\.db.*|\.env.*)$/i.test(entry.name)) throw Error('Unexpected browser runtime or user data: ' + path.relative(root, file));
      const bytes = fs.statSync(file).size;
      const part = path.relative(root, file).split(path.sep)[0];
      sizes.total += bytes;
      sizes[part === 'runtime' || part === 'backend' ? part : 'host'] += bytes;
    }
  }
  walk(root);
  for (const file of ['JobResearch.WebView.exe', 'runtime/server.js', 'runtime/template.db', 'runtime/bin/win-x64/node.exe', 'backend/backend.cjs', 'backend/bridge.js', 'backend/updater.cjs', 'backend/app-version.json']) {
    if (!fs.existsSync(path.join(root, file))) throw Error('Missing package file: ' + file);
  }
  return sizes;
}
if (require.main === module) {
  const sizes = inspect(path.resolve(process.argv[2]));
  const installer = path.resolve(process.argv[3]);
  const bytes = fs.readFileSync(installer);
  console.log(JSON.stringify({ evergreen: true, browserRuntimeBundled: false, unpackedBytes: sizes, installerBytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }, null, 2));
}
module.exports = { inspect };
