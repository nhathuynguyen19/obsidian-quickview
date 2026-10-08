#!/usr/bin/env node
/**
 * Asset build and vendor preparation script for Obsidian QuickView.
 * Builds CM6 bundle and prepares Marked, Highlight.js, and KaTeX from npm.
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT_DIR = path.join(__dirname, '..');
const STATIC_DIR = path.join(ROOT_DIR, 'static');
const NODE_MODULES = path.join(ROOT_DIR, 'node_modules');

async function build() {
  console.log('⚡ [Build] Bắt đầu build toàn bộ assets cho Obsidian QuickView...');

  // Ensure directories exist
  fs.mkdirSync(STATIC_DIR, { recursive: true });
  fs.mkdirSync(path.join(STATIC_DIR, 'fonts'), { recursive: true });

  // 1. Build CodeMirror 6 Bundle
  console.log('  📦 Đang đóng gói CodeMirror 6 (cm6-bundle.min.js)...');
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'cm6-entry.js')],
    bundle: true,
    minify: true,
    format: 'iife',
    outfile: path.join(STATIC_DIR, 'cm6-bundle.min.js'),
    target: ['es2020']
  });

  // 2. Build Highlight.js
  console.log('  📦 Đang đóng gói Highlight.js (highlight.min.js)...');
  const hljsEntry = require.resolve('highlight.js/lib/common');
  await esbuild.build({
    entryPoints: [hljsEntry],
    bundle: true,
    minify: true,
    format: 'iife',
    globalName: 'hljs',
    footer: {
      js: 'if (typeof window !== "undefined" && !window.hljs) window.hljs = hljs.default || hljs; if (typeof module !== "undefined") module.exports = hljs.default || hljs;'
    },
    outfile: path.join(STATIC_DIR, 'highlight.min.js'),
    target: ['es2020']
  });

  // 3. Copy Highlight.js theme
  console.log('  🎨 Đang sao chép theme Highlight.js (github-dark.min.css)...');
  const hljsThemeSrc = path.join(NODE_MODULES, 'highlight.js/styles/github-dark.min.css');
  if (fs.existsSync(hljsThemeSrc)) {
    fs.copyFileSync(hljsThemeSrc, path.join(STATIC_DIR, 'github-dark.min.css'));
  }

  // 4. Copy Marked.js
  console.log('  📄 Đang chuẩn bị Marked.js (marked.min.js)...');
  const markedSrc = path.join(NODE_MODULES, 'marked/marked.min.js');
  if (fs.existsSync(markedSrc)) {
    fs.copyFileSync(markedSrc, path.join(STATIC_DIR, 'marked.min.js'));
  } else {
    throw new Error('Không tìm thấy marked.min.js trong node_modules/marked!');
  }

  // 5. Copy KaTeX (JS, CSS, Fonts)
  console.log('  📐 Đang chuẩn bị KaTeX (katex.min.js, katex.min.css, fonts)...');
  const katexDist = path.join(NODE_MODULES, 'katex/dist');
  if (!fs.existsSync(katexDist)) {
    throw new Error('Không tìm thấy thư mục katex/dist trong node_modules/katex!');
  }

  fs.copyFileSync(path.join(katexDist, 'katex.min.js'), path.join(STATIC_DIR, 'katex.min.js'));
  fs.copyFileSync(path.join(katexDist, 'katex.min.css'), path.join(STATIC_DIR, 'katex.min.css'));

  const fontsSrcDir = path.join(katexDist, 'fonts');
  const fontsDestDir = path.join(STATIC_DIR, 'fonts');
  if (fs.existsSync(fontsSrcDir)) {
    const fontFiles = fs.readdirSync(fontsSrcDir);
    for (const font of fontFiles) {
      fs.copyFileSync(path.join(fontsSrcDir, font), path.join(fontsDestDir, font));
    }
  }

  console.log('✅ [Build] Đã build và chuẩn bị thành công toàn bộ assets trong static/!');
}

build().catch((err) => {
  console.error('❌ [Build] Lỗi build assets:', err);
  process.exit(1);
});
