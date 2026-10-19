const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const knownUnpatched = new Set(['GHSA-vfj7-8cjw-p6xm', 'GHSA-hp3w-g68c-fv3c']);
const exceptionExpires = '2026-10-26T00:00:00Z';
function audit(args) {
  const windows = process.platform === 'win32';
  const command = args.length ? 'npm audit --json --omit=dev' : 'npm audit --json';
  const result = spawnSync(windows ? (process.env.ComSpec || 'cmd.exe') : 'npm', windows ? ['/d', '/s', '/c', command] : ['audit', '--json', ...args], {
    encoding: 'utf8', shell: false, timeout: 180000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || ![0,1].includes(result.status)) throw Error('npm audit could not complete');
  const report = JSON.parse(result.stdout);
  validateReport(report);
  return report;
}
function validateReport(report) {
  const counts = report.metadata?.vulnerabilities;
  const levels = ['info', 'low', 'moderate', 'high', 'critical'];
  if (report.error || !counts || !report.vulnerabilities || typeof report.vulnerabilities !== 'object' || Array.isArray(report.vulnerabilities) ||
      ![...levels, 'total'].every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0) ||
      levels.reduce((sum, key) => sum + counts[key], 0) !== counts.total ||
      !Object.values(report.vulnerabilities).every(item => Array.isArray(item.via))) throw Error('Invalid npm audit response');
}
function evaluate(production, all, now = Date.now()) {
const advisories = Object.values(all.vulnerabilities || {}).flatMap(item => item.via.filter(v => typeof v !== 'string'));
const unexpected = advisories.filter(item => !knownUnpatched.has(item.url?.split('/').pop()));
const summary = {
  checkedAt: new Date(now).toISOString(),
  exceptionExpires,
  production: production.metadata.vulnerabilities,
  allDependencies: all.metadata.vulnerabilities,
  unpatchedDevelopmentAdvisories: [...new Set(advisories.map(item => item.url))],
  // npm does not cover Node/Electron/.NET binaries or prove absence of malicious code.
  scope: 'npm dependency advisory scan; signatures and runtime checks are separate',
};
return { summary, blocked: production.metadata.vulnerabilities.total > 0 || unexpected.length > 0 || all.metadata.vulnerabilities.critical > 0 || Boolean(advisories.length && now >= Date.parse(exceptionExpires)) };
}
if (require.main === module) {
const production = audit(['--omit=dev']);
const all = audit([]);
const { summary, blocked } = evaluate(production, all);
fs.mkdirSync(path.join(__dirname, '../dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '../dist/security-audit.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (blocked) {
  throw Error('New or production vulnerability detected; review required');
}
if (summary.unpatchedDevelopmentAdvisories.length) console.warn('Unpatched development-only advisories remain; see SECURITY-REVIEW-1.0.6.md.');
}
module.exports = { evaluate, validateReport };
