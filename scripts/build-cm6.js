const esbuild = require('esbuild');
const path = require('path');

const entryFile = path.join(__dirname, 'cm6-entry.js');
const outFile = path.join(__dirname, '../static/cm6-bundle.min.js');

console.log('⚡ Đang đóng gói CodeMirror 6 bundle bằng esbuild...');

esbuild.build({
  entryPoints: [entryFile],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: outFile,
  target: ['es2020']
}).then(() => {
  console.log(`✅ Đóng gói hoàn tất: ${outFile}`);
}).catch((err) => {
  console.error('❌ Lỗi đóng gói:', err);
  process.exit(1);
});
