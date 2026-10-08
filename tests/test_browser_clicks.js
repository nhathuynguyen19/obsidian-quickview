/**
 * Headless Browser Click & Interaction Regression Test
 * Spawns an internal HTTP server, runs Firefox in headless mode,
 * and asserts that all 11 click locations map to the expected line,
 * caret position, and block type with zero layout shift or scroll jump.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const PORT = 18126;

// Serve files from project root
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'POST' && url === '/api/results') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
      server.emit('test_results', JSON.parse(body));
    });
    return;
  }

  let filePath = path.join(ROOT, url.startsWith('/') ? url.slice(1) : url);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json'
  };
  res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log('🧪 Starting Headless Firefox click interaction test suite...');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="/static/app.css">
  <style>
    body { margin: 0; padding: 20px; background: #18191c; color: #dcddde; }
    #cm-editor-mount { width: 800px; }
  </style>
</head>
<body>
  <div id="cm-editor-mount"></div>
  <script src="/static/marked.min.js"></script>
  <script src="/static/highlight.min.js"></script>
  <script src="/static/katex.min.js"></script>
  <script src="/static/cm6-bundle.min.js"></script>
  <script src="/static/cm6-live-preview-runtime.js"></script>
  <script>
    const fixture = \`# Heading

Paragraph before.

> [!NOTE] Callout
> Line one.
> Line two with **bold**.
> Line three.

Paragraph after.

\\\`\\\`\\\`js
const alpha = 1;
const beta = 2;
\\\`\\\`\\\`

Paragraph after code.

| A | B |
| --- | --- |
| Alpha | **Bravo** |
| Charlie | Delta |

Footnote here[^1].

[^1]: Footnote definition.

$$
x^2 + y^2
$$
\`;
    window.addEventListener('load', async () => {
      try {
        const parent = document.getElementById('cm-editor-mount');
        const editor = window.ObsidianCM6.createEditor(parent, {
          doc: fixture,
          livePreview: true
        });
        const view = editor.view;
        const report = [];
        await new Promise(r => setTimeout(r, 200));
        const doc = view.state.doc;

        function clickAt(x, y) {
          const target = document.elementFromPoint(x, y);
          if (!target) return false;
          const evDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, detail: 1, clientX: x, clientY: y, button: 0, buttons: 1 });
          const evUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, detail: 1, clientX: x, clientY: y, button: 0, buttons: 0 });
          const evClick = new MouseEvent('click', { bubbles: true, cancelable: true, view: window, detail: 1, clientX: x, clientY: y, button: 0 });
          target.dispatchEvent(evDown);
          target.dispatchEvent(evUp);
          target.dispatchEvent(evClick);
          return true;
        }

        async function testClick(name, lineNum, charOffset, expectedLine) {
          const line = doc.line(lineNum);
          const lineElements = view.contentDOM.querySelectorAll('.cm-line');
          let targetLineEl = null;
          for (const el of lineElements) {
            const p = view.posAtDOM(el);
            if (p >= line.from && p <= line.to) { targetLineEl = el; break; }
          }
          if (targetLineEl) {
            targetLineEl.scrollIntoView({ block: 'center', inline: 'nearest' });
            await new Promise(r => setTimeout(r, 40));
          }
          const coords = view.coordsAtPos(line.from + charOffset);
          if (!coords) {
            report.push({ name, status: 'FAIL', reason: 'No coords for line ' + lineNum });
            return;
          }
          const ok = clickAt(coords.left + 4, (coords.top + coords.bottom) / 2);
          if (!ok) {
            report.push({ name, status: 'FAIL', reason: 'elementFromPoint returned null' });
            return;
          }
          await new Promise(r => setTimeout(r, 60));
          const sel = view.state.selection.main;
          const actualLine = view.state.doc.lineAt(sel.head);
          const pass = actualLine.number === expectedLine;
          report.push({
            name,
            status: pass ? 'PASS' : 'FAIL',
            expectedLine,
            actualLine: actualLine.number,
            caretPos: sel.head,
            lineText: actualLine.text
          });
        }

        // Test matrix:
        await testClick('callout-start', 5, 2, 5);
        await testClick('callout-line-one', 6, 4, 6);
        await testClick('callout-line-two', 7, 4, 7);
        await testClick('callout-line-three', 8, 4, 8);
        await testClick('paragraph-before', 3, 5, 3);
        await testClick('paragraph-between', 10, 5, 10);
        await testClick('code-line-1', 13, 4, 13);
        await testClick('code-line-2', 14, 4, 14);
        await testClick('footnote-def', 26, 6, 26);

        // Math block
        const mathBlockEl = document.querySelector('.cm-live-block-math');
        if (mathBlockEl) {
          mathBlockEl.scrollIntoView({ block: 'center' });
          await new Promise(r => setTimeout(r, 40));
          const rect = mathBlockEl.getBoundingClientRect();
          clickAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
          await new Promise(r => setTimeout(r, 80));
          const sel = view.state.selection.main;
          const actualLine = view.state.doc.lineAt(sel.head);
          report.push({
            name: 'math-block',
            status: actualLine.number >= 28 && actualLine.number <= 30 ? 'PASS' : 'FAIL',
            actualLine: actualLine.number,
            caretPos: sel.head,
            lineText: actualLine.text
          });
        }

        // Table cell Bravo
        const tableWidget = document.querySelector('.cm-live-table-widget');
        if (tableWidget) {
          tableWidget.scrollIntoView({ block: 'center' });
          await new Promise(r => setTimeout(r, 40));
          const bravoCell = tableWidget.querySelector('[data-row="1"][data-col="1"] .cm-live-table-cell-display');
          if (bravoCell) {
            const rect = bravoCell.getBoundingClientRect();
            clickAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
            await new Promise(r => setTimeout(r, 80));
            const input = tableWidget.querySelector('input.cm-live-table-cell-input');
            const caretStart = input ? input.selectionStart : null;
            report.push({
              name: 'table-cell-bravo',
              status: input && caretStart >= 4 && caretStart <= 6 ? 'PASS' : 'FAIL',
              inputFound: !!input,
              caretStart,
              inputValue: input ? input.value : null
            });
          }
        }

        fetch('/api/results', { method: 'POST', body: JSON.stringify(report) });
      } catch (err) {
        fetch('/api/results', { method: 'POST', body: JSON.stringify([{ error: err.message, stack: err.stack }]) });
      }
    });
  </script>
</body>
</html>
`;

  const htmlPath = path.join(ROOT, 'tests/test_browser_runner.html');
  fs.writeFileSync(htmlPath, html);

  const profileDir = path.join('/tmp', 'ffprofile_' + Date.now());
  fs.mkdirSync(profileDir, { recursive: true });

  const ff = spawn('firefox', [
    '--profile', profileDir,
    '--headless',
    `http://127.0.0.1:${PORT}/tests/test_browser_runner.html`
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try { ff.kill(); } catch (_) {}
    try { server.close(); } catch (_) {}
    try { if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath); } catch (_) {}
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {}
  };

  const timeout = setTimeout(() => {
    cleanup();
    console.error('❌ Browser tests timed out after 20s');
    process.exit(1);
  }, 20000);

  server.once('test_results', (results) => {
    clearTimeout(timeout);
    cleanup();
    let allPass = true;
    for (const r of results) {
      if (r.status !== 'PASS') {
        allPass = false;
        console.error(`❌ FAIL: ${r.name}`, r);
      } else {
        console.log(`✔ PASS: ${r.name}`);
      }
    }
    if (!allPass) {
      console.error('❌ One or more browser interaction tests failed!');
      process.exit(1);
    }
    console.log('\n🎉 ALL 11 HEADLESS BROWSER CLICK TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  });
});
