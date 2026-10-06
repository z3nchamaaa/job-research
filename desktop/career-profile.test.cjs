const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CareerProfileStore, DEFAULT_CAREER_PROFILE } = require('./career-profile.cjs');

test('CareerProfileStore functionality', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'career-profile-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = new CareerProfileStore(dir);

  await t.test('get returns default if nonexistent', () => {
    const profile = store.getProfile();
    assert.deepStrictEqual(profile, DEFAULT_CAREER_PROFILE);
  });

  await t.test('saveProfile saves and normalizes with whitelist', () => {
    const saved = store.saveProfile({
      version: 1,
      completed: true,
      major: ' Computer Science ',
      industries: ' IT ',
      roles: ' SWE ',
      priorities: ' Salary ',
      strengths: ' Coding ',
      extraInfo: 'should be stripped'
    });

    assert.strictEqual(saved.major, 'Computer Science');
    assert.strictEqual(saved.extraInfo, undefined);

    const data = JSON.parse(fs.readFileSync(path.join(dir, 'career-profile.json'), 'utf-8'));
    assert.strictEqual(data.major, 'Computer Science');
    assert.strictEqual(data.extraInfo, undefined);
  });

  await t.test('handles restart (reads existing valid file)', () => {
    const store2 = new CareerProfileStore(dir);
    const profile = store2.getProfile();
    assert.strictEqual(profile.completed, true);
    assert.strictEqual(profile.major, 'Computer Science');
  });

  await t.test('wrong types throws error', () => {
    assert.throws(() => store.saveProfile({ version: 2, completed: false }), /対応していないプロフィールのバージョンです/);
    assert.throws(() => store.saveProfile({ version: 1, completed: 'true' }), /完了ステータスが不正です/);
    assert.throws(() => store.saveProfile({ version: 1, completed: true, major: 123 }), /専攻は文字列である必要があります/);
    assert.throws(() => store.saveProfile(null), /プロフィールデータが不正です/);
    assert.throws(() => store.saveProfile([]), /プロフィールデータが不正です/);
    assert.throws(() => store.saveProfile({ version: 1, completed: false, major: null }), /専攻は文字列である必要があります/);
  });

  await t.test('oversize throws error', () => {
    assert.throws(() => store.saveProfile({
      version: 1,
      completed: true,
      major: 'a'.repeat(2001)
    }), /専攻は2000文字以内で入力してください/);
  });

  await t.test('corruption preserved (throws friendly error without overwriting)', () => {
    const filePath = path.join(dir, 'career-profile.json');
    const originalData = fs.readFileSync(filePath, 'utf-8');
    fs.writeFileSync(filePath, '{ bad json');
    
    assert.throws(() => store.getProfile(), /プロフィールデータが破損しています/);
    
    const currentData = fs.readFileSync(filePath, 'utf-8');
    assert.strictEqual(currentData, '{ bad json');

    fs.writeFileSync(filePath, originalData); // restore
  });

  await t.test('file read error returns safe Japanese', { skip: process.platform === 'win32' }, () => {
    const filePath = path.join(dir, 'career-profile.json');
    // Ensure file exists
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_CAREER_PROFILE));
    const originalMode = fs.statSync(filePath).mode;
    fs.chmodSync(filePath, 0o000); // unreadable
    try {
      assert.throws(() => store.getProfile(), /プロフィールデータの読み込みに失敗しました/);
    } finally {
      fs.chmodSync(filePath, originalMode);
    }
  });

  await t.test('blank skip/valid (all blank values)', () => {
    const saved = store.saveProfile({
      version: 1,
      completed: false,
    });
    assert.strictEqual(saved.major, '');
    assert.strictEqual(saved.industries, '');
  });

  await t.test('file permissions are mode 0600', { skip: process.platform === 'win32' }, () => {
    const filePath = path.join(dir, 'career-profile.json');
    const stat = fs.statSync(filePath);
    assert.strictEqual((stat.mode & 0o777), 0o600);
  });
});
