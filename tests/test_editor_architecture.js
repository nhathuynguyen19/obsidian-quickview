const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts/cm6-entry.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'static/cm6-live-preview-runtime.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'static/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'static/index.html'), 'utf8');

assert(source.includes('update.selectionSet'), 'Live Preview must react to caret/selection changes');
assert(source.includes('view.visibleRanges'), 'Decorations must be viewport bounded');
assert(source.includes('Decoration.replace'), 'Live Preview must hide Markdown syntax, not only color it');
assert(source.includes('from: visible.from') && source.includes('to: visible.to'), 'Syntax-tree traversal must be viewport bounded');
assert(source.includes('view.setState(buildState'), 'Switching note content must reset EditorState/history');
assert(source.includes('TaskCheckboxWidget'), 'Task checkboxes should render interactively');
assert(source.includes('ImagePreviewWidget'), 'Images should render inside Live Preview');
assert(runtime.includes('__OQCM6_RUNTIME_V23 = true'), 'Shipped runtime patch must be active');

assert(runtime.includes('structuralBlockCache'), 'Structural blocks should be cached per immutable CM6 document');
assert(runtime.includes('LightweightCompletionController'), 'Live editor should provide lightweight [[ / # completion without another editor framework');
assert(runtime.includes('__OQCM6_RUNTIME_V32 = true'), 'Shipped Markdown editor runtime v32 must be active');
assert(runtime.includes('createStructuralBlockExtensions'), 'Structural replacements must be isolated from source-preserving block styling');
assert(runtime.includes('EditorView.atomicRanges'), 'Hidden/replaced syntax must expose atomic cursor ranges');
assert(runtime.includes('focusInputAtPointer'), 'Table/Properties editors must place the caret from pointer position');
assert(runtime.includes('structuralWidgetFor'), 'Structural widget policy must be explicit and auditable');
assert(!/block\.kind === 'callout'\)\s*return new RenderedBlockWidget/.test(runtime), 'Callouts must keep real CM source lines');
assert(!/block\.kind === 'fence'\)\s*return new RenderedBlockWidget/.test(runtime), 'Fenced code must keep real CM source lines');
assert(!/block\.kind === 'footnote'\)\s*return new RenderedBlockWidget/.test(runtime), 'Footnote definitions must keep real CM source lines');
assert(!runtime.includes('getActiveLines(view)'), 'Inline reveal must no longer be line-wide');
assert(!runtime.includes('input.select()'), 'Table/Properties activation must not blindly select the whole value');
const runtimeViewPlugin = runtime.slice(runtime.indexOf('function createLivePreviewPlugin'), runtime.indexOf('function createLivePreviewExtensions'));
assert(!runtimeViewPlugin.includes('block: true'), 'ViewPlugin must never emit layout-changing block decorations');
assert(!runtime.includes('lineDecoRenderedHidden'), 'Runtime must not use zero-height hidden-line block hacks');
assert(app.includes("cm6-live-preview-runtime.js?v=33"), 'Edit mode must load the current runtime cache version');
assert(app.includes('getScrollRatio') && app.includes('restoreScrollRatio'), 'Reading/Edit toggles should preserve approximate scroll position');

assert(!html.includes('<script src="/static/cm6-bundle.min.js'), 'CM6 must not load at startup');
assert(!html.includes('<script src="/static/highlight.min.js'), 'Highlight.js must not load at startup');
assert(!html.includes('github-dark.min.css'), 'Highlight CSS must not load at startup');
assert(app.includes("loadScript('/static/cm6-bundle.min.js?v=23')"), 'CM6 must lazy-load on edit');
assert(app.includes("script.src = '/static/highlight.min.js'"), 'Highlight.js should lazy-load only when code exists');
assert(app.includes('/api/note/raw?path='), 'Raw Markdown should load only on demand');
assert(app.includes('/api/tree-level?folder='), 'File tree should use lazy folder API');
assert(app.includes('editPreviewBody.replaceChildren()'), 'Hidden preview DOM should be released');

console.log('All editor architecture/performance guards passed.');
