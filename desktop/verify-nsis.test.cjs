const test = require('node:test');
const assert = require('node:assert/strict');
const { deflateRawSync } = require('node:zlib');
const { crc32, verifyBuffer, verifyInstaller } = require('./verify-nsis.cjs');
function executable(blocks) {
  const stub = Buffer.alloc(1024); stub.write('MZ');
  const header = Buffer.alloc(28);
  Buffer.from('efbeadde4e756c6c736f6674496e7374','hex').copy(header,4);
  const payload = Buffer.concat(blocks.map(block => {
    const compressed = deflateRawSync(block); const size = Buffer.alloc(4);
    size.writeUInt32LE((compressed.length | 0x80000000) >>> 0);
    return Buffer.concat([size,compressed]);
  }));
  header.writeUInt32LE(header.length + payload.length + 4,24);
  const body = Buffer.concat([stub,header,payload]);
  const crc = Buffer.alloc(4); crc.writeUInt32LE(crc32(body.subarray(512)));
  return Buffer.concat([body,crc]);
}
test('CRC32 standard test vector', () => assert.equal(crc32(Buffer.from('123456789')),0xcbf43926));
test('installer and compressed embedded uninstaller CRC pass', () => {
  const installer = executable([Buffer.from('header'),executable([Buffer.from('uninstall data')])]);
  assert.equal(verifyInstaller(installer).uninstallers,1);
});
test('outer CRC corruption rejected', () => {
  const installer = executable([Buffer.from('data')]); installer[700] ^= 1;
  assert.throws(()=>verifyBuffer(installer),/CRC mismatch/);
});
test('valid outer CRC cannot mask corrupt embedded uninstaller', () => {
  const uninstaller = executable([Buffer.from('data')]); uninstaller[700] ^= 1;
  assert.throws(()=>verifyInstaller(executable([uninstaller])),/CRC mismatch/);
});
test('missing uninstaller, truncated executable and disabled CRC rejected', () => {
  assert.throws(()=>verifyInstaller(executable([Buffer.from('header')])),/not found/);
  const installer = executable([Buffer.from('data')]);
  assert.throws(()=>verifyBuffer(installer.subarray(0,1040)),/header not found/);
  installer.writeUInt32LE(4,1024);
  assert.throws(()=>verifyBuffer(installer),/disabled/);
});
