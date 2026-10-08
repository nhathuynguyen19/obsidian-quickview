/*
 * Runtime Live Preview upgrade for the prebuilt CodeMirror 6 bundle.
 * This runtime intentionally layers the Markdown Live Preview engine over the
 * small prebuilt CM6 bundle, so target machines do not need npm or a rebuild.
 * scripts/cm6-entry.js remains responsible for exposing the CM6 primitives.
 */
(function () {
  'use strict';
  const cm = window.__OQCM6;
  // A locally rebuilt bundle already contains the optimized source implementation.
  // In that case no runtime override is needed; only mark the lazy loader ready.
  if (!cm) {
    if (window.ObsidianCM6) window.__OQCM6_RUNTIME_V23 = true;
    return;
  }

  const {
    EditorView, EditorState, Compartment, Decoration, ViewPlugin, WidgetType,
    syntaxTree, keymap, indentWithTab, basicSetup, markdown, darkTheme, lightTheme
  } = cm;

  const headingLineDecorations = [null];
  for (let i = 1; i <= 6; i++) headingLineDecorations.push(Decoration.line({ class: `cm-line-h${i}` }));
  const lineDecoCodeBlock = Decoration.line({ class: 'cm-line-codeblock' });
  const lineDecoCodeFence = Decoration.line({ class: 'cm-line-codeblock cm-line-codeblock-fence' });
  const lineDecoList = Decoration.line({ class: 'cm-line-list' });
  const lineDecoTaskChecked = Decoration.line({ class: 'cm-line-list cm-line-task cm-line-task-checked' });
  const lineDecoTaskUnchecked = Decoration.line({ class: 'cm-line-list cm-line-task cm-line-task-unchecked' });
  const lineDecoBlockquote = Decoration.line({ class: 'cm-line-blockquote' });
  const lineDecoCallout = Decoration.line({ class: 'cm-line-callout' });
  const lineDecoCalloutFirst = Decoration.line({ class: 'cm-line-callout cm-line-callout-first' });
  const lineDecoCalloutLast = Decoration.line({ class: 'cm-line-callout cm-line-callout-last' });
  const lineDecoCalloutOnly = Decoration.line({ class: 'cm-line-callout cm-line-callout-first cm-line-callout-last' });
  const lineDecoFootnoteDef = Decoration.line({ class: 'cm-line-footnote-definition' });
  const lineDecoHr = Decoration.line({ class: 'cm-line-hr' });
  const markDecoBold = Decoration.mark({ class: 'cm-bold' });
  const markDecoItalic = Decoration.mark({ class: 'cm-italic' });
  const markDecoBoldItalic = Decoration.mark({ class: 'cm-bold cm-italic' });
  const markDecoInlineCode = Decoration.mark({ class: 'cm-inline-code' });
  const markDecoStrikethrough = Decoration.mark({ class: 'cm-strikethrough' });
  const markDecoWikilink = Decoration.mark({ class: 'cm-wikilink' });
  const markDecoTag = Decoration.mark({ class: 'cm-tag-pill' });
  const markDecoHighlight = Decoration.mark({ class: 'cm-highlight' });
  const markDecoFootnote = Decoration.mark({ class: 'cm-footnote-ref' });
  const markDecoBlockId = Decoration.mark({ class: 'cm-block-id' });
  const markDecoBullet = Decoration.mark({ class: 'cm-list-bullet' });
  const syntaxHide = Decoration.replace({});

  function encodeVaultPath(path) {
    return String(path || '').split('/').map(encodeURIComponent).join('/');
  }
  function resolveImageSource(src, notePath) {
    src = String(src || '').trim();
    if (/^(?:https?:|data:|blob:|\/|file:)/i.test(src)) return src;
    const slash = notePath ? notePath.lastIndexOf('/') : -1;
    const folder = slash >= 0 ? notePath.slice(0, slash + 1) : '';
    const joined = src.startsWith('./') ? folder + src.slice(2) : (src.startsWith('../') ? src : folder + src);
    return `/vault/${encodeVaultPath(joined)}`;
  }

  class ImagePreviewWidget extends WidgetType {
    constructor(src, alt, width, notePath) {
      super(); this.src = src; this.alt = alt || ''; this.width = width || ''; this.notePath = notePath || '';
    }
    eq(o) { return o.src === this.src && o.alt === this.alt && o.width === this.width && o.notePath === this.notePath; }
    toDOM() {
      const wrap = document.createElement('span');
      wrap.className = 'cm-live-image-wrap';
      const img = document.createElement('img');
      img.className = 'cm-live-image'; img.loading = 'lazy'; img.decoding = 'async';
      img.alt = this.alt || this.src; img.src = resolveImageSource(this.src, this.notePath);
      if (this.width && /^\d{1,4}$/.test(this.width)) img.style.maxWidth = `${this.width}px`;
      wrap.appendChild(img); return wrap;
    }
    ignoreEvent() { return false; }
  }

  class TaskCheckboxWidget extends WidgetType {
    constructor(checked, from, to) { super(); this.checked = checked; this.from = from; this.to = to; }
    eq(o) { return o.checked === this.checked && o.from === this.from && o.to === this.to; }
    toDOM(view) {
      const input = document.createElement('input');
      input.type = 'checkbox'; input.className = 'cm-live-task-checkbox'; input.checked = this.checked;
      input.addEventListener('change', () => view.dispatch({
        changes: { from: this.from, to: this.to, insert: input.checked ? '[x]' : '[ ]' }
      }));
      return input;
    }
    ignoreEvent() { return true; }
  }
  class HorizontalRuleWidget extends WidgetType {
    toDOM() { const hr = document.createElement('hr'); hr.className = 'cm-live-hr'; return hr; }
  }


  class ListMarkerWidget extends WidgetType {
    constructor(label, ordered) { super(); this.label = label; this.ordered = !!ordered; }
    eq(other) { return other.label === this.label && other.ordered === this.ordered; }
    toDOM() {
      const span = document.createElement('span');
      span.className = `cm-live-list-marker${this.ordered ? ' is-ordered' : ''}`;
      span.textContent = this.label;
      return span;
    }
  }

  class FootnoteRefWidget extends WidgetType {
    constructor(id) { super(); this.id = id; }
    eq(other) { return other.id === this.id; }
    toDOM() {
      const sup = document.createElement('sup');
      sup.className = 'cm-live-footnote-widget';
      sup.textContent = this.id;
      return sup;
    }
  }

  class InlinePreviewWidget extends WidgetType {
    constructor(raw, notePath, kind) { super(); this.raw = raw; this.notePath = notePath || ''; this.kind = kind || 'inline'; }
    eq(other) { return other.raw === this.raw && other.notePath === this.notePath && other.kind === this.kind; }
    toDOM() {
      const span = document.createElement('span');
      span.className = `cm-live-inline-widget cm-live-inline-${this.kind}`;
      const bridge = window.ObsidianQuickViewLiveRenderer;
      if (bridge && typeof bridge.renderInline === 'function') span.innerHTML = bridge.renderInline(this.raw, this.notePath);
      else span.textContent = this.raw;
      if (bridge && typeof bridge.enhance === 'function') setTimeout(() => bridge.enhance(span), 0);
      return span;
    }
    ignoreEvent() { return false; }
  }

  function splitTableCells(line) {
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
        const ticks = '`'.repeat(run);
        current += ticks;
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
  }

  function isTableSeparator(line) {
    const cells = splitTableCells(line);
    return cells.length > 0 && cells.every(cell => /^:?-{2,}:?$/.test(cell.trim()));
  }

  function tableAlignment(cell) {
    const t = String(cell || '').trim();
    if (t.startsWith(':') && t.endsWith(':')) return 'center';
    if (t.endsWith(':')) return 'right';
    if (t.startsWith(':')) return 'left';
    return '';
  }

  function escapeTableCell(value) {
    const text = String(value || '').replace(/\r?\n/g, ' ').trim();
    let out = '', escaped = false, codeTicks = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === '\\') { out += ch; escaped = true; continue; }
      if (ch === '`') {
        let run = 1;
        while (i + run < text.length && text[i + run] === '`') run++;
        out += '`'.repeat(run);
        if (codeTicks === 0) codeTicks = run;
        else if (codeTicks === run) codeTicks = 0;
        i += run - 1;
        continue;
      }
      if (ch === '|' && codeTicks === 0) out += '\\|';
      else out += ch;
    }
    return out;
  }

  function parseTableBlock(raw) {
    const lines = String(raw || '').split('\n');
    if (lines.length < 2 || !isTableSeparator(lines[1])) return null;
    const separator = splitTableCells(lines[1]);
    const rows = [splitTableCells(lines[0]), ...lines.slice(2).map(splitTableCells)];
    const width = Math.max(separator.length, ...rows.map(r => r.length));
    rows.forEach(row => { while (row.length < width) row.push(''); });
    while (separator.length < width) separator.push('---');
    return { rows, separator, width };
  }

  function serializeTableBlock(model) {
    const row = cells => `| ${cells.map(escapeTableCell).join(' | ')} |`;
    const out = [row(model.rows[0] || [])];
    out.push(row(model.separator.map(cell => {
      const t = String(cell || '').trim();
      if (/^:?-{2,}:?$/.test(t)) return t;
      return '---';
    })));
    for (let i = 1; i < model.rows.length; i++) out.push(row(model.rows[i]));
    return out.join('\n');
  }

  function renderInlineMarkdown(text, notePath) {
    const bridge = window.ObsidianQuickViewLiveRenderer;
    if (bridge && typeof bridge.renderInline === 'function') return bridge.renderInline(text, notePath);
    const span = document.createElement('span'); span.textContent = text; return span.innerHTML;
  }

  function capturePointerSurface(element) {
    return {
      rect: element && typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null,
      visibleText: element ? String(element.textContent || '') : ''
    };
  }

  function pointerRatio(event, surface) {
    if (!event || typeof event.clientX !== 'number' || !surface) return null;
    const rect = surface.rect || (typeof surface.getBoundingClientRect === 'function' ? surface.getBoundingClientRect() : surface);
    if (!rect || rect.width <= 1) return null;
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  }

  function visibleOffsetToSource(value, visibleText, visibleOffset) {
    const source = String(value ?? '');
    const visible = String(visibleText || '');
    if (!visible || visibleOffset <= 0) return 0;
    if (visibleOffset >= visible.length) return source.length;
    // Map rendered text back to its source as a monotonic subsequence. This
    // naturally skips **, _, backticks, wikilink wrappers, and similar syntax.
    let sourcePos = 0;
    let mapped = 0;
    for (let i = 0; i < visible.length && i < visibleOffset; i++) {
      const found = source.indexOf(visible[i], sourcePos);
      if (found < 0) return Math.round((visibleOffset / visible.length) * source.length);
      sourcePos = found + 1;
      mapped = sourcePos;
    }
    return Math.max(0, Math.min(source.length, mapped));
  }

  function caretOffsetFromPointer(event, surface, value) {
    const ratio = pointerRatio(event, surface);
    const text = String(value ?? '');
    if (ratio == null) return text.length;
    const visible = String(surface && surface.visibleText || '');
    if (visible) return visibleOffsetToSource(text, visible, Math.round(ratio * visible.length));
    return Math.max(0, Math.min(text.length, Math.round(ratio * text.length)));
  }

  function focusInputAtPointer(input, event, sourceSurface, value) {
    input.focus();
    const type = String(input.type || '').toLowerCase();
    if (typeof input.setSelectionRange !== 'function' || ['number', 'date', 'datetime-local', 'checkbox'].includes(type)) return;
    const offset = caretOffsetFromPointer(event, sourceSurface, value);
    try { input.setSelectionRange(offset, offset); } catch (_) {}
  }

  function logClickDebug(data) {
    if (typeof window !== 'undefined' && window.__OQ_DEBUG_CLICK) {
      console.log('CLICK DEBUG', data);
    }
  }

  function sourcePositionFromPointer(raw, from, event, element) {
    const text = String(raw || '');
    const lines = text.split('\n');
    if (!event || !element || typeof element.getBoundingClientRect !== 'function') return Math.min(from + text.length, from + 1);
    const rect = element.getBoundingClientRect();
    const yRatio = rect.height > 1 ? Math.max(0, Math.min(0.999999, (event.clientY - rect.top) / rect.height)) : 0;
    const lineIndex = Math.min(lines.length - 1, Math.floor(yRatio * lines.length));
    const targetLine = lines[lineIndex] || '';
    const xRatio = rect.width > 1 ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0;
    let offset = 0;
    for (let i = 0; i < lineIndex; i++) offset += lines[i].length + 1;
    offset += Math.max(0, Math.min(targetLine.length, Math.round(xRatio * targetLine.length)));
    return from + Math.max(0, Math.min(text.length, offset));
  }

  class TablePreviewWidget extends WidgetType {
    constructor(raw, from, to, notePath) {
      super(); this.raw = raw; this.from = from; this.to = to; this.notePath = notePath || '';
    }
    eq(other) { return other.raw === this.raw && other.from === this.from && other.to === this.to && other.notePath === this.notePath; }
    toDOM(view) {
      const model = parseTableBlock(this.raw);
      const wrap = document.createElement('div');
      wrap.className = 'cm-live-rendered-block cm-live-table-widget markdown-body';
      wrap.dataset.tableFrom = String(this.from);
      if (!model) { wrap.textContent = this.raw; return wrap; }

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const tbody = document.createElement('tbody');

      const focusCellAfterRender = (rowIndex, colIndex) => {
        setTimeout(() => {
          const root = view.dom.closest('#cm-editor-mount') || view.dom.parentElement || document;
          const selector = `.cm-live-table-widget[data-table-from="${this.from}"] [data-row="${rowIndex}"][data-col="${colIndex}"] .cm-live-table-cell-display`;
          const target = root.querySelector(selector);
          if (!target) return;
          target.focus();
          const rect = target.getBoundingClientRect();
          target.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true, cancelable: true, button: 0,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
          }));
        }, 0);
      };

      const commit = (rowIndex, colIndex, value, request, nextCell) => {
        model.rows[rowIndex][colIndex] = String(value || '').replace(/\r?\n/g, ' ');
        const next = serializeTableBlock(model);
        view.dispatch({ changes: { from: this.from, to: this.to, insert: next } });
        if (nextCell) focusCellAfterRender(nextCell.row, nextCell.col);
        if (request === 'save') setTimeout(() => window.dispatchEvent(new CustomEvent('oq-live-save-request')), 0);
        if (request === 'toggle') setTimeout(() => window.dispatchEvent(new CustomEvent('oq-live-toggle-request')), 0);
      };

      const adjacentCell = (rowIndex, colIndex, direction) => {
        const total = model.rows.length * model.width;
        const flat = rowIndex * model.width + colIndex + direction;
        if (flat < 0 || flat >= total) return null;
        return { row: Math.floor(flat / model.width), col: flat % model.width };
      };

      const makeCell = (tag, rowIndex, colIndex) => {
        const cell = document.createElement(tag);
        cell.dataset.row = String(rowIndex);
        cell.dataset.col = String(colIndex);
        const alignment = tableAlignment(model.separator[colIndex]);
        if (alignment) cell.style.textAlign = alignment;

        const display = document.createElement('span');
        display.className = 'cm-live-table-cell-display';
        display.innerHTML = renderInlineMarkdown(model.rows[rowIndex][colIndex], this.notePath);
        display.tabIndex = 0;

        const activate = (event) => {
          if (event) { event.preventDefault(); event.stopPropagation(); }
          if (cell.querySelector('input')) return;
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'cm-live-table-cell-input';
          input.value = model.rows[rowIndex][colIndex];
          input.setAttribute('aria-label', `Edit table cell ${rowIndex + 1}, ${colIndex + 1}`);
          const sourceSurface = capturePointerSurface(display);
          display.replaceWith(input);
          focusInputAtPointer(input, event, sourceSurface, input.value);

          let done = false;
          const finish = (save, request, nextCell) => {
            if (done) return;
            done = true;
            if (save) commit(rowIndex, colIndex, input.value, request, nextCell);
            else input.replaceWith(display);
          };

          input.addEventListener('blur', () => finish(true));
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); return; }
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); return; }
            if (e.key === 'Tab') {
              e.preventDefault(); e.stopPropagation();
              finish(true, null, adjacentCell(rowIndex, colIndex, e.shiftKey ? -1 : 1));
              return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); finish(true, 'save'); return; }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); e.stopPropagation(); finish(true, 'toggle'); }
          });
        };

        display.addEventListener('mousedown', activate);
        display.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') activate(e); });
        cell.appendChild(display);
        return cell;
      };

      const headerRow = document.createElement('tr');
      for (let c = 0; c < model.width; c++) headerRow.appendChild(makeCell('th', 0, c));
      thead.appendChild(headerRow);
      for (let r = 1; r < model.rows.length; r++) {
        const tr = document.createElement('tr');
        for (let c = 0; c < model.width; c++) tr.appendChild(makeCell('td', r, c));
        tbody.appendChild(tr);
      }

      table.appendChild(thead);
      table.appendChild(tbody);
      wrap.appendChild(table);
      return wrap;
    }
    ignoreEvent() { return true; }
  }

  function parseFrontmatterProperties(raw) {
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
        inlineListStyle: /^\[[\s\S]*\]$/.test(inline),
        indent: continuation.length ? ((continuation[0].match(/^(\s*)/) || ['', '  '])[1] || '  ') : '  ',
        from: offsets[i],
        to: endLine + 1 < lines.length ? offsets[endLine + 1] - 1 : raw.length,
        display: inline || (listValues.length ? listValues.join(', ') : '')
      });
      i = endLine;
    }
    return props;
  }

  function serializeFrontmatterProperty(prop, value) {
    const clean = String(value ?? '').replace(/\r?\n/g, ' ').trim();
    const values = clean.replace(/^\[|\]$/g, '').split(',').map(v => v.trim()).filter(Boolean);
    if (prop.listStyle) {
      if (!values.length) return `${prop.key}: []`;
      return `${prop.key}:\n${values.map(v => `${prop.indent}- ${v}`).join('\n')}`;
    }
    if (prop.inlineListStyle) return `${prop.key}: [${values.join(', ')}]`;
    return `${prop.key}: ${clean}`;
  }

  function inferPropertyType(prop) {
    const value = String(prop.display || '').trim();
    const key = String(prop.key || '').toLowerCase();
    if (prop.listStyle || prop.inlineListStyle || key === 'tags' || key === 'aliases' || key === 'cssclasses') return 'list';
    if (/^(true|false)$/i.test(value)) return 'checkbox';
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return 'number';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return 'datetime-local';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
    return 'text';
  }

  function renderPropertyValueNode(valueNode, prop) {
    valueNode.replaceChildren();
    const type = inferPropertyType(prop);
    if (type === 'list') {
      const values = (prop.listValues && prop.listValues.length)
        ? prop.listValues
        : String(prop.display || '').replace(/^\[|\]$/g, '').split(',').map(v => v.trim()).filter(Boolean);
      if (!values.length) { valueNode.textContent = '—'; return; }
      for (const raw of values) {
        const chip = document.createElement('span');
        chip.className = 'cm-live-property-chip';
        const clean = String(raw).replace(/^['"]|['"]$/g, '');
        chip.textContent = String(prop.key || '').toLowerCase() === 'tags' && !clean.startsWith('#') ? `#${clean}` : clean;
        valueNode.appendChild(chip);
      }
      return;
    }
    if (type === 'checkbox') {
      const box = document.createElement('input');
      box.type = 'checkbox'; box.checked = /^true$/i.test(prop.display); box.tabIndex = -1;
      box.className = 'cm-live-property-checkbox-display';
      valueNode.appendChild(box);
      return;
    }
    valueNode.textContent = prop.display || '—';
  }

  class FrontmatterPreviewWidget extends WidgetType {
    constructor(raw, from, to) { super(); this.raw = raw; this.from = from; this.to = to; }
    eq(other) { return other.raw === this.raw && other.from === this.from && other.to === this.to; }
    toDOM(view) {
      const wrap = document.createElement('div');
      wrap.className = 'cm-live-rendered-block cm-live-properties';
      const title = document.createElement('div');
      title.className = 'cm-live-properties-title';
      title.textContent = 'Properties';
      wrap.appendChild(title);
      const props = parseFrontmatterProperties(this.raw);
      if (!props.length) {
        const empty = document.createElement('div');
        empty.className = 'cm-live-properties-empty';
        empty.textContent = 'No properties';
        wrap.appendChild(empty);
        return wrap;
      }
      for (const prop of props) {
        const row = document.createElement('div'); row.className = 'cm-live-property-row';
        const key = document.createElement('span'); key.className = 'cm-live-property-key'; key.textContent = prop.key;
        const val = document.createElement('span'); val.className = 'cm-live-property-value'; val.tabIndex = 0; renderPropertyValueNode(val, prop);
        row.append(key, val);
        const activate = (event) => {
          if (event) { event.preventDefault(); event.stopPropagation(); }
          if (row.querySelector('.cm-live-property-input')) return;
          const propertyType = inferPropertyType(prop);
          const input = document.createElement(propertyType === 'list' ? 'textarea' : 'input');
          if (propertyType !== 'list') input.type = propertyType;
          input.className = `cm-live-property-input cm-live-property-${propertyType}`;
          if (propertyType === 'checkbox') input.checked = /^true$/i.test(prop.display);
          else input.value = prop.display;
          if (propertyType === 'list') input.rows = 1;
          const sourceSurface = capturePointerSurface(val);
          val.replaceWith(input);
          focusInputAtPointer(input, event, sourceSurface, propertyType === 'checkbox' ? '' : input.value);
          let done = false;
          const finish = (commit, request) => {
            if (done) return; done = true;
            if (!commit) { input.replaceWith(val); return; }
            const nextValue = propertyType === 'checkbox' ? (input.checked ? 'true' : 'false') : input.value;
            const replacement = serializeFrontmatterProperty(prop, nextValue);
            view.dispatch({ changes: { from: this.from + prop.from, to: this.from + prop.to, insert: replacement } });
            if (request === 'save') setTimeout(() => window.dispatchEvent(new CustomEvent('oq-live-save-request')), 0);
            if (request === 'toggle') setTimeout(() => window.dispatchEvent(new CustomEvent('oq-live-toggle-request')), 0);
          };
          input.addEventListener('blur', () => finish(true));
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); return; }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); finish(true); return; }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); finish(true, 'save'); return; }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); e.stopPropagation(); finish(true, 'toggle'); }
          });
        };
        val.addEventListener('mousedown', activate);
        val.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') activate(e); });
        wrap.appendChild(row);
      }
      return wrap;
    }
    ignoreEvent() { return true; }
  }

  class RenderedBlockWidget extends WidgetType {
    constructor(raw, from, to, notePath, kind) {
      super(); this.raw = raw; this.from = from; this.to = to; this.notePath = notePath || ''; this.kind = kind || 'markdown';
    }
    eq(other) {
      return other.raw === this.raw && other.from === this.from && other.to === this.to && other.notePath === this.notePath && other.kind === this.kind;
    }
    toDOM(view) {
      const wrap = document.createElement('div');
      wrap.className = `cm-live-rendered-block cm-live-block-widget cm-live-block-${this.kind} markdown-body`;
      const bridge = window.ObsidianQuickViewLiveRenderer;
      if (bridge && typeof bridge.render === 'function') wrap.innerHTML = bridge.render(this.raw, this.notePath);
      else wrap.textContent = this.raw;
      wrap.title = 'Click to edit this block';
      wrap.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        const anchor = Math.max(this.from, Math.min(this.to, sourcePositionFromPointer(this.raw, this.from, event, wrap)));
        logClickDebug({
          type: this.kind,
          clientX: event.clientX,
          clientY: event.clientY,
          from: this.from,
          to: this.to,
          anchor,
          selBefore: view.state.selection.main.head
        });
        view.dispatch({ selection: { anchor }, scrollIntoView: true });
        view.focus();
      });
      if (bridge && typeof bridge.enhance === 'function') setTimeout(() => bridge.enhance(wrap), 0);
      return wrap;
    }
    ignoreEvent() { return true; }
  }

  const intersects = (af, at, bf, bt) => af < bt && at > bf;

  function selectionTouches(state, from, to) {
    return state.selection.ranges.some(range => {
      if (range.empty) return range.from >= from && range.from <= to;
      return range.from < to && range.to > from;
    });
  }

  function looksLikeTableRow(text) {
    const trimmed = String(text || '').trim();
    return trimmed.includes('|') && !/^(?:```|~~~)/.test(trimmed);
  }

  // Parse structural Markdown once per immutable CM6 Text document. Selection
  // moves reuse the same tiny block index instead of rescanning every line.
  // WeakMap keeps the cache self-cleaning as old EditorState documents are GC'd.
  const structuralBlockCache = new WeakMap();

  function getStructuralBlocks(doc) {
    const cached = structuralBlockCache.get(doc);
    if (cached) return cached;

    const blocks = [];
    const push = (kind, fromLine, toLine, extra = null) => {
      const start = doc.line(fromLine);
      const end = doc.line(toLine);
      blocks.push({ kind, fromLine, toLine, from: start.from, to: end.to, extra });
    };

    let lineNo = 1;

    if (doc.lines >= 2 && doc.line(1).text.trim() === '---') {
      let fmEnd = 0;
      for (let n = 2; n <= Math.min(doc.lines, 400); n++) {
        if (doc.line(n).text.trim() === '---') { fmEnd = n; break; }
      }
      if (fmEnd) {
        push('frontmatter', 1, fmEnd);
        lineNo = fmEnd + 1;
      }
    }

    while (lineNo <= doc.lines) {
      const text = doc.line(lineNo).text;

      const fenceOpen = text.match(/^\s*(`{3,}|~{3,})(.*)$/);
      if (fenceOpen) {
        const marker = fenceOpen[1][0];
        const minLen = fenceOpen[1].length;
        let endLine = lineNo;
        for (let n = lineNo + 1; n <= doc.lines; n++) {
          endLine = n;
          const close = doc.line(n).text.match(/^\s*(`{3,}|~{3,})\s*$/);
          if (close && close[1][0] === marker && close[1].length >= minLen) break;
        }
        const lang = (fenceOpen[2] || '').trim().split(/\s+/)[0].toLowerCase();
        push('fence', lineNo, endLine, { lang });
        lineNo = endLine + 1;
        continue;
      }

      if (/^\s*\$\$/.test(text)) {
        let endLine = lineNo;
        const sameLineClosed = /^\s*\$\$[\s\S]*\$\$\s*$/.test(text) && !/^\s*\$\$\s*$/.test(text);
        if (!sameLineClosed) {
          for (let n = lineNo + 1; n <= doc.lines; n++) {
            endLine = n;
            if (/\$\$\s*$/.test(doc.line(n).text)) break;
          }
        }
        push('math', lineNo, endLine);
        lineNo = endLine + 1;
        continue;
      }

      if (/^\s*>\s*\[![A-Za-z0-9_-]+\][+-]?/.test(text)) {
        let endLine = lineNo;
        while (endLine < doc.lines && /^\s*>/.test(doc.line(endLine + 1).text)) endLine++;
        push('callout', lineNo, endLine);
        lineNo = endLine + 1;
        continue;
      }

      if (looksLikeTableRow(text) && lineNo < doc.lines && isTableSeparator(doc.line(lineNo + 1).text)) {
        let endLine = lineNo + 1;
        while (endLine < doc.lines && looksLikeTableRow(doc.line(endLine + 1).text)) endLine++;
        push('table', lineNo, endLine);
        lineNo = endLine + 1;
        continue;
      }

      if (/^\[\^([^\]]+)\]:\s*/.test(text)) {
        let endLine = lineNo;
        while (endLine < doc.lines && /^(?: {2,}|\t)\S?/.test(doc.line(endLine + 1).text)) endLine++;
        push('footnote', lineNo, endLine);
        lineNo = endLine + 1;
        continue;
      }

      lineNo++;
    }

    structuralBlockCache.set(doc, blocks);
    return blocks;
  }

  // Structural previews that genuinely replace layout are limited to widgets
  // with their own semantic editor (Properties/Table) plus rendered display math.
  // Callouts, fenced code and footnote definitions keep real CM source lines so
  // pointer-to-caret mapping remains native and exact.
  function structuralBlockIsRendered(state, block) {
    if (block.kind === 'frontmatter' || block.kind === 'table') return true;
    if (block.kind === 'math') return !selectionTouches(state, block.from, block.to);
    return false;
  }

  function structuralWidgetFor(block, raw, notePath) {
    if (block.kind === 'frontmatter') return new FrontmatterPreviewWidget(raw, block.from, block.to);
    if (block.kind === 'table') return new TablePreviewWidget(raw, block.from, block.to, notePath);
    if (block.kind === 'math') return new RenderedBlockWidget(raw, block.from, block.to, notePath, 'math');
    return null;
  }

  function createStructuralBlockExtensions(notePath) {
    if (!EditorView.decorations || typeof EditorView.decorations.compute !== 'function') return [];
    const decorations = EditorView.decorations.compute(['doc', 'selection'], state => {
      const ranges = [];
      for (const block of getStructuralBlocks(state.doc)) {
        if (!structuralBlockIsRendered(state, block)) continue;
        const widget = structuralWidgetFor(block, state.doc.sliceString(block.from, block.to), notePath);
        if (widget) ranges.push(Decoration.replace({ widget, block: true }).range(block.from, block.to));
      }
      return Decoration.set(ranges, true);
    });

    const extensions = [decorations];
    // Replaced structural widgets should behave as single cursor units. This
    // prevents keyboard navigation from landing in invisible source positions.
    if (EditorView.atomicRanges && typeof EditorView.atomicRanges.of === 'function') {
      extensions.push(EditorView.atomicRanges.of(view => {
        const ranges = [];
        for (const block of getStructuralBlocks(view.state.doc)) {
          if (!structuralBlockIsRendered(view.state, block)) continue;
          ranges.push(Decoration.mark({}).range(block.from, block.to));
        }
        return Decoration.set(ranges, true);
      }));
    }
    return extensions;
  }

  function createLivePreviewPlugin(notePath) {
    let plugin = null;
    const emptySet = Decoration.set([]);
    plugin = ViewPlugin.fromClass(class {
      constructor(view) {
        const built = this.build(view);
        this.decorations = built.decorations;
        this.atomic = built.atomic;
      }
      update(update) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          const built = this.build(update.view);
          this.decorations = built.decorations;
          this.atomic = built.atomic;
        }
      }
      build(view) {
        const state = view.state;
        const doc = state.doc;
        const ranges = [], atomicRanges = [], codeRanges = [], seen = new Set();
        const tree = syntaxTree(state);
        const structuralBlocks = getStructuralBlocks(doc);
        const structuralByLine = new Map();
        const replacedBlocks = [];

        for (const block of structuralBlocks) {
          if (structuralBlockIsRendered(state, block)) replacedBlocks.push(block);
          if (block.kind !== 'callout' && block.kind !== 'footnote') continue;
          // Map only lines that are currently visible. A giant callout must not
          // turn every caret movement into an O(block-size) allocation.
          for (const visible of view.visibleRanges) {
            const firstVisible = doc.lineAt(visible.from).number;
            const lastVisible = doc.lineAt(visible.to).number;
            const firstLine = Math.max(block.fromLine, firstVisible);
            const lastLine = Math.min(block.toLine, lastVisible);
            for (let n = firstLine; n <= lastLine; n++) structuralByLine.set(n, block);
          }
        }

        for (const visible of view.visibleRanges) {
          try {
            tree.iterate({ from: visible.from, to: visible.to, enter(node) {
              if (node.name === 'FencedCode') codeRanges.push({ from: node.from, to: node.to });
            }});
          } catch (_) {}
        }

        const inFence = (f, t) => codeRanges.some(r => intersects(f, t, r.from, r.to));
        const inReplacedBlock = (f, t) => replacedBlocks.some(r => intersects(f, t, r.from, r.to));
        const add = (f, t, d) => { if (f <= t) ranges.push(d.range(f, t)); };
        const addReplace = (f, t, spec = {}) => {
          if (f >= t) return;
          const deco = Decoration.replace(spec);
          ranges.push(deco.range(f, t));
          atomicRanges.push(deco.range(f, t));
        };
        const hide = (f, t) => {
          if (f >= t) return;
          ranges.push(syntaxHide.range(f, t));
          atomicRanges.push(syntaxHide.range(f, t));
        };
        const active = (f, t) => selectionTouches(state, f, t);

        for (const visible of view.visibleRanges) {
          const first = doc.lineAt(visible.from).number;
          const last = doc.lineAt(visible.to).number;
          for (let lineNo = first; lineNo <= last; lineNo++) {
            if (seen.has(lineNo)) continue;
            seen.add(lineNo);
            const line = doc.line(lineNo), text = line.text, trimmed = text.trim(), base = line.from;
            if (inReplacedBlock(line.from, Math.max(line.from + 1, line.to))) continue;

            const fenced = inFence(line.from, Math.max(line.from + 1, line.to));
            const structural = structuralByLine.get(lineNo);
            const isCallout = structural && structural.kind === 'callout';
            const isFootnoteDef = structural && structural.kind === 'footnote';

            if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
              add(base, base, lineDecoCodeFence);
              continue;
            }
            if (fenced) add(base, base, lineDecoCodeBlock);

            if (isCallout) {
              const firstLine = lineNo === structural.fromLine;
              const lastLine = lineNo === structural.toLine;
              add(base, base, firstLine && lastLine ? lineDecoCalloutOnly : firstLine ? lineDecoCalloutFirst : lastLine ? lineDecoCalloutLast : lineDecoCallout);
              const quote = text.match(/^(\s*>\s*)/);
              if (quote) {
                const qFrom = base, qTo = base + quote[0].length;
                if (!active(qFrom, qTo)) hide(qFrom, qTo);
                if (firstLine) {
                  const rest = text.slice(quote[0].length);
                  const calloutMarker = rest.match(/^\[![A-Za-z0-9_-]+\][+-]?\s*/);
                  if (calloutMarker) {
                    const mFrom = qTo, mTo = qTo + calloutMarker[0].length;
                    if (!active(mFrom, mTo)) hide(mFrom, mTo);
                  }
                }
              }
            } else if (isFootnoteDef) {
              add(base, base, lineDecoFootnoteDef);
              const marker = text.match(/^\[\^([^\]]+)\]:\s*/);
              if (marker) {
                const mFrom = base, mTo = base + marker[0].length;
                if (!active(mFrom, mTo)) hide(mFrom, mTo);
              }
            } else {
              const heading = text.match(/^(#{1,6})(\s+)/);
              if (heading) {
                add(base, base, headingLineDecorations[heading[1].length]);
                const markerTo = base + heading[0].length;
                if (!active(base, markerTo)) hide(base, markerTo);
              } else if (/^\s*[-*+]\s+\[[xX]\]\s/.test(text)) add(base, base, lineDecoTaskChecked);
              else if (/^\s*[-*+]\s+\[\s\]\s/.test(text)) add(base, base, lineDecoTaskUnchecked);
              else if (/^\s*[-*+]\s/.test(text) || /^\s*\d+\.\s/.test(text)) add(base, base, lineDecoList);
              else if (/^\s*>\s?/.test(text)) {
                add(base, base, lineDecoBlockquote);
                const q = text.match(/^(\s*(?:>\s*)+)/);
                if (q && !active(base, base + q[0].length)) hide(base, base + q[0].length);
              } else if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
                add(base, base, lineDecoHr);
                if (!active(base, line.to)) { addReplace(base, line.to, { widget: new HorizontalRuleWidget() }); continue; }
              }
            }

            // Keep fenced code source native. Inline Markdown processing must not
            // run inside it, but CodeMirror retains exact pointer/caret mapping.
            if (fenced) continue;

            const widgetSpans = [];
            const imagePatterns = [
              /!\[\[([^\]|]+\.(?:png|jpe?g|gif|svg|webp|bmp))(?:\|(\d{1,4}))?\]\]/i,
              /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/
            ];
            for (let pi = 0; pi < imagePatterns.length; pi++) {
              const match = text.match(imagePatterns[pi]);
              if (!match) continue;
              const f = base + match.index, t = f + match[0].length;
              if (active(f, t)) continue;
              const src = pi === 0 ? match[1].trim() : match[2];
              const alt = pi === 0 ? match[1].trim() : match[1];
              const width = pi === 0 ? (match[2] || '') : '';
              addReplace(f, t, { widget: new ImagePreviewWidget(src, alt, width, notePath) });
              widgetSpans.push({ from: f, to: t });
            }

            const protectedSpans = []; let m;
            const codeRegex = /(`+)([^\n]*?)(\1)/g;
            while ((m = codeRegex.exec(text)) !== null) {
              const f = base + m.index, t = f + m[0].length, ml = m[1].length;
              protectedSpans.push({ from: f, to: t });
              if (t - f > ml * 2) add(f + ml, t - ml, markDecoInlineCode);
              if (!active(f, t)) { hide(f, f + ml); hide(t - ml, t); }
            }
            const codeProtected = (f, t) => protectedSpans.some(r => intersects(f, t, r.from, r.to)) || widgetSpans.some(r => intersects(f, t, r.from, r.to));

            const task = text.match(/^(\s*)([-*+]\s+)(\[[ xX]\])/);
            if (task) {
              const markerFrom = base + task[1].length;
              const checkboxFrom = markerFrom + task[2].length;
              const checkboxTo = checkboxFrom + task[3].length;
              if (!active(markerFrom, checkboxTo)) {
                addReplace(markerFrom, checkboxTo, { widget: new TaskCheckboxWidget(/[xX]/.test(task[3]), checkboxFrom, checkboxTo) });
              } else add(markerFrom, markerFrom + task[2].length, markDecoBullet);
            } else {
              const bullet = text.match(/^(\s*)([-*+]|\d+\.)(\s+)/);
              if (bullet) {
                const f = base + bullet[1].length, t = f + bullet[2].length + bullet[3].length;
                if (!active(f, t)) {
                  const ordered = /^\d/.test(bullet[2]);
                  addReplace(f, t, { widget: new ListMarkerWidget(ordered ? bullet[2] : '•', ordered) });
                } else add(f, t, markDecoBullet);
              }
            }

            const emphasisSpans = [];
            const triple = /(\*\*\*|___)([^\n]+?)\1/g;
            while ((m = triple.exec(text)) !== null) {
              const f = base + m.index, t = f + m[0].length;
              if (codeProtected(f, t) || t - f <= 6) continue;
              emphasisSpans.push({ from: f, to: t });
              add(f + 3, t - 3, markDecoBoldItalic);
              if (!active(f, t)) { hide(f, f + 3); hide(t - 3, t); }
            }
            const emphasisProtected = (f, t) => emphasisSpans.some(r => intersects(f, t, r.from, r.to));
            const paired = (regex, ml, deco) => {
              regex.lastIndex = 0;
              while ((m = regex.exec(text)) !== null) {
                const f = base + m.index, t = f + m[0].length;
                if (codeProtected(f, t) || emphasisProtected(f, t) || t - f <= ml * 2) continue;
                add(f + ml, t - ml, deco);
                if (!active(f, t)) { hide(f, f + ml); hide(t - ml, t); }
              }
            };
            paired(/\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g, 2, markDecoBold);
            paired(/~~([^~\n]+?)~~/g, 2, markDecoStrikethrough);
            paired(/(?<!\*)\*([^*\n]+?)\*(?!\*)|(?<!_)_([^_\n]+?)_(?!_)/g, 1, markDecoItalic);

            const inlineMath = /(^|[^\\])\$([^\s$\n](?:[^$\n]*?[^\s$\n])?)\$/g;
            while ((m = inlineMath.exec(text)) !== null) {
              const prefix = m[1] || '', raw = m[0].slice(prefix.length);
              const f = base + m.index + prefix.length, t = f + raw.length;
              if (!codeProtected(f, t) && !active(f, t)) addReplace(f, t, { widget: new InlinePreviewWidget(raw, notePath, 'math') });
            }

            const highlight = /==([^=\n](?:.*?[^=\n])?)==/g;
            while ((m = highlight.exec(text)) !== null) {
              const f = base + m.index, t = f + m[0].length;
              if (codeProtected(f, t)) continue;
              add(f + 2, t - 2, markDecoHighlight);
              if (!active(f, t)) { hide(f, f + 2); hide(t - 2, t); }
            }
            const comment = /%%.*?%%/g;
            while ((m = comment.exec(text)) !== null) {
              const f = base + m.index, t = f + m[0].length;
              if (!active(f, t) && !codeProtected(f, t)) hide(f, t);
            }
            const footnoteRef = /\[\^([^\]\n]+)\]/g;
            while ((m = footnoteRef.exec(text)) !== null) {
              const f = base + m.index, t = f + m[0].length;
              if (codeProtected(f, t) || isFootnoteDef && f === base) continue;
              if (!active(f, t)) addReplace(f, t, { widget: new FootnoteRefWidget(m[1]) });
              else add(f, t, markDecoFootnote);
            }
            const blockId = /(?:^|\s)(\^[A-Za-z0-9-]+)\s*$/g;
            while ((m = blockId.exec(text)) !== null) {
              const off = m[0].indexOf('^'), f = base + m.index + off, t = f + m[1].length;
              if (codeProtected(f, t)) continue;
              add(f, t, markDecoBlockId);
              if (!active(f, t)) hide(f, t);
            }

            const wiki = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;
            while ((m = wiki.exec(text)) !== null) {
              const f = base + m.index, t = f + m[0].length;
              if (codeProtected(f, t)) continue;
              const vs = m[2] ? f + m[0].indexOf('|') + 1 : f + 2, ve = t - 2;
              if (vs < ve) add(vs, ve, markDecoWikilink);
              if (!active(f, t)) { hide(f, vs); hide(ve, t); }
            }
            const link = /(?<!!)\[([^\]\n]+)\]\(([^)\n]+)\)/g;
            while ((m = link.exec(text)) !== null) {
              const f = base + m.index, t = f + m[0].length;
              if (codeProtected(f, t)) continue;
              const ls = f + 1, le = ls + m[1].length;
              add(ls, le, markDecoWikilink);
              if (!active(f, t)) { hide(f, ls); hide(le, t); }
            }
            const tag = /(?:^|\s)(#[\p{L}\p{N}_\-/]+)/gu;
            while ((m = tag.exec(text)) !== null) {
              const off = m[0].indexOf('#'), f = base + m.index + off;
              if (!codeProtected(f, f + m[1].length)) add(f, f + m[1].length, markDecoTag);
            }
          }
        }
        return { decorations: Decoration.set(ranges, true), atomic: Decoration.set(atomicRanges, true) };
      }
    }, { decorations: value => value.decorations });

    const extensions = [plugin];
    if (EditorView.atomicRanges && typeof EditorView.atomicRanges.of === 'function') {
      extensions.push(EditorView.atomicRanges.of(view => {
        const instance = view.plugin(plugin);
        return instance ? instance.atomic : emptySet;
      }));
    }
    return extensions;
  }

  function createLivePreviewExtensions(notePath) {
    return [...createStructuralBlockExtensions(notePath), ...createLivePreviewPlugin(notePath)];
  }


  function normalizeForMatch(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function positionIsCode(state, pos) {
    try {
      const tree = syntaxTree(state);
      let node = typeof tree.resolveInner === 'function' ? tree.resolveInner(pos, -1) : tree.resolve(pos, -1);
      while (node) {
        if (/Code|FencedCode|CodeText/.test(node.name || '')) return true;
        node = node.parent;
      }
    } catch (_) {}
    return false;
  }

  class LightweightCompletionController {
    constructor(view) {
      this.view = view;
      this.enabled = true;
      this.timer = null;
      this.seq = 0;
      this.context = null;
      this.items = [];
      this.selected = 0;
      this.noteCache = new Map();
      this.tags = null;
      this.popup = document.createElement('div');
      this.popup.className = 'oq-cm-completion';
      this.popup.setAttribute('role', 'listbox');
      this.popup.hidden = true;
      document.body.appendChild(this.popup);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onDocumentPointerDown = (event) => {
        if (!this.view.dom.contains(event.target) && !this.popup.contains(event.target)) this.close();
      };
      view.dom.addEventListener('keydown', this.onKeyDown, true);
      document.addEventListener('mousedown', this.onDocumentPointerDown, true);
    }

    setEnabled(enabled) {
      this.enabled = !!enabled;
      if (!this.enabled) this.close();
      else this.schedule();
    }

    getContext() {
      if (!this.enabled) return null;
      const state = this.view.state;
      if (!state.selection || state.selection.ranges.length !== 1) return null;
      const range = state.selection.ranges[0];
      if (!range.empty || positionIsCode(state, range.from)) return null;
      const line = state.doc.lineAt(range.from);
      const before = line.text.slice(0, range.from - line.from);

      const wiki = before.match(/\[\[([^\]\n]*)$/);
      if (wiki) {
        const query = wiki[1];
        // Keep this completion intentionally lightweight: note-title completion
        // only. Heading/block completion can remain native source typing.
        if (/[|#^]/.test(query)) return null;
        return { kind: 'wiki', query, from: range.from - query.length, to: range.from };
      }

      const tag = before.match(/(^|\s)#([\p{L}\p{N}_\-/]*)$/u);
      if (tag) {
        const query = tag[2] || '';
        const hashOffset = before.length - query.length - 1;
        // A bare '#' at the beginning of a line is most likely a heading marker.
        if (!query && before.slice(0, hashOffset).trim() === '') return null;
        return { kind: 'tag', query, from: range.from - query.length, to: range.from };
      }
      return null;
    }

    onUpdate(update) {
      if (!this.enabled) return;
      if (update.docChanged || update.selectionSet) this.schedule();
      else if (update.viewportChanged && !this.popup.hidden) this.position();
    }

    schedule() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.refresh(), 85);
    }

    async refresh() {
      const context = this.getContext();
      this.context = context;
      if (!context) { this.close(); return; }
      const seq = ++this.seq;
      try {
        const items = context.kind === 'wiki'
          ? await this.loadNotes(context.query)
          : await this.loadTags(context.query);
        if (seq !== this.seq) return;
        const latest = this.getContext();
        if (!latest || latest.kind !== context.kind || latest.from !== context.from || latest.to !== context.to || latest.query !== context.query) return;
        this.context = latest;
        this.items = items.slice(0, 8);
        this.selected = 0;
        this.render();
      } catch (_) {
        if (seq === this.seq) this.close();
      }
    }

    async loadNotes(query) {
      const key = normalizeForMatch(query);
      if (this.noteCache.has(key)) return this.noteCache.get(key);
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&mode=title&limit=8`);
      if (!response.ok) return [];
      const data = await response.json();
      const items = (data.results || []).map(item => ({
        value: item.title || String(item.path || '').replace(/\.md$/i, '').split('/').pop(),
        label: item.title || item.path,
        detail: item.folder || '',
        path: item.path || ''
      })).filter(item => item.value);
      if (this.noteCache.size > 32) this.noteCache.clear();
      this.noteCache.set(key, items);
      return items;
    }

    async loadTags(query) {
      if (!this.tags) {
        const response = await fetch('/api/tags');
        if (!response.ok) return [];
        const data = await response.json();
        this.tags = (data.tags || []).map(item => ({ value: item.tag || '', label: `#${item.tag || ''}`, detail: item.count ? String(item.count) : '' })).filter(item => item.value);
      }
      const q = normalizeForMatch(query);
      return this.tags
        .filter(item => !q || normalizeForMatch(item.value).includes(q))
        .sort((a, b) => {
          const av = normalizeForMatch(a.value), bv = normalizeForMatch(b.value);
          const ap = q && av.startsWith(q) ? 0 : 1, bp = q && bv.startsWith(q) ? 0 : 1;
          return ap - bp || av.length - bv.length || av.localeCompare(bv);
        })
        .slice(0, 8);
    }

    render() {
      this.popup.replaceChildren();
      if (!this.items.length || !this.context) { this.close(); return; }
      this.items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = `oq-cm-completion-item${index === this.selected ? ' is-selected' : ''}`;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', index === this.selected ? 'true' : 'false');
        const main = document.createElement('span');
        main.className = 'oq-cm-completion-label';
        main.textContent = item.label || item.value;
        row.appendChild(main);
        if (item.detail) {
          const detail = document.createElement('span');
          detail.className = 'oq-cm-completion-detail';
          detail.textContent = item.detail;
          row.appendChild(detail);
        }
        row.addEventListener('mousedown', event => {
          event.preventDefault();
          event.stopPropagation();
          this.selected = index;
          this.accept();
        });
        this.popup.appendChild(row);
      });
      this.popup.hidden = false;
      this.position();
    }

    position() {
      if (this.popup.hidden || !this.context) return;
      const coords = this.view.coordsAtPos(this.context.to);
      if (!coords) return;
      const width = Math.min(360, Math.max(220, window.innerWidth - 24));
      let left = Math.max(8, Math.min(coords.left, window.innerWidth - width - 8));
      let top = coords.bottom + 6;
      const estimatedHeight = Math.min(280, this.items.length * 38 + 8);
      if (top + estimatedHeight > window.innerHeight - 8) top = Math.max(8, coords.top - estimatedHeight - 6);
      this.popup.style.left = `${left}px`;
      this.popup.style.top = `${top}px`;
      this.popup.style.width = `${width}px`;
    }

    move(delta) {
      if (!this.items.length) return;
      this.selected = (this.selected + delta + this.items.length) % this.items.length;
      this.render();
      const selected = this.popup.querySelector('.is-selected');
      if (selected) selected.scrollIntoView({ block: 'nearest' });
    }

    accept() {
      if (!this.context || !this.items.length) return false;
      const item = this.items[this.selected];
      if (!item) return false;
      const insert = this.context.kind === 'wiki' ? `${item.value}]]` : item.value;
      const from = this.context.from;
      this.view.dispatch({
        changes: { from, to: this.context.to, insert },
        selection: { anchor: from + insert.length }
      });
      this.close();
      this.view.focus();
      return true;
    }

    onKeyDown(event) {
      if (this.popup.hidden || !this.items.length) return;
      if (event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); this.move(1); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); this.move(-1); return; }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); this.accept(); return; }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
    }

    close() {
      clearTimeout(this.timer);
      this.timer = null;
      this.seq++;
      this.context = null;
      this.items = [];
      this.selected = 0;
      this.popup.hidden = true;
      this.popup.replaceChildren();
    }

    destroy() {
      clearTimeout(this.timer);
      this.view.dom.removeEventListener('keydown', this.onKeyDown, true);
      document.removeEventListener('mousedown', this.onDocumentPointerDown, true);
      this.popup.remove();
      this.items = [];
      this.tags = null;
      this.noteCache.clear();
    }
  }

  function createEditor(parent, options) {
    options = options || {};
    let currentTheme = options.theme === 'light' ? 'light' : 'dark';
    let currentLive = options.livePreview !== false;
    const notePath = options.notePath || '';
    const onSave = options.onSave || function () {};
    const onCancel = options.onCancel || function () {};
    const onChange = options.onChange || function () {};
    let completionController = null;
    const themeCompartment = new Compartment(), liveCompartment = new Compartment(), classCompartment = new Compartment();
    const customKeymap = keymap.of([
      indentWithTab,
      { key: 'Mod-s', run: () => { onSave(); return true; } },
      { key: 'Escape', run: () => { onCancel(); return true; } }
    ]);
    const listener = EditorView.updateListener.of(update => {
      if (update.docChanged) onChange({ length: update.state.doc.length, lines: update.state.doc.lines, changes: update.changes });
      if (completionController) completionController.onUpdate(update);
    });
    const attrs = live => EditorView.editorAttributes.of({ class: live ? 'cm-live-mode' : 'cm-source-mode' });
    const buildState = text => EditorState.create({
      doc: text || '',
      extensions: [
        basicSetup, markdown(), EditorView.lineWrapping, customKeymap, listener,
        classCompartment.of(attrs(currentLive)),
        themeCompartment.of(currentTheme === 'light' ? lightTheme : darkTheme),
        liveCompartment.of(currentLive ? createLivePreviewExtensions(notePath) : [])
      ]
    });
    const view = new EditorView({ state: buildState(options.doc || ''), parent });
    completionController = new LightweightCompletionController(view);
    completionController.setEnabled(currentLive);
    return {
      view,
      getValue() { return view.state.doc.toString(); },
      getStats() { return { lines: view.state.doc.lines, length: view.state.doc.length }; },
      getHeadings() {
        const headings = [], doc = view.state.doc;
        try {
          syntaxTree(view.state).iterate({ enter(node) {
            const mm = /^ATXHeading([1-6])$/.exec(node.name); if (!mm) return;
            const line = doc.lineAt(node.from), text = line.text.replace(/^#{1,6}\s+/, '').trim();
            if (text) headings.push({ level: Number(mm[1]), text, lineNumber: line.number, lineFrom: line.from });
          }});
        } catch (_) {
          for (let n = 1; n <= doc.lines; n++) { const line = doc.line(n), mm = line.text.match(/^(#{1,6})\s+(.+)$/); if (mm) headings.push({ level: mm[1].length, text: mm[2].trim(), lineNumber: n, lineFrom: line.from }); }
        }
        return headings;
      },
      setValue(text) { view.setState(buildState(text || '')); },
      setTheme(theme) { currentTheme = theme === 'light' ? 'light' : 'dark'; view.dispatch({ effects: themeCompartment.reconfigure(currentTheme === 'light' ? lightTheme : darkTheme) }); },
      setLivePreview(enabled) {
        currentLive = !!enabled;
        if (completionController) completionController.setEnabled(currentLive);
        view.dispatch({ effects: [liveCompartment.reconfigure(currentLive ? createLivePreviewExtensions(notePath) : []), classCompartment.reconfigure(attrs(currentLive))] });
      },
      focus() { view.focus(); },
      scrollToLine(lineNumber) {
        if (lineNumber < 1 || lineNumber > view.state.doc.lines) return;
        const line = view.state.doc.line(lineNumber);
        view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true }); view.focus();
      },
      destroy() { if (completionController) completionController.destroy(); completionController = null; view.destroy(); }
    };
  }

  window.ObsidianCM6 = { createEditor };
  window.__OQCM6_RUNTIME_V23 = true;
  window.__OQCM6_RUNTIME_V27 = true;
  window.__OQCM6_RUNTIME_V29 = true;
  window.__OQCM6_RUNTIME_V31 = true;
  window.__OQCM6_RUNTIME_V32 = true;
  window.__OQCM6_RUNTIME_V33 = true;
})();
