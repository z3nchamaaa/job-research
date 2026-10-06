// 親Electronが終了・クラッシュしたら、IPC切断で互換サーバーも終了する。
if (!process.connected) {
  console.error('内部サーバーはアプリから起動してください。');
  process.exit(1);
}
process.on('disconnect', () => process.exit(0));
require('./server.js');
