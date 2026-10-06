const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file));

test('日本語の表示名に揃え、既存データの保存先とアプリIDを維持する', () => {
  const main = read('desktop/main.cjs').toString();
  const config = read('electron-builder.yml').toString();
  assert.ok(main.includes("app.setName('就活トラッカー')"));
  assert.ok(main.includes("'syukatsu-tracker-desktop'"));
  assert.ok(config.includes('appId: "com.syukatsu.tracker"'));
  assert.ok(config.includes('productName: "就活トラッカー"'));
  assert.ok(read('src/app/layout.tsx').toString().includes('就活トラッカー'));
  assert.ok(read('src/components/Header.tsx').toString().includes('就活トラッカー'));
  assert.ok(read('desktop/chatgpt.cjs').toString().includes("'agent_name_hint', '就活トラッカー'"));
});

test('PNG・ICO・ICNSを同梱し、画面とfaviconにも使用する', () => {
  const png = read('assets/icons/app-icon.png');
  assert.equal(png.readUInt32BE(16),1024);
  assert.equal(png.readUInt32BE(20),1024);
  const ico = read('assets/icons/app-icon.ico');
  assert.equal(ico.readUInt16LE(2),1);
  assert.equal(ico.readUInt16LE(4),7);
  assert.deepEqual(ico,read('src/app/favicon.ico'));
  const icns = read('assets/icons/app-icon.icns');
  assert.equal(icns.toString('ascii',0,4),'icns');
  assert.equal(icns.readUInt32BE(4),icns.length);
  assert.equal(read('public/app-icon.png').readUInt32BE(16),128);
  const config = read('electron-builder.yml').toString();
  for (const ext of ['png','ico','icns']) assert.ok(config.includes(`assets/icons/app-icon.${ext}`));
  assert.ok(config.includes('signExecutable: false'));
  assert.ok(!config.includes('signAndEditExecutable: false'));
});
