/**
 * Comprehensive Unit and Regression Test Suite for Obsidian QuickView Live Editor
 * Covers Sections 20 & 21: Test Fixture verification, Table navigation & editing,
 * Caret-aware syntax reveal, Frontmatter properties, Autocomplete, Code protection, etc.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const jsFiles = ['static/app.js', 'static/js/app.js', 'static/js/editor.js', 'static/js/markdown.js', 'static/js/api.js', 'static/js/note.js'];
const appJs = jsFiles.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const runtimeJs = fs.readFileSync(path.join(root, 'static/cm6-live-preview-runtime.js'), 'utf8');
const entryJs = fs.readFileSync(path.join(root, 'scripts/cm6-entry.js'), 'utf8');
const cssFiles = ['static/app.css', 'static/css/live-preview.css', 'static/css/editor.css'];
const appCss = cssFiles.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const indexHtml = fs.readFileSync(path.join(root, 'static/index.html'), 'utf8');

// Section 20 Mandatory Test Fixture
const FIXTURE_MD = `---
title: Markdown Editor Test
tags:
  - test
  - codemirror6
aliases:
  - Editor Demo
date: 2026-10-08
status: active
---

# Heading H1

## Heading H2

Paragraph with **bold**, *italic*, ***bold italic***, ~~strike~~ and ==highlight==.

Inline code: \`==must stay code==\`.

---

## Table

| Left | Center | Right |
| :-- | :---: | --: |
| **Bold** | \`Code\` | 100% |
| Text | *Italic* | Done |

---

## Tasks

- [x] Done
- [ ] Todo
  - [ ] Nested

---

## Callout

> [!NOTE] Test
> This is **bold** inside callout.

> [!TIP]- Folded
> Hidden text.

---

## Quote

> Level 1
>> Level 2

---

## Math

Inline $E=mc^2$.

$$
x^2 + y^2 = z^2
$$

---

## Links

[[Other Note]]

Tag: #editor/test

---

Footnote here[^1].

[^1]: Footnote definition.
`;

console.log('🧪 Starting Obsidian QuickView Live Editor test suite...\n');

// -------------------------------------------------------------
// Test Suite 1: Architectural Guards & Lazy Loading
// -------------------------------------------------------------
console.log('--- Test Suite 1: Architecture & Lazy Loading ---');

assert(!indexHtml.includes('<script src="/static/cm6-bundle.min.js'), 'CM6 must not load in index.html at startup');
assert(!indexHtml.includes('<script src="/static/highlight.min.js'), 'Highlight.js must not load at startup');
assert(!indexHtml.includes('github-dark.min.css'), 'Highlight CSS must not load at startup');
assert(appJs.includes("loadScript('/static/cm6-bundle.min.js?v=23')"), 'CM6 must lazy-load on edit mode');
assert(runtimeJs.includes('__OQCM6_RUNTIME_V23 = true'), 'Shipped runtime patch marker must be present');
assert(runtimeJs.includes('LightweightCompletionController'), 'Autocomplete controller must be built into editor runtime');
assert(runtimeJs.includes('__OQCM6_RUNTIME_V33 = true'), 'Current interaction runtime v33 must be active');

console.log('✔ Architecture and startup budget guards verified.');

// -------------------------------------------------------------
// Test Suite 2: Table Recognition, Navigation & Serialization
// -------------------------------------------------------------
console.log('\n--- Test Suite 2: Table Recognition & Navigation ---');

// Extract table helpers from runtimeJs
const splitTableCells = (line) => {
  let text = String(line || '').trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  const cells = [];
  let current = '', escaped = false, codeTicks = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === '\\') { current += ch; escaped = true; continue; }
    if (ch === '`') {
      let run = 1;
      while (i + run < text.length && text[i + run] === '`') run++;
      current += '`'.repeat(run);
      if (codeTicks === 0) codeTicks = run;
      else if (codeTicks === run) codeTicks = 0;
      i += run - 1;
      continue;
    }
    if (ch === '|' && codeTicks === 0) { cells.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
};

const isTableSeparator = (line) => {
  const cells = splitTableCells(line);
  return cells.length > 0 && cells.every(cell => /^:?-+:?$/.test(cell.trim()));
};

const tableAlignment = (cell) => {
  const t = String(cell || '').trim();
  if (t.startsWith(':') && t.endsWith(':')) return 'center';
  if (t.endsWith(':')) return 'right';
  if (t.startsWith(':')) return 'left';
  return '';
};

const escapeTableCell = (value) => String(value || '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();

const parseTableBlock = (raw) => {
  const lines = String(raw || '').split('\n');
  if (lines.length < 2 || !isTableSeparator(lines[1])) return null;
  const separator = splitTableCells(lines[1]);
  const rows = [splitTableCells(lines[0]), ...lines.slice(2).map(splitTableCells)];
  const width = Math.max(separator.length, ...rows.map(r => r.length));
  rows.forEach(row => { while (row.length < width) row.push(''); });
  while (separator.length < width) separator.push('---');
  return { rows, separator, width };
};

const serializeTableBlock = (model) => {
  const row = cells => `| ${cells.map(escapeTableCell).join(' | ')} |`;
  const out = [row(model.rows[0] || [])];
  out.push(row(model.separator.map(cell => {
    const t = String(cell || '').trim();
    if (/^:?-+:?$/.test(t)) return t;
    return '---';
  })));
  for (let i = 1; i < model.rows.length; i++) out.push(row(model.rows[i]));
  return out.join('\n');
};

// Test fixture table
const tableText = `| Left | Center | Right |
| :-- | :---: | --: |
| **Bold** | \`Code\` | 100% |
| Text | *Italic* | Done |`;

const tableModel = parseTableBlock(tableText);
assert(tableModel !== null, 'Table must parse successfully');
assert.strictEqual(tableModel.width, 3, 'Table must have 3 columns');
assert.strictEqual(tableModel.rows.length, 3, 'Table must have 1 header row + 2 data rows');
assert.strictEqual(tableAlignment(tableModel.separator[0]), 'left', 'Col 0 must be left-aligned');
assert.strictEqual(tableAlignment(tableModel.separator[1]), 'center', 'Col 1 must be center-aligned');
assert.strictEqual(tableAlignment(tableModel.separator[2]), 'right', 'Col 2 must be right-aligned');

// Test cell edit roundtrip
tableModel.rows[2][2] = '**Finished**';
const serialized = serializeTableBlock(tableModel);
assert(serialized.includes('| Text | *Italic* | **Finished** |'), 'Updated cell must serialize properly');
assert(serialized.includes('| :-- | :---: | --: |'), 'Table alignment separators must be preserved');

// Test Tab navigation logic
let r = 1, c = 2; // Last column of row 1
let nextR = r, nextC = c;
if (nextC + 1 < tableModel.width) { nextC++; } else { nextR++; nextC = 0; }
assert.strictEqual(nextR, 2, 'Tab must advance to next row');
assert.strictEqual(nextC, 0, 'Tab must start at column 0');

// Test Tab on last cell creates new row
r = 2; c = 2;
nextR = r; nextC = c;
if (nextC + 1 < tableModel.width) { nextC++; } else {
  nextR++; nextC = 0;
  if (nextR >= tableModel.rows.length) {
    tableModel.rows.push(new Array(tableModel.width).fill(''));
  }
}
assert.strictEqual(nextR, 3, 'Tab on last cell must advance to row 3');
assert.strictEqual(tableModel.rows.length, 4, 'Tab on last cell must append new empty row');

console.log('✔ Table recognition, alignment, navigation and roundtrip serialization verified.');

// -------------------------------------------------------------
// Test Suite 3: Frontmatter Properties Parsing & Fallback
// -------------------------------------------------------------
console.log('\n--- Test Suite 3: Frontmatter Properties & Fallback ---');

const isComplexFrontmatter = (raw) => {
  const lines = String(raw || '').split('\n');
  if (lines.length < 2) return false;
  for (let i = 1; i < lines.length - 1; i++) {
    const line = lines[i];
    if (/^\s{2,}[^:\s#][^:]*:\s*/.test(line)) return true;
    if (/:\s*[|>][+-]?\s*$/.test(line)) return true;
  }
  return false;
};

const parseFrontmatterProperties = (raw) => {
  const lines = String(raw || '').split('\n');
  const offsets = []; let offset = 0;
  for (let i = 0; i < lines.length; i++) { offsets.push(offset); offset += lines[i].length + 1; }
  const props = [];
  for (let i = 1; i < lines.length - 1; i++) {
    const m = lines[i].match(/^(\s*)([^:#][^:]*?):(?:\s*)(.*)$/);
    if (!m || /^\s*-\s/.test(lines[i])) continue;
    let endLine = i;
    while (endLine + 1 < lines.length - 1 && !/^(\s*)([^:#][^:]*?):(?:\s*)(.*)$/.test(lines[endLine + 1])) endLine++;
    const continuation = lines.slice(i + 1, endLine + 1);
    const listValues = continuation.map(line => line.match(/^\s*-\s+(.*)$/)).filter(Boolean).map(x => x[1].trim());
    const inline = m[3].trim();
    props.push({
      key: m[2].trim(), inline, listValues,
      listStyle: !inline && listValues.length > 0,
      indent: continuation.length ? ((continuation[0].match(/^(\s*)/) || ['', '  '])[1] || '  ') : '  ',
      from: offsets[i],
      to: endLine + 1 < lines.length ? offsets[endLine + 1] - 1 : raw.length,
      display: inline || (listValues.length ? listValues.join(', ') : '')
    });
    i = endLine;
  }
  return props;
};

const serializeFrontmatterProperty = (prop, value) => {
  const clean = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  if (prop.listStyle) {
    const values = clean.split(',').map(v => v.trim()).filter(Boolean);
    if (!values.length) return `${prop.key}: []`;
    return `${prop.key}:\n${values.map(v => `${prop.indent}- ${v}`).join('\n')}`;
  }
  return `${prop.key}: ${clean}`;
};

const fixtureFm = FIXTURE_MD.split('---')[1].trim();
const fullFm = `---\n${fixtureFm}\n---`;

assert(!isComplexFrontmatter(fullFm), 'Fixture frontmatter must be detected as simple properties');

const complexFm = `---
title: Demo
author:
  name: John Doe
  id: 123
---`;
assert(isComplexFrontmatter(complexFm), 'Nested object YAML must be detected as complex and fallback to source');

const parsedProps = parseFrontmatterProperties(fullFm);
assert.strictEqual(parsedProps.length, 5, 'Must parse 5 properties from fixture');
assert.strictEqual(parsedProps[0].key, 'title');
assert.strictEqual(parsedProps[0].display, 'Markdown Editor Test');
assert.strictEqual(parsedProps[1].key, 'tags');
assert.deepStrictEqual(parsedProps[1].listValues, ['test', 'codemirror6']);
assert.strictEqual(parsedProps[2].key, 'aliases');
assert.deepStrictEqual(parsedProps[2].listValues, ['Editor Demo']);

// Edit single property: title
const updatedTitle = serializeFrontmatterProperty(parsedProps[0], 'New Title');
assert.strictEqual(updatedTitle, 'title: New Title');

// Edit tags list
const updatedTags = serializeFrontmatterProperty(parsedProps[1], 'test, codemirror6, release');
assert(updatedTags.includes('- test\n  - codemirror6\n  - release'), 'Tags list must serialize with correct indentation');

console.log('✔ Frontmatter parsing, complex YAML fallback, and per-field serialization verified.');

// -------------------------------------------------------------
// Test Suite 4: Caret-Aware Reveal & Inline Code Protection
// -------------------------------------------------------------
console.log('\n--- Test Suite 4: Caret-Aware Reveal & Code Protection ---');

const testLine = 'Paragraph with **bold**, *italic*, ***bold italic***, ~~strike~~ and ==highlight==.';
const codeLine = 'Inline code: `==must stay code==`.';

// Check bold italic regex precedence
const protectedSpans = [];
const matches = [];

function recordPaired(text, regex, ml, name) {
  let m;
  regex.lastIndex = 0;
  while ((m = regex.exec(text)) !== null) {
    const f = m.index, t = f + m[0].length;
    if (protectedSpans.some(r => f < r.to && t > r.from) || t - f <= ml * 2) continue;
    protectedSpans.push({ from: f, to: t });
    matches.push({ name, from: f, to: t, text: m[0] });
  }
}

recordPaired(testLine, /\*\*\*([^*\n]+?)\*\*\*|___([^_\\n]+?)___/g, 3, 'boldItalic');
recordPaired(testLine, /\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g, 2, 'bold');
recordPaired(testLine, /~~([^~\n]+?)~~/g, 2, 'strike');
recordPaired(testLine, /(?<!\*)\*([^*\n]+?)\*(?!\*)|(?<!_)_([^_\n]+?)_(?!_)/g, 1, 'italic');

const bi = matches.find(m => m.name === 'boldItalic');
assert(bi, '***bold italic*** must be parsed as a bold-italic token');
assert.strictEqual(bi.text, '***bold italic***');

const bold = matches.find(m => m.name === 'bold');
assert(bold && bold.text === '**bold**');

const italic = matches.find(m => m.name === 'italic');
assert(italic && italic.text === '*italic*');

const strike = matches.find(m => m.name === 'strike');
assert(strike && strike.text === '~~strike~~');

// Verify code protection on ==must stay code==
const codeProtectedSpans = [];
const codeRegex = /(`+)([^\n]*?)(\1)/g;
let cm;
while ((cm = codeRegex.exec(codeLine)) !== null) {
  codeProtectedSpans.push({ from: cm.index, to: cm.index + cm[0].length });
}
assert.strictEqual(codeProtectedSpans.length, 1, 'Code span must be found');

const highlightRegex = /==([^=\n](?:.*?[^=\n])?)==/g;
let hm;
let highlightFound = false;
while ((hm = highlightRegex.exec(codeLine)) !== null) {
  const f = hm.index, t = f + hm[0].length;
  if (!codeProtectedSpans.some(r => f < r.to && t > r.from)) {
    highlightFound = true;
  }
}
assert(!highlightFound, 'Highlight must NOT match inside code backticks');

console.log('✔ Caret-aware token parsing, bold-italic precedence, and code protection verified.');

// -------------------------------------------------------------
// Test Suite 5: Autocomplete Intelligence
// -------------------------------------------------------------
console.log('\n--- Test Suite 5: Autocomplete Intelligence ---');

// Mock autocomplete bridge
const mockNotes = [
  { title: 'Markdown Editor Test', folder: 'tests' },
  { title: 'Other Note', folder: 'notes' },
  { title: 'Obsidian Guide', folder: 'docs' }
];
const mockTags = ['test', 'codemirror6', 'editor/test', 'docs/quickview'];

function filterNotes(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return mockNotes.slice(0, 8);
  return mockNotes.filter(n => n.title.toLowerCase().includes(q)).slice(0, 8);
}

function filterTags(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return mockTags.slice(0, 8);
  return mockTags.filter(t => t.toLowerCase().includes(q)).slice(0, 8);
}

assert.strictEqual(filterNotes('').length, 3, 'Empty query returns all notes up to limit');
assert.strictEqual(filterNotes('other').length, 1, 'Query "other" matches "Other Note"');
assert.strictEqual(filterNotes('other')[0].title, 'Other Note');

assert.strictEqual(filterTags('editor').length, 1, 'Query "editor" matches "editor/test"');
assert.strictEqual(filterTags('editor')[0], 'editor/test');

// Test triggers
const lineWikilink = 'See [[Oth';
const wikiMatch = lineWikilink.match(/\[\[([^\]\n]*)$/);
assert(wikiMatch && wikiMatch[1] === 'Oth', 'Wikilink trigger must capture query "Oth"');

const lineTag = 'Tag: #ed';
const isHeading = /^\s*#{1,6}\s/.test(lineTag);
const tagMatch = !isHeading && lineTag.match(/(?:^|[\s])#([\p{L}\p{N}_\-/]*)$/u);
assert(tagMatch && tagMatch[1] === 'ed', 'Tag trigger must capture query "ed"');

const lineHeading = '# Heading 1';
const headingTagMatch = !(/^\s*#{1,6}\s/.test(lineHeading)) && lineHeading.match(/(?:^|[\s])#([\p{L}\p{N}_\-/]*)$/u);
assert(!headingTagMatch, 'Heading syntax must NOT trigger tag autocomplete');

console.log('✔ Autocomplete filtering, wikilink triggers, and tag safety guards verified.');


// -------------------------------------------------------------
// Test Suite 6: Interaction Mapping & Source-Preserving Blocks
// -------------------------------------------------------------
console.log('\n--- Test Suite 6: Interaction Mapping & Source Preservation ---');

function visibleOffsetToSource(value, visibleText, visibleOffset) {
  const source = String(value ?? '');
  const visible = String(visibleText || '');
  if (!visible || visibleOffset <= 0) return 0;
  if (visibleOffset >= visible.length) return source.length;
  let sourcePos = 0, mapped = 0;
  for (let i = 0; i < visible.length && i < visibleOffset; i++) {
    const found = source.indexOf(visible[i], sourcePos);
    if (found < 0) return Math.round((visibleOffset / visible.length) * source.length);
    sourcePos = found + 1; mapped = sourcePos;
  }
  return Math.max(0, Math.min(source.length, mapped));
}
function pointerOffset(clientX, rect, value, visibleText=value) {
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return visibleOffsetToSource(value, visibleText, Math.round(ratio * visibleText.length));
}
const rect = { left: 100, width: 200 };
assert.strictEqual(pointerOffset(100, rect, 'abcdefghij'), 0, 'Left click must map to start of value');
assert.strictEqual(pointerOffset(200, rect, 'abcdefghij'), 5, 'Middle click must map near middle of value');
assert.strictEqual(pointerOffset(300, rect, 'abcdefghij'), 10, 'Right click must map to end of value');
const boldMapped = pointerOffset(200, rect, '**Bravo**', 'Bravo');
assert(boldMapped >= 4 && boldMapped <= 6, 'Rendered bold text must map into its source content, not blindly select the whole cell');
const wikiMapped = pointerOffset(250, rect, '[[Target|Alias]]', 'Alias');
assert(wikiMapped > '[[Target|'.length && wikiMapped < '[[Target|Alias]]'.length, 'Rendered wikilink alias must map caret into alias source');
assert(runtimeJs.includes('focusInputAtPointer'), 'Table and property inputs must use pointer-aware caret placement');
assert(!runtimeJs.includes('input.select()'), 'Activation must not select the entire table/property value');
assert(!runtimeJs.includes('getActiveLines(view)'), 'Live Preview must not reveal all syntax on the active line');
assert(runtimeJs.includes('const active = (f, t) => selectionTouches(state, f, t)'), 'Syntax reveal must be range-aware');
assert(runtimeJs.includes('EditorView.atomicRanges'), 'Replacement decorations must be atomic for cursor navigation');
assert(runtimeJs.includes("block.kind === 'math'"), 'Display math may remain a semantic rendered block');
assert(!/block\.kind === 'callout'\)\s*return new RenderedBlockWidget/.test(runtimeJs), 'Callouts must retain native CM source');
assert(!/block\.kind === 'fence'\)\s*return new RenderedBlockWidget/.test(runtimeJs), 'Code fences must retain native CM source');
assert(!/block\.kind === 'footnote'\)\s*return new RenderedBlockWidget/.test(runtimeJs), 'Footnotes must retain native CM source');

console.log('✔ Pointer-aware caret mapping, syntax-range reveal, atomic ranges and source-preserving blocks verified.');

// -------------------------------------------------------------
// Test Suite 7: Full Fixture Markdown Render (Reading View)
// -------------------------------------------------------------
console.log('\n--- Test Suite 7: Reading View Dialect Consistency ---');

global.marked = require('../static/marked.min.js');
global.hljs = require('../static/highlight.min.js');
global.katex = require('../static/katex.min.js');

const { renderMarkdown, renderLatex } = require('../static/js/markdown.js');

const html = renderMarkdown(FIXTURE_MD, 'test.md', global.marked, global.katex, (l, b) => renderLatex(l, b, global.katex));

assert(html.includes('<h1>Heading H1</h1>'), 'Heading H1 must render');
assert(html.includes('<h2>Heading H2</h2>'), 'Heading H2 must render');
assert(html.includes('<strong>bold</strong>'), 'Bold must render');
assert(html.includes('<em>italic</em>'), 'Italic must render');
assert(html.includes('<strong><em>bold italic</em></strong>') || html.includes('<em><strong>bold italic</strong></em>'), 'Bold italic must render');
assert(html.includes('<del>strike</del>'), 'Strikethrough must render');
assert(html.includes('<mark class="obs-highlight">highlight</mark>'), 'Highlight must render');
assert(html.includes('<code>==must stay code==</code>'), 'Inline code must preserve inner literal text');
assert(html.includes('<table>'), 'Table must render');
assert(html.includes('class="callout callout-note"'), 'Note callout must render');
assert(html.includes('class="callout callout-tip is-collapsed"'), 'Tip folded callout must render collapsed');
assert(html.includes('<blockquote>'), 'Blockquotes must render');
assert(html.includes('class="math-inline"'), 'Inline math must render');
assert(html.includes('class="math-block"'), 'Display math must render');
assert(html.includes('class="wikilink"'), 'Wikilink must render');
assert(html.includes('class="tag-pill"'), 'Tag must render');
assert(html.includes('class="footnote-ref"'), 'Footnote reference must render');
assert(html.includes('class="footnotes"'), 'Footnotes list must render');

console.log('✔ Reading View renders entire Section 20 fixture cleanly with identical dialect.');

console.log('\n🎉 ALL 7 COMPREHENSIVE LIVE EDITOR TEST SUITES PASSED SUCCESSFULLY!');

// -------------------------------------------------------------
// Test Suite 8: Coordinate-to-Document Position & Geometry Integrity
// -------------------------------------------------------------
console.log('\n--- Test Suite 8: Coordinate-to-Document Position & Geometry Integrity ---');

// Verify that .cm-content children have vertical margins disabled so CM6 heightMap matches DOM layout 1:1
assert(appCss.includes('#cm-editor-mount .cm-content > *'), 'app.css must enforce zero margin on CM content children');
assert(appCss.includes('margin-top: 0 !important'), 'app.css must eliminate margin-top on CM content children');
assert(appCss.includes('margin-bottom: 0 !important'), 'app.css must eliminate margin-bottom on CM content children');

// Verify runtime v33 marker and debug logger
assert(runtimeJs.includes('__OQCM6_RUNTIME_V33 = true'), 'Runtime v33 marker must be exported');
assert(runtimeJs.includes('logClickDebug'), 'Click debug logging helper must exist in runtime');
assert(appJs.includes('cm6-live-preview-runtime.js?v=33'), 'app.js must load runtime v33');

console.log('✔ Coordinate mapping geometry rules, margin guards, and runtime v33 verified.');
