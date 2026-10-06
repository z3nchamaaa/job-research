const fs = require('node:fs');
const { inflateRawSync } = require('node:zlib');
const signature = Buffer.from('efbeadde4e756c6c736f6674496e7374', 'hex');
const table = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 8) ^ table[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
function verifyBuffer(buffer) {
  if (buffer.length < 544 || buffer.toString('ascii', 0, 2) !== 'MZ') throw new Error('Invalid PE executable');
  const offset = buffer.indexOf(signature, 512) - 4;
  if (offset < 512 || offset + 28 > buffer.length) throw new Error('NSIS header not found');
  const flags = buffer.readUInt32LE(offset);
  if (flags & 4) throw new Error('NSIS CRC checking is disabled');
  const end = offset + buffer.readUInt32LE(offset + 24);
  if (end > buffer.length || end < offset + 32) throw new Error('Invalid NSIS data length');
  const expected = buffer.readUInt32LE(end - 4);
  const actual = crc32(buffer.subarray(512, end - 4));
  if (expected !== actual) throw new Error(`NSIS CRC mismatch: stored=${expected}, calculated=${actual}`);
  return { offset, end, crc: actual };
}
function verifyInstaller(buffer) {
  const outer = verifyBuffer(buffer);
  let cursor = outer.offset + 28;
  let uninstallers = 0;
  while (cursor + 4 <= outer.end - 4) {
    const encodedSize = buffer.readUInt32LE(cursor);
    cursor += 4;
    const size = encodedSize & 0x7fffffff;
    if (!size || cursor + size > outer.end - 4) throw new Error('Invalid non-solid NSIS block');
    let block = buffer.subarray(cursor, cursor + size);
    cursor += size;
    if (encodedSize & 0x80000000) block = inflateRawSync(block, { maxOutputLength: 512 * 1024 * 1024 });
    if (block.toString('ascii', 0, 2) === 'MZ' && block.indexOf(signature, 512) !== -1) {
      verifyBuffer(block);
      uninstallers++;
    }
  }
  if (!uninstallers) throw new Error('Embedded uninstaller not found (non-solid NSIS required)');
  return { ...outer, uninstallers };
}
async function artifactBuildCompleted(context) {
  // electron-builder emits both EXE and .exe.blockmap events for the NSIS target.
  if (context.target?.name !== 'nsis' || !context.file?.toLowerCase().endsWith('.exe')) return;
  if (process.platform !== 'win32') throw new Error('Windows installers must be built on Windows');
  const result = verifyInstaller(fs.readFileSync(context.file));
  console.log(`NSIS CRC verified: ${context.file} (${result.uninstallers} embedded uninstaller)`);
}
module.exports = artifactBuildCompleted;
module.exports.crc32 = crc32;
module.exports.verifyBuffer = verifyBuffer;
module.exports.verifyInstaller = verifyInstaller;
if (require.main === module) {
  try {
    const filename = process.argv[2];
    const result = (process.argv.includes('--uninstaller') ? verifyBuffer : verifyInstaller)(fs.readFileSync(filename));
    console.log(`NSIS CRC verified: ${filename}`, result);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
