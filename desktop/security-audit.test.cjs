const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate } = require('./security-audit.cjs');
const clean = { metadata: { vulnerabilities: { total: 0, critical: 0 } }, vulnerabilities: {} };
const known = { metadata: { vulnerabilities: { total: 1, critical: 0 } }, vulnerabilities: { braces: { via: [{ url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' }] } } };
test('Audit permits clean production and only documented temporary development exceptions', () => {
  assert.equal(evaluate(clean, clean).blocked, false);
  assert.equal(evaluate(clean, known, Date.parse('2026-10-19')).blocked, false);
});
test('Audit blocks production findings, new advisories, critical findings and expired exceptions', () => {
  assert.equal(evaluate({ ...clean, metadata: { vulnerabilities: { total: 1 } } }, known).blocked, true);
  assert.equal(evaluate(clean, { ...known, vulnerabilities: { x: { via: [{ url: 'https://github.com/advisories/unknown' }] } } }).blocked, true);
  assert.equal(evaluate(clean, { ...known, metadata: { vulnerabilities: { critical: 1 } } }).blocked, true);
  assert.equal(evaluate(clean, known, Date.parse('2026-10-26')).blocked, true);
});
