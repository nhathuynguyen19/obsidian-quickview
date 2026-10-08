/**
 * Obsidian QuickView Client Application
 * Blazing fast, zero external bloat, offline-ready
 */

(function () {
  'use strict';

  // State
  let currentNote = null;
  let isEditing = false;
  let searchResults = [];
  let selectedIndex = 0;
  let searchDebounceTimer = null;
  let currentTheme = localStorage.getItem('obs_theme') || 'dark';

  // Navigation History Stack
  const noteHistory = [];
  let historyIndex = -1;

  // Apply theme
  document.documentElement.setAttribute('data-theme', currentTheme);

  // DOM Elements
  const sidebar = document.getElementById('sidebar');
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const btnTheme = document.getElementById('btn-theme');
  const btnSettings = document.getElementById('btn-settings');
  const settingsModalBackdrop = document.getElementById('settings-modal-backdrop');
  const btnCloseSettingsModal = document.getElementById('btn-close-settings-modal');
  const btnHistoryBack = document.getElementById('btn-history-back');
  const btnHistoryForward = document.getElementById('btn-history-forward');
  const btnTriggerSearch = document.getElementById('btn-trigger-search');
  const btnTriggerContentSearch = document.getElementById('btn-trigger-content-search');
  const tabSearchTitle = document.getElementById('tab-search-title');
  const tabSearchContent = document.getElementById('tab-search-content');
  const searchModalBackdrop = document.getElementById('search-modal-backdrop');
  const searchInput = document.getElementById('search-input');
  const searchResultsContainer = document.getElementById('search-results');
  const searchStatusText = document.getElementById('search-status-text');
  const btnCloseModal = document.getElementById('btn-close-modal');

  let currentSearchMode = 'title'; // 'title' hoặc 'content'

  const paneTree = document.getElementById('pane-tree');
  const paneRecent = document.getElementById('pane-recent');
  const paneTags = document.getElementById('pane-tags');
  const tabs = document.querySelectorAll('.sidebar-tab');

  const treeContainer = document.getElementById('tree-container');
  const recentContainer = document.getElementById('recent-container');
  const tagsContainer = document.getElementById('tags-container');

  const noteBreadcrumb = document.getElementById('note-breadcrumb');
  const noteContainer = document.getElementById('note-container');
  const emptyState = document.getElementById('empty-state');
  const noteContentWrapper = document.getElementById('note-content-wrapper');
  const noteFrontmatter = document.getElementById('note-frontmatter');
  const noteBody = document.getElementById('note-body');
  const noteBacklinks = document.getElementById('note-backlinks');
  const backlinksList = document.getElementById('backlinks-list');
  const backlinksCountLabel = document.getElementById('backlinks-count-label');

  const contextDropdownWrapper = document.getElementById('context-dropdown-wrapper');
  const btnCopyContext = document.getElementById('btn-copy-context');
  const btnContextMenuTrigger = document.getElementById('btn-context-menu-trigger');
  const contextDropdownMenu = document.getElementById('context-dropdown-menu');
  let selectedContextDepth = 1;

  const btnCopyMd = document.getElementById('btn-copy-md');
  const btnViewToggle = document.getElementById('btn-view-toggle');
  const btnOpenObsidian = document.getElementById('btn-open-obsidian');
  const btnSyncVault = document.getElementById('btn-sync-vault');
  const btnToggleToc = document.getElementById('btn-toggle-toc');
  const btnCloseRightSidebar = document.getElementById('btn-close-right-sidebar');
  const tocPanel = document.getElementById('sidebar-right') || document.getElementById('toc-panel');
  const tocList = document.getElementById('toc-list');
  const tocCountBadge = document.getElementById('toc-count-badge');
  let isTocOpen = localStorage.getItem('obs_toc_open') !== 'false';
  let tocScrollDebounce = null;

  const editContainer = document.getElementById('edit-container');
  const editContentWrapper = document.getElementById('edit-content-wrapper');
  const editSourcePane = document.getElementById('edit-source-pane');
  const editPreviewPane = null;
  const editPreviewBody = null;
  const cmEditorMount = document.getElementById('cm-editor-mount');
  const editStats = document.getElementById('edit-stats');
  const btnModeLive = null;
  const btnModeSource = null;
  const btnModeSplit = null;
  const btnModePreview = null;
  const btnSaveEdit = document.getElementById('btn-save-edit');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const editSaveStatus = document.getElementById('edit-save-status');

  let cmEditorInstance = null;
  let currentEditMode = 'live';
  let livePreviewDebounceTimer = null;
  let statsDebounceTimer = null;
  let cm6LoadPromise = null;
  let highlightLoadPromise = null;
  let currentRawContent = null;
  const LARGE_NOTE_BYTES = 256 * 1024;
  let tagsLoaded = false;
  let treeLoaded = false;

  // Vault Management Elements & State
  const btnVaultSwitcher = document.getElementById('btn-vault-switcher');
  const sidebarVaultName = document.getElementById('sidebar-vault-name');
  const sidebarVaultPath = document.getElementById('sidebar-vault-path');
  const vaultModalBackdrop = document.getElementById('vault-modal-backdrop');
  const btnCloseVaultModal = document.getElementById('btn-close-vault-modal');
  const vaultModalTitle = document.getElementById('vault-modal-title');
  const vaultModalDesc = document.getElementById('vault-modal-desc');
  const vaultMissingAlert = document.getElementById('vault-missing-alert');
  const vaultMissingMsg = document.getElementById('vault-missing-msg');
  const vaultItemsList = document.getElementById('vault-items-list');
  const inputCustomVault = document.getElementById('input-custom-vault');
  const btnAddCustomVault = document.getElementById('btn-add-custom-vault');
  const vaultAddError = document.getElementById('vault-add-error');
  const chkSetDefaultVault = document.getElementById('chk-set-default-vault');

  let currentVaultPath = '';
  let currentVaultName = '';
  let knownVaults = [];
  let isCurrentVaultMissing = false;

  // Configure Marked.js
  if (typeof marked !== 'undefined') {
    const renderer = {
      link(href, title, text) {
        let linkHref = typeof href === 'object' && href ? href.href : href;
        let linkTitle = typeof href === 'object' && href ? href.title : title;
        let linkText = typeof href === 'object' && href ? href.text : text;

        const titleAttr = linkTitle ? ` title="${linkTitle}"` : '';
        // Liên kết anchor nội bộ trong cùng ghi chú (bắt đầu bằng '#')
        if (linkHref && linkHref.startsWith('#')) {
          return `<a href="${linkHref}"${titleAttr}>${linkText}</a>`;
        }
        // Liên kết web ngoài hoặc URL -> mở trên tab mới
        return `<a href="${linkHref}" target="_blank" rel="noopener noreferrer"${titleAttr}>${linkText}</a>`;
      }
    };

    if (typeof marked.use === 'function') {
      marked.use({ renderer });
    }

    // Marked >= 12 no longer consumes the legacy `highlight` callback. Code
    // highlighting is therefore applied lazily after DOM insertion instead of
    // loading Highlight.js on every application startup.
    marked.setOptions({ gfm: true, breaks: true });
  }

  // ==========================================================================
  // KaTeX Lazy-Loading (Memory Optimization: ~15-25MB RAM saved on startup)
  // ==========================================================================
  let katexLoadPromise = null;

  function loadKatex() {
    if (typeof katex !== 'undefined') {
      return Promise.resolve(window.katex);
    }
    if (katexLoadPromise) {
      return katexLoadPromise;
    }

    katexLoadPromise = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        resolve(null);
        return;
      }

      // 1. Lazy-load KaTeX CSS
      if (!document.querySelector('link[href*="katex.min.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/static/katex.min.css';
        document.head.appendChild(link);
      }

      // 2. Lazy-load KaTeX JS
      const script = document.createElement('script');
      script.src = '/static/katex.min.js';
      script.onload = () => {
        renderPendingMathElements();
        resolve(window.katex);
      };
      script.onerror = (err) => {
        console.error('Failed to lazy-load KaTeX script:', err);
        katexLoadPromise = null;
        reject(err);
      };
      document.head.appendChild(script);
    });

    return katexLoadPromise;
  }

  function renderPendingMathElements() {
    if (typeof katex === 'undefined' || typeof document === 'undefined') return;
    const lazyEls = document.querySelectorAll('.math-lazy');
    lazyEls.forEach((el) => {
      const latex = el.dataset.latex;
      const isBlock = el.dataset.block === 'true';
      if (!latex) return;
      try {
        const rendered = katex.renderToString(latex, {
          displayMode: isBlock,
          throwOnError: false
        });
        el.outerHTML = rendered;
      } catch (e) {
        console.warn('KaTeX render error on lazy element:', e);
      }
    });
  }

  // Render LaTeX via KaTeX
  function renderLatex(latex, isBlock) {
    if (typeof katex !== 'undefined') {
      try {
        return katex.renderToString(latex, {
          displayMode: isBlock,
          throwOnError: false
        });
      } catch (e) {
        console.warn('KaTeX rendering error:', e);
      }
    } else if (typeof window !== 'undefined') {
      if (typeof loadKatex === 'function') {
        loadKatex();
      }
      const escaped = String(latex).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      return `<span class="math-lazy" data-latex="${escaped}" data-block="${isBlock}">${isBlock ? '$$' + escaped + '$$' : '$' + escaped + '$'}</span>`;
    }
    const escaped = String(latex).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return isBlock
      ? `<pre class="math-block-error"><code>$$${escaped}$$</code></pre>`
      : `<code class="math-inline-error">$${escaped}$</code>`;
  }

  // Pre-process and render Markdown with Obsidian specifics
  function renderMarkdown(rawMd, currentNotePath) {
    let md = String(rawMd || '');

    // Keep the Reading renderer as the single rendering pipeline used by both
    // Reading View and CM6 Live Preview widgets. Protect source constructs that
    // must never be interpreted by the lightweight Obsidian preprocessors.
    const codeBlocks = [];
    const mathBlocks = [];
    const mathInlines = [];
    const comments = [];
    const footnotes = new Map();

    const stash = (bucket, prefix, value) => {
      const id = bucket.length;
      bucket.push(value);
      return `@@OQ_${prefix}_${id}@@`;
    };

    // Fenced and inline code first: Obsidian syntax inside code is literal.
    md = md.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, match => stash(codeBlocks, 'CODEBLOCK', match));
    md = md.replace(/`([^`\n]+?)`/g, match => stash(codeBlocks, 'CODEBLOCK', match));

    // Obsidian comments are invisible in Reading/Live Preview but preserved in
    // source mode. Stashing prevents their contents from becoming links/tags.
    md = md.replace(/%%[\s\S]*?%%/g, match => stash(comments, 'COMMENT', match));

    // Math is protected before any other inline transform.
    md = md.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
      const clean = content.replace(/^[ \t]*>[ \t]?/gm, '').trim();
      const id = mathBlocks.length;
      mathBlocks.push(clean);
      return `%%MATHBLOCK_${id}%%`;
    });
    md = md.replace(/(^|[^\\])\$([^\s\$\n](?:[^\$\n]*?[^\s\$\n])?)\$/g, (match, prefix, content) => {
      const id = mathInlines.length;
      mathInlines.push(content);
      return `${prefix}%%MATHINLINE_${id}%%`;
    });

    // Parse simple Obsidian footnote definitions. Continuation lines indented by
    // at least two spaces remain part of the same definition.
    const lines = md.split('\n');
    const keptLines = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\[\^([^\]]+)\]:\s*(.*)$/);
      if (!m) { keptLines.push(lines[i]); continue; }
      const body = [m[2]];
      while (i + 1 < lines.length && /^(?: {2,}|\t)\S?/.test(lines[i + 1])) {
        body.push(lines[++i].replace(/^(?: {2,}|\t)/, ''));
      }
      footnotes.set(m[1], body.join('\n').trim());
    }
    md = keptLines.join('\n');

    const ATTACHMENT_EXT_REGEX = /\.(png|jpe?g|gif|svg|webp|bmp|ico|pdf|mp4|webm|ogv|mp3|wav|ogg|m4a|flac|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|tar|gz|txt|csv)$/i;
    const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|svg|webp|bmp)$/i;
    const escapeAttr = value => String(value ?? '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Obsidian embeds. Images support width and widthxheight. Note embeds keep a
    // lightweight transclusion affordance without fetching another document into
    // RAM until the user opens it.
    md = md.replace(/!\[\[(.*?)\]\]/g, (match, inner) => {
      const pipe = inner.indexOf('|');
      const target = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
      const display = pipe >= 0 ? inner.slice(pipe + 1).trim() : '';
      const fileTarget = target.split('#')[0].split('^')[0];
      if (IMAGE_EXT_REGEX.test(fileTarget)) {
        const size = display.match(/^(\d{1,4})(?:x(\d{1,4}))?$/i);
        const width = size ? ` width="${size[1]}"` : '';
        const height = size && size[2] ? ` height="${size[2]}"` : '';
        return `<a href="/vault/${encodeURI(fileTarget)}" target="_blank" rel="noopener noreferrer" class="image-embed-link" title="Mở ảnh trên tab mới"><img src="/vault/${encodeURI(fileTarget)}" alt="${escapeAttr(fileTarget)}"${width}${height} loading="lazy" /></a>`;
      }
      if (ATTACHMENT_EXT_REGEX.test(fileTarget)) {
        return `<div class="embed-box">📄 Đính kèm: <a href="/vault/${encodeURI(fileTarget)}" target="_blank" rel="noopener noreferrer">${escapeAttr(display || target)}</a></div>`;
      }
      return `<div class="embed-box embed-note" data-target="${escapeAttr(target)}"><span class="embed-note-icon">↳</span><span>${escapeAttr(display || target)}</span></div>`;
    });

    // Wikilinks including aliases, headings and block references.
    md = md.replace(/\[\[(.*?)\]\]/g, (match, inner) => {
      const pipe = inner.indexOf('|');
      const target = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
      const alias = (pipe >= 0 ? inner.slice(pipe + 1) : target).trim();
      const fileTarget = target.split('#')[0].split('^')[0];
      if (ATTACHMENT_EXT_REGEX.test(fileTarget)) {
        return `<a class="wikilink wikilink-attachment" href="/vault/${encodeURI(fileTarget)}" target="_blank" rel="noopener noreferrer" data-target="${escapeAttr(target)}">${escapeAttr(alias)}</a>`;
      }
      return `<span class="wikilink" data-target="${escapeAttr(target)}">${escapeAttr(alias)}</span>`;
    });

    // Obsidian highlight syntax. Avoid matching across lines to keep typing and
    // rendering predictable on very large notes.
    md = md.replace(/==([^=\n](?:.*?[^=\n])?)==/g, '<mark class="obs-highlight">$1</mark>');

    // Obsidian tags and explicit block IDs. Tags remain interactive in both
    // Reading View and Live Preview; block IDs are addressable metadata and are
    // intentionally hidden from rendered prose.
    md = md.replace(/(^|\s)#([\p{L}\p{N}_\-/]+)/gmu, (match, prefix, tag) => `${prefix}<span class="tag-pill" data-tag="${escapeAttr(tag)}">#${escapeAttr(tag)}</span>`);
    md = md.replace(/[ \t]+\^[A-Za-z0-9-]+(?=[ \t]*(?:\n|$))/g, '');

    // Footnote references become stable anchors and the definitions are appended
    // after the document. Unknown references remain untouched.
    md = md.replace(/\[\^([^\]]+)\]/g, (match, id) => {
      if (!footnotes.has(id)) return match;
      const safe = escapeAttr(id).replace(/\s+/g, '-');
      return `<sup class="footnote-ref" id="fnref-${safe}"><a href="#fn-${safe}">${escapeAttr(id)}</a></sup>`;
    });

    // Restore fenced/inline code only after every Obsidian-specific inline
    // preprocessor has run. This guarantees syntax inside backticks stays literal
    // (for example `==highlight==` must never become a <mark> tag).
    md = md.replace(/@@OQ_CODEBLOCK_(\d+)@@/g, (match, id) => codeBlocks[Number(id)]);

    // Transform Obsidian callout blockquotes before Marked. This supports custom
    // types, custom titles, fold markers (+/-), multiline bodies and nesting.
    const transformCallouts = input => {
      const src = String(input || '').split('\n');
      const out = [];
      for (let i = 0; i < src.length; i++) {
        const head = src[i].match(/^\s*>\s*\[!([A-Za-z0-9_-]+)\]([+-]?)\s*(.*)$/);
        if (!head) { out.push(src[i]); continue; }
        const quoted = [];
        let j = i + 1;
        while (j < src.length && /^\s*>/.test(src[j])) {
          quoted.push(src[j].replace(/^\s*>\s?/, ''));
          j++;
        }
        const type = head[1].toLowerCase();
        const fold = head[2] || '';
        const title = (head[3] || head[1]).trim();
        const bodySource = transformCallouts(quoted.join('\n'));
        const bodyHtml = typeof marked !== 'undefined' ? marked.parse(bodySource) : bodySource;
        const foldedClass = fold === '-' ? ' is-collapsed' : '';
        const foldAttr = fold ? ` data-fold="${fold}"` : '';
        out.push(`<div class="callout callout-${escapeAttr(type)}${foldedClass}" data-callout="${escapeAttr(type)}"${foldAttr}><div class="callout-title" role="button" tabindex="0"><span class="callout-icon">▣</span><strong>${escapeAttr(title)}</strong>${fold ? '<span class="callout-fold">⌄</span>' : ''}</div><div class="callout-body">${bodyHtml}</div></div>`);
        i = j - 1;
      }
      return out.join('\n');
    };
    md = transformCallouts(md);

    let html = typeof marked !== 'undefined' ? marked.parse(md) : md;

    // Comments are intentionally absent from rendered output.
    html = html.replace(/(?:<p>\s*)?@@OQ_COMMENT_\d+@@(?:\s*<\/p>)?/g, '');

    // Marked can wrap block placeholders in paragraphs. Unwrap before replacing.
    html = html.replace(/<p>\s*(%%MATHBLOCK_\d+%%)\s*<\/p>/g, '$1');
    html = html.replace(/%%MATHBLOCK_(\d+)%%/g, (match, id) => `<div class="math-block">${renderLatex(mathBlocks[Number(id)], true)}</div>`);
    html = html.replace(/%%MATHINLINE_(\d+)%%/g, (match, id) => `<span class="math-inline">${renderLatex(mathInlines[Number(id)], false)}</span>`);

    if (footnotes.size) {
      const items = [];
      for (const [id, body] of footnotes.entries()) {
        const safe = escapeAttr(id).replace(/\s+/g, '-');
        const bodyHtml = typeof marked !== 'undefined' ? marked.parse(body) : escapeAttr(body);
        items.push(`<li id="fn-${safe}">${bodyHtml}<a class="footnote-backref" href="#fnref-${safe}" aria-label="Back to reference">↩</a></li>`);
      }
      html += `<section class="footnotes"><hr><ol>${items.join('')}</ol></section>`;
    }

    return html;
  }

  function hasMathSyntax(text) {
    if (!text || text.indexOf('$') === -1) return false;
    return /\$\$[\s\S]*?\$\$|(^|[^\\])\$[^\s$\n](?:[^$\n]*?[^\s$\n])?\$/m.test(text);
  }

  function sanitizeRenderedHtml(html) {
    if (typeof document === 'undefined' || typeof DOMParser === 'undefined') return html;
    const template = document.createElement('template');
    template.innerHTML = html;
    const blockedTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'BASE', 'META', 'LINK', 'FORM']);
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
    const remove = [];
    let node = walker.nextNode();
    while (node) {
      if (blockedTags.has(node.tagName)) {
        remove.push(node);
        node = walker.nextNode();
        continue;
      }
      if (node.tagName === 'INPUT') {
        const type = (node.getAttribute('type') || '').toLowerCase();
        if (type !== 'checkbox') {
          remove.push(node);
          node = walker.nextNode();
          continue;
        }
        node.setAttribute('disabled', '');
      }
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();
        if (name.startsWith('on') || name === 'srcdoc') {
          node.removeAttribute(attr.name);
          continue;
        }
        if (['href', 'src', 'xlink:href', 'formaction'].includes(name)) {
          if (/^(?:javascript|vbscript):/i.test(value) || (/^data:/i.test(value) && !(node.tagName === 'IMG' && /^data:image\//i.test(value)))) {
            node.removeAttribute(attr.name);
          }
        }
        if (name === 'style' && /(?:expression\s*\(|url\s*\(\s*['"]?\s*javascript:)/i.test(value)) {
          node.removeAttribute('style');
        }
      }
      if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
      }
      node = walker.nextNode();
    }
    remove.forEach(el => el.remove());
    return template.innerHTML;
  }

  function loadHighlightJs() {
    if (typeof hljs !== 'undefined') return Promise.resolve(window.hljs);
    if (highlightLoadPromise) return highlightLoadPromise;
    highlightLoadPromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-oq-highlight-css]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/static/github-dark.min.css';
        link.dataset.oqHighlightCss = '1';
        document.head.appendChild(link);
      }
      const script = document.createElement('script');
      script.src = '/static/highlight.min.js';
      script.async = true;
      script.onload = () => resolve(window.hljs);
      script.onerror = (err) => { highlightLoadPromise = null; reject(err); };
      document.head.appendChild(script);
    });
    return highlightLoadPromise;
  }

  function enhanceCodeBlocks(container) {
    if (!container || !container.querySelector('pre code')) return;
    loadHighlightJs().then((lib) => {
      if (!lib || !container.isConnected) return;
      container.querySelectorAll('pre code:not([data-oq-highlighted])').forEach((code) => {
        try {
          lib.highlightElement(code);
          code.dataset.oqHighlighted = '1';
        } catch (_) {}
      });
    }).catch(() => {});
  }

  function setRenderedMarkdown(container, markdownText, notePath) {
    if (!container) return;
    container.innerHTML = sanitizeRenderedHtml(renderMarkdown(markdownText || '', notePath || ''));
    enhanceCodeBlocks(container);
  }

  // Small bridge for CM6 Live Preview widgets. This deliberately reuses the
  // exact Reading renderer instead of introducing a second Markdown pipeline.
  window.ObsidianQuickViewLiveRenderer = {
    render(markdownText, notePath) {
      return sanitizeRenderedHtml(renderMarkdown(markdownText || '', notePath || ''));
    },
    renderInline(markdownText, notePath) {
      const html = sanitizeRenderedHtml(renderMarkdown(markdownText || '', notePath || ''));
      const template = document.createElement('template');
      template.innerHTML = html.trim();
      if (template.content.childElementCount === 1 && template.content.firstElementChild?.tagName === 'P') {
        return template.content.firstElementChild.innerHTML;
      }
      return html;
    },
    enhance(container) {
      if (!container) return;
      renderPendingMathElements();
      enhanceCodeBlocks(container);
    }
  };

  function loadCodeMirror6() {
    if (window.ObsidianCM6 && window.__OQCM6_RUNTIME_V33) return Promise.resolve(window.ObsidianCM6);
    if (cm6LoadPromise) return cm6LoadPromise;
    const loadScript = (src) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    const baseReady = window.__OQCM6 ? Promise.resolve() : loadScript('/static/cm6-bundle.min.js?v=23');
    cm6LoadPromise = baseReady
      .then(() => loadScript('/static/cm6-live-preview-runtime.js?v=33'))
      .then(() => {
        if (!window.ObsidianCM6) throw new Error('CodeMirror 6 failed to initialize');
        return window.ObsidianCM6;
      })
      .catch((err) => { cm6LoadPromise = null; throw err; });
    return cm6LoadPromise;
  }

  async function ensureRawContent(path) {
    if (!path) return null;
    if (currentNote && currentNote.path === path && typeof currentRawContent === 'string') return currentRawContent;
    const data = await fetchJson(`/api/note/raw?path=${encodeURIComponent(path)}`);
    if (!data || typeof data.raw_content !== 'string') return null;
    if (currentNote && currentNote.path === path) currentRawContent = data.raw_content;
    return data.raw_content;
  }

  // API Calls
  async function fetchJson(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error('Fetch error:', e);
      return null;
    }
  }

  // Mở tài liệu, PDF, ảnh đính kèm trên tab mới bằng link file://
  async function openAttachment(pathOrTarget) {
    const res = await fetchJson(`/api/open-file?path=${encodeURIComponent(pathOrTarget)}`);
    if (!res || res.status !== 'ok') {
      // Dự phòng nếu không gọi được lệnh native: mở qua endpoint web /vault/
      window.open('/vault/' + encodeURI(pathOrTarget), '_blank');
    }
  }

  // Update History Button State
  function updateHistoryButtons() {
    if (btnHistoryBack) {
      btnHistoryBack.disabled = historyIndex <= 0;
    }
    if (btnHistoryForward) {
      btnHistoryForward.disabled = historyIndex >= noteHistory.length - 1;
    }
  }

  // Load Note
  async function loadNote(path, pushHistory = true) {
    if (!path.toLowerCase().endsWith('.md')) {
      // Chặn tuyệt đối không nạp file PDF hoặc binary vào view note gây lag/treo giao diện
      openAttachment(path);
      return;
    }

    if (cmEditorInstance) {
      cmEditorInstance.destroy();
      cmEditorInstance = null;
      if (cmEditorMount) cmEditorMount.replaceChildren();
    }
    currentRawContent = null;
    if (editPreviewBody) editPreviewBody.replaceChildren();

    const data = await fetchJson(`/api/note?path=${encodeURIComponent(path)}`);
    if (!data) {
      alert((window.I18n ? window.I18n.t('app.error') : 'Lỗi') + ': ' + path);
      const missingIndex = recentNotes.findIndex(r => r.path === path);
      if (missingIndex !== -1) {
        recentNotes.splice(missingIndex, 1);
        saveRecentNotes();
        renderRecentNotes();
      }
      return;
    }

    currentNote = data;
    isEditing = false;

    // Track Recent Notes (always add new or move existing to top)
    addRecentNote({
      path: data.path,
      title: data.title,
      folder: data.folder
    });

    // If note has math notation, trigger KaTeX lazy-load in parallel
    if (hasMathSyntax(data.content)) {
      loadKatex();
    }

    // Track Navigation History
    if (pushHistory) {
      if (historyIndex === -1 || noteHistory[historyIndex].path !== path) {
        // Truncate any forward history when branching to a new note
        noteHistory.splice(historyIndex + 1);
        noteHistory.push({ path: data.path, title: data.title });
        historyIndex = noteHistory.length - 1;
      }
    }
    updateHistoryButtons();

    // Update UI elements
    emptyState.style.display = 'none';
    noteContentWrapper.style.display = 'block';
    if (noteContainer) noteContainer.style.display = 'block';
    editContainer.style.display = 'none';

    btnCopyMd.style.display = 'inline-flex';
    if (btnViewToggle) btnViewToggle.style.display = 'inline-flex';
    updateViewToggle();
    btnOpenObsidian.style.display = 'inline-flex';
    contextDropdownWrapper.style.display = 'inline-flex';

    // Render Clickable Breadcrumbs:
    // If user navigated from a previous note in history, display that note as clickable crumb!
    let breadcrumbHtml = '';
    if (historyIndex > 0) {
      const prevNote = noteHistory[historyIndex - 1];
      breadcrumbHtml += `<a class="breadcrumb-crumb" data-path="${escapeHtml(prevNote.path)}" title="Quay lại ${escapeHtml(prevNote.title)}">${escapeHtml(prevNote.title)}</a>`;
      breadcrumbHtml += `<span class="breadcrumb-separator">›</span>`;
    } else {
      const folderParts = (data.folder && data.folder !== '/') ? data.folder.split('/') : [];
      if (folderParts.length > 0) {
        breadcrumbHtml += folderParts.map(p => `<span>${escapeHtml(p)}</span>`).join('<span class="breadcrumb-separator">›</span>');
        breadcrumbHtml += `<span class="breadcrumb-separator">›</span>`;
      }
    }
    breadcrumbHtml += `<span class="breadcrumb-title" title="${escapeHtml(data.title)}">${escapeHtml(data.title)}</span>`;
    noteBreadcrumb.innerHTML = breadcrumbHtml;

    // Helper to format frontmatter values (clickable link + copy button if URL or share_link)
    function formatFrontmatterValue(key, val) {
      if (val === null || val === undefined) return '';
      if (Array.isArray(val)) {
        return val.map(item => `<span class="frontmatter-chip">${escapeHtml(String(item))}</span>`).join('');
      }
      const rawStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
      const isShareLink = String(key).toLowerCase() === 'share_link';
      const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;

      if (isShareLink || urlRegex.test(rawStr)) {
        // Replace URLs with clickable link + copy button
        const html = rawStr.replace(urlRegex, (url) => {
          const safeUrl = escapeHtml(url);
          return `<span class="frontmatter-link-wrapper">` +
            `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="frontmatter-url" title="Mở liên kết">${safeUrl}</a>` +
            `<button type="button" class="btn-copy-link" data-url="${safeUrl}" title="Sao chép liên kết">` +
              `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>` +
              `<span>Copy</span>` +
            `</button>` +
          `</span>`;
        });
        return html;
      }

      // Escape plain text
      const div = document.createElement('div');
      div.textContent = rawStr;
      return div.innerHTML;
    }

    // Frontmatter box
    const hasFrontmatter = Object.keys(data.frontmatter || {}).length > 0 || (data.tags && data.tags.length > 0);
    if (hasFrontmatter) {
      let fmHtml = '<div class="frontmatter-title">Properties</div>';
      if (data.tags && data.tags.length > 0) {
        fmHtml += `
          <div class="frontmatter-row">
            <span class="frontmatter-key">tags</span>
            <div class="frontmatter-val">${data.tags.map(t => `<span class="tag-pill" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`).join('')}</div>
          </div>
        `;
      }
      for (const [k, v] of Object.entries(data.frontmatter || {})) {
        if (k === 'tags' || k === 'tag') continue;
        const valHtml = formatFrontmatterValue(k, v);
        fmHtml += `
          <div class="frontmatter-row">
            <span class="frontmatter-key">${escapeHtml(k)}</span>
            <div class="frontmatter-val">${valHtml}</div>
          </div>
        `;
      }
      noteFrontmatter.innerHTML = fmHtml;
      noteFrontmatter.style.display = fmHtml ? 'block' : 'none';
    } else {
      noteFrontmatter.style.display = 'none';
    }

    // Render markdown content. For large notes the DOM becomes the reading
    // representation, so release the duplicate Markdown string afterwards.
    setRenderedMarkdown(noteBody, data.content, data.path);
    if (Number(data.size || 0) > LARGE_NOTE_BYTES) currentNote.content = null;

    // Generate Table of Contents (Outline)
    generateToc();

    // Backlinks
    if (data.backlinks && data.backlinks.length > 0) {
      backlinksCountLabel.textContent = window.I18n
        ? window.I18n.t('note.backlinksCount', { count: data.backlinks.length })
        : `Liên kết ngược (${data.backlinks.length} ghi chú tham chiếu tới đây)`;
      backlinksList.innerHTML = data.backlinks.map(b => `
        <div class="backlink-card" data-path="${escapeHtml(b.path)}">
          <span>📝 <strong>${escapeHtml(b.title)}</strong></span>
          <span style="font-size: 11px; opacity: 0.7;">${escapeHtml(b.folder)}</span>
        </div>
      `).join('');
      noteBacklinks.style.display = 'block';
    } else {
      noteBacklinks.style.display = 'none';
    }

    // Scroll to top
    document.getElementById('note-container').scrollTop = 0;

    // Highlight active item in sidebar
    document.querySelectorAll('.file-item, .recent-item').forEach(el => {
      el.classList.toggle('active', el.dataset.path === path);
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Icons
  const SVG_NOTE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="item-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
  const SVG_FOLDER = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="item-icon"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
  const SVG_TAG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="item-icon"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`;

  // Load Folder Tree lazily, one directory level at a time. This keeps the DOM
  // bounded even when a vault contains tens of thousands of notes.
  function renderTreeChildren(children) {
    return (children || []).map(node => {
      if (node.type === 'file') {
        return `
          <div class="file-item" data-path="${escapeHtml(node.path)}">
            ${SVG_NOTE}
            <span style="overflow: hidden; text-overflow: ellipsis;">${escapeHtml(node.name)}</span>
          </div>
        `;
      }
      return `
        <details class="tree-folder lazy-tree-folder" data-folder-path="${escapeHtml(node.path)}">
          <summary class="folder-item">
            ${SVG_FOLDER}
            <strong>${escapeHtml(node.name)}</strong>
          </summary>
          <div class="tree-node" data-tree-children><div class="tree-loading">…</div></div>
        </details>
      `;
    }).join('');
  }

  async function loadTreeLevel(folderPath, target) {
    const data = await fetchJson(`/api/tree-level?folder=${encodeURIComponent(folderPath || '')}`);
    if (!data || !target) return false;
    target.innerHTML = renderTreeChildren(data.children);
    return true;
  }

  async function loadTree() {
    if (!treeContainer) return;
    const ok = await loadTreeLevel('', treeContainer);
    treeLoaded = !!ok;
  }

  if (treeContainer) {
    treeContainer.addEventListener('toggle', async (event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.open || !details.classList.contains('lazy-tree-folder')) return;
      if (details.dataset.loaded === '1' || details.dataset.loading === '1') return;
      const target = details.querySelector(':scope > [data-tree-children]');
      if (!target) return;
      details.dataset.loading = '1';
      const ok = await loadTreeLevel(details.dataset.folderPath || '', target);
      if (ok) details.dataset.loaded = '1';
      delete details.dataset.loading;
    }, true);
  }

  // ==========================================================================
  // Recent Notes Management (LRU - Recently Viewed)
  // ==========================================================================
  let recentNotes = [];

  function getRecentStorageKey() {
    const vKey = currentVaultPath ? encodeURIComponent(currentVaultPath) : 'default';
    return `obs_recent_${vKey}`;
  }

  function saveRecentNotes() {
    try {
      localStorage.setItem(getRecentStorageKey(), JSON.stringify(recentNotes));
    } catch (e) {
      console.warn('Failed to save recent notes to localStorage:', e);
    }
  }

  function loadRecentNotesFromStorage() {
    try {
      const stored = localStorage.getItem(getRecentStorageKey());
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse recent notes from localStorage:', e);
    }
    return null;
  }

  function addRecentNote(note) {
    if (!note || !note.path) return;

    const path = note.path;
    const title = note.title || path.split('/').pop().replace(/\.md$/, '');
    const folder = (note.folder !== undefined && note.folder !== null)
      ? note.folder
      : (path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '');

    // Check if already in recentNotes
    const existingIndex = recentNotes.findIndex(r => r.path === path);
    if (existingIndex !== -1) {
      // Remove from existing position so we can move it to top
      recentNotes.splice(existingIndex, 1);
    }

    // Always add to the very top (index 0)
    recentNotes.unshift({
      path,
      title,
      folder
    });

    // Cap at 50 recent items
    if (recentNotes.length > 50) {
      recentNotes = recentNotes.slice(0, 50);
    }

    // Persist to localStorage
    saveRecentNotes();

    // Re-render recent container
    renderRecentNotes();
  }

  function renderRecentNotes() {
    if (!recentContainer) return;

    if (!recentNotes || recentNotes.length === 0) {
      const emptyText = window.I18n ? window.I18n.t('sidebar.emptyRecent') : 'Chưa có ghi chú nào';
      recentContainer.innerHTML = `<div class="sidebar-empty" style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 13px;">${emptyText}</div>`;
      return;
    }

    const curPath = currentNote ? currentNote.path : null;

    recentContainer.innerHTML = recentNotes.map(r => `
      <div class="recent-item ${curPath === r.path ? 'active' : ''}" data-path="${escapeHtml(r.path)}">
        ${SVG_NOTE}
        <div style="overflow: hidden; text-overflow: ellipsis;">
          <div>${escapeHtml(r.title)}</div>
          <div style="font-size: 11px; opacity: 0.6;">${escapeHtml(r.folder || '')}</div>
        </div>
      </div>
    `).join('');
  }

  // Load Recent Notes (from localStorage or seed initial from server)
  async function loadRecent() {
    const stored = loadRecentNotesFromStorage();
    if (stored !== null) {
      recentNotes = stored;
      renderRecentNotes();
      return;
    }

    // If first time for this vault, seed from server
    try {
      const data = await fetchJson('/api/search?limit=25');
      if (data && data.results && data.results.length > 0) {
        recentNotes = data.results.map(r => ({
          path: r.path,
          title: r.title,
          folder: r.folder || ''
        }));
        saveRecentNotes();
      } else {
        recentNotes = [];
      }
    } catch (_) {
      recentNotes = [];
    }

    renderRecentNotes();
  }

  // Load Tags
  async function loadTags() {
    const data = await fetchJson('/api/tags');
    if (!data || !data.tags) return;
    tagsLoaded = true;
    tagsContainer.innerHTML = data.tags.map(t => `
      <div class="tag-item" data-tag="${escapeHtml(t.tag)}">
        ${SVG_TAG}
        <span>#${escapeHtml(t.tag)}</span>
        <span class="item-badge">${Number(t.count) || 0}</span>
      </div>
    `).join('');
  }

  function setSearchMode(mode) {
    currentSearchMode = mode;
    if (tabSearchTitle) tabSearchTitle.classList.toggle('active', mode === 'title');
    if (tabSearchContent) tabSearchContent.classList.toggle('active', mode === 'content');

    if (mode === 'title') {
      searchInput.placeholder = window.I18n
        ? window.I18n.t('search.inputPlaceholderTitle')
        : 'Tìm theo tiêu đề ghi chú... (Ctrl K)';
    } else {
      searchInput.placeholder = window.I18n
        ? window.I18n.t('search.inputPlaceholderContent')
        : 'Tìm theo nội dung markdown... (Ctrl Shift F)';
    }

    if (searchModalBackdrop.classList.contains('active')) {
      doSearch(searchInput.value);
    }
  }

  // Quick Switcher Search
  async function doSearch(query) {
    searchStatusText.textContent = window.I18n ? window.I18n.t('search.statusSearching') : 'Đang tìm kiếm...';
    const mode = currentSearchMode;
    const data = await fetchJson(`/api/search?q=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}&limit=40`);
    if (!data || !data.results) {
      searchStatusText.textContent = window.I18n ? window.I18n.t('app.error') : 'Lỗi tìm kiếm';
      return;
    }

    searchResults = data.results;
    selectedIndex = 0;
    searchStatusText.textContent = window.I18n
      ? window.I18n.t('search.statusFound', { count: searchResults.length })
      : `${searchResults.length} kết quả`;

    if (searchResults.length === 0) {
      searchResultsContainer.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted);">
          ${window.I18n ? window.I18n.t('search.statusNotFound') : 'Không tìm thấy ghi chú nào phù hợp'}
        </div>
      `;
      return;
    }

    renderSearchResults();
  }

  function safeSearchSnippet(value) {
    // SQLite FTS deliberately returns only <mark> wrappers. Escape everything
    // else so note content can never inject HTML into the quick switcher.
    return escapeHtml(value || '')
      .replace(/&lt;mark&gt;/gi, '<mark>')
      .replace(/&lt;\/mark&gt;/gi, '</mark>');
  }

  function renderSearchResults() {
    searchResultsContainer.innerHTML = searchResults.map((r, i) => `
      <div class="search-item ${i === selectedIndex ? 'selected' : ''}" data-index="${i}" data-path="${escapeHtml(r.path)}">
        <div class="search-item-header">
          <span class="search-item-title" style="display: inline-flex; align-items: center; gap: 6px;">
            ${SVG_NOTE}
            <span>${escapeHtml(r.title)}</span>
          </span>
          <span class="search-item-path">${escapeHtml(r.folder)}</span>
        </div>
        ${r.snippet_content ? `<div class="search-snippet">${safeSearchSnippet(r.snippet_content)}</div>` : ''}
      </div>
    `).join('');

    // Auto-scroll selected into view
    const selectedEl = searchResultsContainer.querySelector('.search-item.selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function openSearchModal(initialQuery = '', mode = 'title') {
    setSearchMode(mode);
    searchModalBackdrop.classList.add('active');
    searchInput.value = initialQuery;
    searchInput.focus();
    doSearch(initialQuery);
  }

  function closeSearchModal() {
    searchModalBackdrop.classList.remove('active');
  }

  // Event Listeners

  // Theme Toggle
  btnTheme.addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('obs_theme', currentTheme);
    if (cmEditorInstance) {
      cmEditorInstance.setTheme(currentTheme);
    }
  });

  // Sidebar Tab Switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = 'pane-' + tab.dataset.tab;
      document.getElementById(targetId).classList.add('active');
      if (tab.dataset.tab === 'tags' && !tagsLoaded) loadTags();
      if (tab.dataset.tab === 'tree' && !treeLoaded) loadTree();
    });
  });

  // Quick Switcher open / close
  btnTriggerSearch.addEventListener('click', () => openSearchModal('', 'title'));
  if (btnTriggerContentSearch) {
    btnTriggerContentSearch.addEventListener('click', () => openSearchModal('', 'content'));
  }
  if (tabSearchTitle) {
    tabSearchTitle.addEventListener('click', () => setSearchMode('title'));
  }
  if (tabSearchContent) {
    tabSearchContent.addEventListener('click', () => setSearchMode('content'));
  }

  btnCloseModal.addEventListener('click', () => closeSearchModal());

  searchModalBackdrop.addEventListener('click', (e) => {
    if (e.target === searchModalBackdrop) closeSearchModal();
  });

  // Search input typing
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      doSearch(e.target.value);
    }, 80);
  });

  // Keyboard navigation inside search modal
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      setSearchMode(currentSearchMode === 'title' ? 'content' : 'title');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (searchResults.length > 0) {
        selectedIndex = (selectedIndex + 1) % searchResults.length;
        renderSearchResults();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (searchResults.length > 0) {
        selectedIndex = (selectedIndex - 1 + searchResults.length) % searchResults.length;
        renderSearchResults();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0 && searchResults[selectedIndex]) {
        loadNote(searchResults[selectedIndex].path);
        closeSearchModal();
      }
    } else if (e.key === 'Escape') {
      closeSearchModal();
    }
  });

  // Click on search result item
  searchResultsContainer.addEventListener('click', (e) => {
    const item = e.target.closest('.search-item');
    if (item && item.dataset.path) {
      loadNote(item.dataset.path);
      closeSearchModal();
    }
  });

  // History Back / Forward navigation
  if (btnHistoryBack) {
    btnHistoryBack.addEventListener('click', () => {
      if (historyIndex > 0) {
        historyIndex--;
        const target = noteHistory[historyIndex];
        loadNote(target.path, false);
      }
    });
  }

  if (btnHistoryForward) {
    btnHistoryForward.addEventListener('click', () => {
      if (historyIndex < noteHistory.length - 1) {
        historyIndex++;
        const target = noteHistory[historyIndex];
        loadNote(target.path, false);
      }
    });
  }

  // Sidebar Toggle (Instant toggle, no animation)
  function toggleSidebar() {
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('obs_sidebar_collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
    }
  }

  if (localStorage.getItem('obs_sidebar_collapsed') === '1' && sidebar) {
    sidebar.classList.add('collapsed');
  }

  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', toggleSidebar);
  }

  // Global Shortcuts
  window.addEventListener('keydown', (e) => {
    // Ctrl + \ -> Toggle sidebar
    if ((e.ctrlKey || e.metaKey) && (e.key === '\\' || e.code === 'Backslash')) {
      e.preventDefault();
      toggleSidebar();
      return;
    }
    // Alt + Left Arrow -> Back in history
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      if (btnHistoryBack && !btnHistoryBack.disabled) btnHistoryBack.click();
      return;
    }
    // Alt + Right Arrow -> Forward in history
    if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      if (btnHistoryForward && !btnHistoryForward.disabled) btnHistoryForward.click();
      return;
    }

    // Ctrl+Shift+O -> Bật / Tắt Mục lục (Outline)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'O' || e.key === 'o')) {
      e.preventDefault();
      setTocOpen(!isTocOpen);
      return;
    }

    // Ctrl+Shift+K hoặc Ctrl+Shift+F -> Tìm kiếm theo nội dung
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'K' || e.key === 'k' || e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      openSearchModal(searchModalBackdrop.classList.contains('active') ? searchInput.value : '', 'content');
      return;
    }
    // Ctrl+K hoặc Ctrl+O -> Tìm kiếm theo tiêu đề
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'k' || e.key === 'o')) {
      e.preventDefault();
      openSearchModal(searchModalBackdrop.classList.contains('active') ? searchInput.value : '', 'title');
      return;
    }
    // Alt+O -> Open in Obsidian
    if (e.altKey && e.key === 'o') {
      e.preventDefault();
      btnOpenObsidian.click();
    }
    // Ctrl+E -> Toggle Reading / Live Edit
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      if (currentNote && btnViewToggle) btnViewToggle.click();
      return;
    }
    // Ctrl+S -> Save in edit mode
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (isEditing && btnSaveEdit) {
        btnSaveEdit.click();
      }
      return;
    }
    // Ctrl + , -> Mở cài đặt (Settings)
    if ((e.ctrlKey || e.metaKey) && (e.key === ',' || e.code === 'Comma')) {
      e.preventDefault();
      if (settingsModalBackdrop && settingsModalBackdrop.classList.contains('active')) {
        closeSettingsModal();
      } else {
        openSettingsModal();
      }
      return;
    }
    // Escape
    if (e.key === 'Escape') {
      if (settingsModalBackdrop && settingsModalBackdrop.classList.contains('active')) {
        closeSettingsModal();
      } else if (vaultModalBackdrop && vaultModalBackdrop.classList.contains('active')) {
        if (!isCurrentVaultMissing) {
          closeVaultModal();
        }
      } else if (searchModalBackdrop.classList.contains('active')) {
        closeSearchModal();
      } else if (isEditing) {
        btnCancelEdit.click();
      }
    }
  });

  // Delegated clicks for note items in sidebar and breadcrumbs
  document.addEventListener('click', (e) => {
    // Copy link in frontmatter
    const btnCopyLink = e.target.closest('.btn-copy-link');
    if (btnCopyLink && btnCopyLink.dataset.url) {
      e.preventDefault();
      e.stopPropagation();
      const url = btnCopyLink.dataset.url;
      navigator.clipboard.writeText(url).then(() => {
        const origHtml = btnCopyLink.innerHTML;
        btnCopyLink.innerHTML = `<span>${window.I18n ? window.I18n.t('app.copied') : 'Đã chép!'}</span>`;
        btnCopyLink.classList.add('copied');
        setTimeout(() => {
          btnCopyLink.innerHTML = origHtml;
          btnCopyLink.classList.remove('copied');
        }, 1500);
      });
      return;
    }

    // Breadcrumb navigation click (e.g. click "note1" in "note1 > current note")
    const crumbEl = e.target.closest('.breadcrumb-crumb');
    if (crumbEl && crumbEl.dataset.path) {
      e.preventDefault();
      loadNote(crumbEl.dataset.path);
      return;
    }

    // File in tree or recent or backlink
    const fileEl = e.target.closest('.file-item, .recent-item, .backlink-card');
    if (fileEl && fileEl.dataset.path) {
      loadNote(fileEl.dataset.path);
      return;
    }

    // Tag click
    const tagEl = e.target.closest('.tag-item, .tag-pill');
    if (tagEl && tagEl.dataset.tag) {
      openSearchModal('#' + tagEl.dataset.tag);
      return;
    }

    // Image click inside note (if not wrapped in an <a> tag)
    const imgEl = e.target.closest('.note-content img');
    if (imgEl && !imgEl.closest('a')) {
      const src = imgEl.getAttribute('src');
      if (src) {
        window.open(src, '_blank');
        return;
      }
    }

    // Foldable Obsidian callout (+/-). Keep this delegated so rendered CM6
    // widgets and Reading View share the exact same interaction path.
    const calloutTitle = e.target.closest('.callout[data-fold] > .callout-title');
    if (calloutTitle) {
      const callout = calloutTitle.parentElement;
      if (callout) callout.classList.toggle('is-collapsed');
      return;
    }

    // Lightweight note transclusion placeholder: resolve only on click so note
    // embeds do not recursively allocate extra rendered documents in RAM.
    const noteEmbed = e.target.closest('.embed-note[data-target]');
    if (noteEmbed && noteEmbed.dataset.target) {
      e.preventDefault();
      const target = noteEmbed.dataset.target;
      fetchJson(`/api/resolve?target=${encodeURIComponent(target)}`).then(res => {
        if (res && res.resolved_path && res.resolved_path.toLowerCase().endsWith('.md')) loadNote(res.resolved_path);
      });
      return;
    }

    // Embed box attachment hoặc image embed click
    const embedLink = e.target.closest('.embed-box a, .image-embed-link, .wikilink-attachment');
    if (embedLink) {
      e.preventDefault();
      const href = embedLink.getAttribute('href');
      const target = embedLink.dataset.target;
      if (target) {
        openAttachment(target);
      } else if (href && href.startsWith('/vault/')) {
        const relPath = decodeURIComponent(href.substring('/vault/'.length));
        openAttachment(relPath);
      }
      return;
    }

    // Standard external web links inside note content
    const webLink = e.target.closest('.note-content a');
    if (webLink && !webLink.closest('.wikilink')) {
      const href = webLink.getAttribute('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//'))) {
        webLink.setAttribute('target', '_blank');
        webLink.setAttribute('rel', 'noopener noreferrer');
      }
    }

    // Wikilink click inside note
    const wikilinkEl = e.target.closest('.wikilink');
    if (wikilinkEl && wikilinkEl.dataset.target) {
      e.preventDefault();
      const target = wikilinkEl.dataset.target;
      fetchJson(`/api/resolve?target=${encodeURIComponent(target)}`).then(res => {
        if (res && res.resolved_path) {
          if (res.is_attachment || !res.resolved_path.toLowerCase().endsWith('.md')) {
            // Mở tài liệu, PDF, ảnh trên tab mới của Firefox bằng link file://
            openAttachment(res.resolved_path);
          } else {
            // Ghi chú markdown: mở trực tiếp trong app
            loadNote(res.resolved_path);
          }
        } else {
          alert(`Không tìm thấy ghi chú hoặc tài liệu mục tiêu: [[${target}]]`);
        }
      });
      return;
    }
  });

  // Copy Context Button & Depth Dropdown
  function updateContextBtnText() {
    if (!btnCopyContext) return;
    const label = window.I18n
      ? window.I18n.t('nav.copyContext', { depth: selectedContextDepth })
      : `Context (${selectedContextDepth})`;
    btnCopyContext.innerHTML = `🌐 ${label}`;
  }

  btnContextMenuTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    contextDropdownMenu.classList.toggle('show');
  });

  document.querySelectorAll('#context-dropdown-menu .dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const depth = parseInt(item.dataset.depth, 10) || 1;
      selectedContextDepth = depth;

      // Update active state
      document.querySelectorAll('#context-dropdown-menu .dropdown-item').forEach(el => {
        const isCur = parseInt(el.dataset.depth, 10) === depth;
        el.classList.toggle('active', isCur);
        el.querySelector('.depth-check').textContent = isCur ? '✓' : '';
      });

      updateContextBtnText();
      contextDropdownMenu.classList.remove('show');
    });
  });

  // Close dropdown menu when clicking outside
  document.addEventListener('click', () => {
    contextDropdownMenu.classList.remove('show');
  });

  btnCopyContext.addEventListener('click', async () => {
    if (!currentNote) return;
    const originalText = btnCopyContext.innerHTML;
    btnCopyContext.innerHTML = '⏳ Đang tổng hợp context...';
    btnCopyContext.disabled = true;

    try {
      const res = await fetchJson(`/api/context?path=${encodeURIComponent(currentNote.path)}&depth=${selectedContextDepth}`);
      if (!res || !res.context_markdown) {
        alert('Không thể tổng hợp context cho ghi chú này.');
        btnCopyContext.innerHTML = originalText;
        btnCopyContext.disabled = false;
        return;
      }

      await navigator.clipboard.writeText(res.context_markdown);
      btnCopyContext.innerHTML = `✅ Đã copy (${res.total_notes} notes)!`;
      setTimeout(() => {
        btnCopyContext.innerHTML = originalText;
        btnCopyContext.disabled = false;
      }, 2000);
    } catch (err) {
      console.error('Error copying context:', err);
      alert('Lỗi khi sao chép context: ' + err.message);
      btnCopyContext.innerHTML = originalText;
      btnCopyContext.disabled = false;
    }
  });

  // Action Buttons
  btnCopyMd.addEventListener('click', async () => {
    if (!currentNote) return;
    const raw = isEditing && cmEditorInstance
      ? cmEditorInstance.getValue()
      : await ensureRawContent(currentNote.path);
    if (raw === null) return;
    await navigator.clipboard.writeText(raw);
    const originalText = btnCopyMd.textContent;
    btnCopyMd.textContent = window.I18n ? ('✅ ' + window.I18n.t('app.copied')) : '✅ Đã copy!';
    setTimeout(() => btnCopyMd.textContent = originalText, 1500);
  });

  btnOpenObsidian.addEventListener('click', () => {
    if (!currentNote) return;
    const vaultName = encodeURIComponent(currentVaultName || 'obsidian');
    const filePath = encodeURIComponent(currentNote.path.replace(/\.md$/, ''));
    const uri = `obsidian://open?vault=${vaultName}&file=${filePath}`;
    window.location.href = uri;
  });

  // Git Sync / Push Vault
  if (btnSyncVault) {
    btnSyncVault.addEventListener('click', async () => {
      const origHtml = btnSyncVault.innerHTML;
      btnSyncVault.disabled = true;
      btnSyncVault.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
          <line x1="12" y1="2" x2="12" y2="6"></line>
          <line x1="12" y1="18" x2="12" y2="22"></line>
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
          <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
          <line x1="2" y1="12" x2="6" y2="12"></line>
          <line x1="18" y1="12" x2="22" y2="12"></line>
          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
          <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
        </svg>
        <span class="btn-text">Đang sync...</span>
      `;

      try {
        const res = await fetch('/api/git-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();

        if (res.ok && data.status === 'ok') {
          btnSyncVault.innerHTML = `<span class="btn-text">✅ Đã push (${data.files_changed} files)!</span>`;
          alert(`✅ ${data.message}\nCommit: ${data.commit_message || 'HEAD'}`);
        } else if (res.ok && data.status === 'noop') {
          btnSyncVault.innerHTML = `<span class="btn-text">👌 Đã đồng bộ</span>`;
          alert(`👌 ${data.message}`);
        } else {
          btnSyncVault.innerHTML = `<span class="btn-text">❌ Lỗi push</span>`;
          alert(`❌ Đồng bộ thất bại:\n${data.message || 'Lỗi không xác định'}`);
        }
      } catch (err) {
        console.error('Error syncing vault:', err);
        btnSyncVault.innerHTML = `<span class="btn-text">❌ Lỗi kết nối</span>`;
        alert(`❌ Lỗi kết nối server khi push vault: ${err.message}`);
      } finally {
        setTimeout(() => {
          btnSyncVault.innerHTML = origHtml;
          btnSyncVault.disabled = false;
        }, 3000);
      }
    });
  }

  // ==========================================================================
  // Table of Contents (Outline) Logic & Scrollspy
  // ==========================================================================
  let tocUpdateDebounce = null;
  function scheduleTocUpdate() {
    clearTimeout(tocUpdateDebounce);
    tocUpdateDebounce = setTimeout(() => {
      if (isEditing) {
        generateToc();
      }
    }, 400);
  }

  function setTocOpen(open) {
    isTocOpen = open;
    localStorage.setItem('obs_toc_open', open ? 'true' : 'false');
    if (tocPanel) {
      if (open) {
        tocPanel.classList.remove('collapsed');
        tocPanel.style.display = 'flex';
      } else {
        tocPanel.classList.add('collapsed');
        tocPanel.style.display = 'none';
      }
    }
    if (btnToggleToc) {
      btnToggleToc.classList.toggle('active', open);
    }
  }

  function generateToc() {
    if (!tocList) return;

    if (!isEditing && !currentNote) {
      tocList.innerHTML = `<div class="toc-empty">${window.I18n ? window.I18n.t('toc.emptyNoNote') : 'Chưa chọn ghi chú nào'}</div>`;
      if (tocCountBadge) tocCountBadge.textContent = '0';
      return;
    }

    // Quick Edit Mode: CodeMirror/Lezer owns the outline. This avoids scanning
    // every line with regex after each editing burst.
    if (isEditing && cmEditorInstance) {
      const headings = cmEditorInstance.getHeadings ? cmEditorInstance.getHeadings() : [];

      if (headings.length === 0) {
        tocList.innerHTML = `<div class="toc-empty">${window.I18n ? window.I18n.t('toc.emptyNoHeadings') : 'Ghi chú không có tiêu đề'}</div>`;
        if (tocCountBadge) tocCountBadge.textContent = '0';
        return;
      }

      if (tocCountBadge) tocCountBadge.textContent = headings.length;
      tocList.innerHTML = '';

      headings.forEach((h) => {
        const a = document.createElement('a');
        a.className = `toc-item toc-level-${h.level}`;
        a.dataset.lineNumber = h.lineNumber;
        a.textContent = h.text;
        a.title = window.I18n
          ? window.I18n.t('toc.lineJumpTitle', { line: h.lineNumber, title: h.text })
          : `Dòng ${h.lineNumber}: ${h.text}`;

        a.addEventListener('click', (e) => {
          e.preventDefault();
          if (cmEditorInstance) {
            cmEditorInstance.scrollToLine(h.lineNumber);

            // Highlight corresponding line in CodeMirror if mounted
            try {
              if (cmEditorMount) {
                const lineEls = cmEditorMount.querySelectorAll('.cm-line');
                if (lineEls && lineEls[h.lineNumber - 1]) {
                  const targetLine = lineEls[h.lineNumber - 1];
                  targetLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  targetLine.classList.add('heading-highlight');
                  setTimeout(() => targetLine.classList.remove('heading-highlight'), 1200);
                }
              }
            } catch (_) {}

            // If in Split or Preview mode, scroll preview heading too
            if (currentEditMode === 'split' || currentEditMode === 'preview') {
              if (editPreviewBody) {
                const previewHeadings = editPreviewBody.querySelectorAll('h1, h2, h3, h4, h5, h6');
                const targetPh = Array.from(previewHeadings).find(ph => ph.textContent.trim() === h.text);
                if (targetPh) {
                  targetPh.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  targetPh.classList.add('heading-highlight');
                  setTimeout(() => targetPh.classList.remove('heading-highlight'), 1200);
                }
              }
            }

            document.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
            a.classList.add('active');
          }
        });

        tocList.appendChild(a);
      });

      updateActiveTocItem();
      return;
    }

    // Normal Reading/Viewing Mode
    if (!noteBody) return;
    const headings = Array.from(noteBody.querySelectorAll('h1, h2, h3, h4, h5, h6'));

    if (headings.length === 0) {
      tocList.innerHTML = `<div class="toc-empty">${window.I18n ? window.I18n.t('toc.emptyNoHeadings') : 'Ghi chú không có tiêu đề'}</div>`;
      if (tocCountBadge) tocCountBadge.textContent = '0';
      return;
    }

    if (tocCountBadge) tocCountBadge.textContent = headings.length;
    tocList.innerHTML = '';

    headings.forEach((h, index) => {
      if (!h.id) {
        const slug = h.textContent.trim().toLowerCase().replace(/[^\w\u00C0-\u024F\u1EA0-\u1EF9]+/g, '-');
        h.id = `heading-${index}-${slug}`.replace(/-+$/, '');
      }

      const level = parseInt(h.tagName.substring(1), 10) || 1;
      const a = document.createElement('a');
      a.className = `toc-item toc-level-${level}`;
      a.dataset.targetId = h.id;
      a.textContent = h.textContent.trim();
      a.title = h.textContent.trim();

      a.addEventListener('click', (e) => {
        e.preventDefault();
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        h.classList.add('heading-highlight');
        setTimeout(() => h.classList.remove('heading-highlight'), 1200);

        document.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
        a.classList.add('active');
      });

      tocList.appendChild(a);
    });

    updateActiveTocItem();
  }

  function updateActiveTocItem() {
    if (!tocList) return;

    if (isEditing) {
      if (!editContainer || !cmEditorMount) return;
      const lineEls = Array.from(cmEditorMount.querySelectorAll('.cm-line-h1, .cm-line-h2, .cm-line-h3, .cm-line-h4, .cm-line-h5, .cm-line-h6'));
      if (lineEls.length === 0) return;

      const containerRect = editContainer.getBoundingClientRect();
      const containerTop = containerRect.top;
      let currentLineEl = lineEls[0];

      for (let i = 0; i < lineEls.length; i++) {
        const top = lineEls[i].getBoundingClientRect().top;
        if (top - containerTop <= 140) {
          currentLineEl = lineEls[i];
        } else {
          break;
        }
      }

      if (currentLineEl) {
        const text = currentLineEl.textContent.replace(/^#{1,6}\s+/, '').trim();
        const activeLink = Array.from(tocList.querySelectorAll('.toc-item')).find(a => a.textContent.trim() === text);
        if (activeLink && !activeLink.classList.contains('active')) {
          document.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
          activeLink.classList.add('active');
          activeLink.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
      return;
    }

    // Normal note viewing mode
    if (!noteContainer || !noteBody) return;
    const headings = Array.from(noteBody.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    if (headings.length === 0) return;

    const containerRect = noteContainer.getBoundingClientRect();
    const containerTop = containerRect.top;
    let currentHeading = headings[0];

    for (let i = 0; i < headings.length; i++) {
      const top = headings[i].getBoundingClientRect().top;
      if (top - containerTop <= 100) {
        currentHeading = headings[i];
      } else {
        break;
      }
    }

    if (currentHeading && currentHeading.id) {
      const activeLink = tocList.querySelector(`.toc-item[data-target-id="${currentHeading.id}"]`);
      if (activeLink && !activeLink.classList.contains('active')) {
        document.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
        activeLink.classList.add('active');
        activeLink.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  if (btnToggleToc) {
    btnToggleToc.addEventListener('click', () => {
      setTocOpen(!isTocOpen);
    });
  }

  if (btnCloseRightSidebar) {
    btnCloseRightSidebar.addEventListener('click', () => {
      setTocOpen(false);
    });
  }

  if (noteContainer) {
    noteContainer.addEventListener('scroll', () => {
      clearTimeout(tocScrollDebounce);
      tocScrollDebounce = setTimeout(updateActiveTocItem, 50);
    });
  }

  if (editContainer) {
    editContainer.addEventListener('scroll', () => {
      if (isEditing) {
        clearTimeout(tocScrollDebounce);
        tocScrollDebounce = setTimeout(updateActiveTocItem, 50);
      }
    });
  }

  // Editor statistics: line count is O(1). Word count is intentionally updated
  // after a short idle period so a keypress never copies/splits the full note.
  function renderEditStats(words, lines) {
    if (!editStats) return;
    editStats.textContent = window.I18n
      ? window.I18n.t('editor.stats', { words, lines })
      : `${words} từ | ${lines} dòng`;
  }

  function countWords(text) {
    const trimmed = String(text || '').trim();
    return trimmed ? (trimmed.match(/\S+/g) || []).length : 0;
  }

  function updateEditStats(text) {
    if (typeof text === 'string') {
      const words = countWords(text);
      if (editStats) editStats.dataset.words = String(words);
      const stats = cmEditorInstance && cmEditorInstance.getStats ? cmEditorInstance.getStats() : null;
      const lines = stats ? stats.lines : ((text.match(/\n/g) || []).length + 1);
      renderEditStats(words, lines);
      return;
    }
    const stats = cmEditorInstance && cmEditorInstance.getStats ? cmEditorInstance.getStats() : { lines: 1 };
    const current = editStats && editStats.dataset.words ? Number(editStats.dataset.words) : 0;
    renderEditStats(current, stats.lines || 1);
  }

  function scheduleEditStatsUpdate() {
    clearTimeout(statsDebounceTimer);
    statsDebounceTimer = setTimeout(() => {
      if (!cmEditorInstance || !isEditing) return;
      const text = cmEditorInstance.getValue();
      const words = countWords(text);
      if (editStats) editStats.dataset.words = String(words);
      renderEditStats(words, cmEditorInstance.getStats ? cmEditorInstance.getStats().lines : text.split('\n').length);
    }, 500);
  }

  function updateLivePreview() {
    if (!editPreviewBody || !cmEditorInstance) return;
    if (currentEditMode !== 'split' && currentEditMode !== 'preview') return;
    const text = cmEditorInstance.getValue();
    if (hasMathSyntax(text)) loadKatex();
    setRenderedMarkdown(editPreviewBody, text, currentNote ? currentNote.path : '');
  }

  function scheduleLivePreviewUpdate(meta) {
    clearTimeout(livePreviewDebounceTimer);
    const length = meta && Number.isFinite(meta.length)
      ? meta.length
      : (cmEditorInstance && cmEditorInstance.getStats ? cmEditorInstance.getStats().length : 0);
    // Large notes deliberately trade a little preview latency for smooth typing.
    const delay = length < 100_000 ? 100 : length < 500_000 ? 220 : length < 1_000_000 ? 400 : 700;
    livePreviewDebounceTimer = setTimeout(updateLivePreview, delay);
  }

  function releasePreviewDom() {
    clearTimeout(livePreviewDebounceTimer);
    if (editPreviewBody) editPreviewBody.replaceChildren();
  }

  function setEditMode() {
    currentEditMode = 'live';
    if (editContentWrapper) {
      editContentWrapper.classList.remove('edit-mode-source', 'split-mode', 'preview-mode');
      editContentWrapper.classList.add('edit-mode-live');
    }
    if (cmEditorInstance) cmEditorInstance.setLivePreview(true);
    if (editSourcePane) editSourcePane.style.display = 'block';
    releasePreviewDom();
  }

  function destroyCodeMirror() {
    clearTimeout(statsDebounceTimer);
    clearTimeout(tocUpdateDebounce);
    if (cmEditorInstance) {
      try { cmEditorInstance.destroy(); } catch (_) {}
      cmEditorInstance = null;
    }
    if (cmEditorMount) cmEditorMount.replaceChildren();
  }

  function initCodeMirror(rawText) {
    if (cmEditorInstance || !window.ObsidianCM6 || !cmEditorMount) return;
    cmEditorInstance = window.ObsidianCM6.createEditor(cmEditorMount, {
      doc: rawText || '',
      notePath: currentNote ? currentNote.path : '',
      theme: currentTheme,
      livePreview: true,
      onChange: (meta) => {
        updateEditStats(meta);
        scheduleEditStatsUpdate();
        scheduleTocUpdate();
      },
      onSave: () => { if (btnSaveEdit) btnSaveEdit.click(); },
      onCancel: () => { if (btnCancelEdit) btnCancelEdit.click(); }
    });
    cmEditorInstance.setLivePreview(true);
  }

  function updateViewToggle() {
    if (!btnViewToggle) return;
    const editIcon = btnViewToggle.querySelector('.icon-edit');
    const readIcon = btnViewToggle.querySelector('.icon-read');
    if (editIcon) editIcon.style.display = isEditing ? 'none' : '';
    if (readIcon) readIcon.style.display = isEditing ? '' : 'none';
    const label = isEditing ? 'Chuyển sang chế độ Đọc (Ctrl + E)' : 'Chuyển sang chế độ Sửa (Ctrl + E)';
    btnViewToggle.title = label;
    btnViewToggle.setAttribute('aria-label', label);
  }

  function getScrollRatio(element) {
    if (!element) return 0;
    const max = Math.max(0, element.scrollHeight - element.clientHeight);
    return max > 0 ? Math.max(0, Math.min(1, element.scrollTop / max)) : 0;
  }

  function restoreScrollRatio(element, ratio) {
    if (!element) return;
    const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
    requestAnimationFrame(() => {
      const max = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollTop = max * safeRatio;
    });
  }

  async function enterEditMode() {
    if (!currentNote || isEditing) return;
    const readingScrollRatio = getScrollRatio(noteContainer);
    if (btnViewToggle) btnViewToggle.disabled = true;
    try {
      const [raw] = await Promise.all([ensureRawContent(currentNote.path), loadCodeMirror6()]);
      if (raw === null || !currentNote) return;
      isEditing = true;
      if (noteContainer) noteContainer.style.display = 'none';
      if (noteContentWrapper) noteContentWrapper.style.display = 'none';
      if (editContainer) editContainer.style.display = 'flex';
      if (tocPanel) tocPanel.style.display = isTocOpen ? 'flex' : 'none';
      if (editSaveStatus) editSaveStatus.textContent = '';

      if (noteBody && Number(currentNote.size || 0) > LARGE_NOTE_BYTES) {
        noteBody.replaceChildren();
        noteBody.dataset.evictedForEdit = '1';
        currentNote.content = null;
      }

      destroyCodeMirror();
      initCodeMirror(raw);
      currentRawContent = null;
      setEditMode();
      updateEditStats(raw);
      updateViewToggle();
      generateToc();
      restoreScrollRatio(editContainer, readingScrollRatio);
      setTimeout(() => { if (cmEditorInstance) cmEditorInstance.focus(); }, 20);
    } catch (err) {
      console.error('Failed to initialize editor:', err);
      alert('Không thể tải trình soạn thảo: ' + err.message);
      isEditing = false;
      updateViewToggle();
    } finally {
      if (btnViewToggle) btnViewToggle.disabled = false;
    }
  }

  if (btnViewToggle) {
    btnViewToggle.addEventListener('click', async () => {
      if (!currentNote) return;
      if (isEditing) await saveEditor(true);
      else await enterEditMode();
    });
  }

  if (noteContainer) {
    noteContainer.addEventListener('dblclick', (event) => {
      if (isEditing || !currentNote) return;
      if (event.target.closest('a, button, input, textarea, select, code, pre')) return;
      enterEditMode();
    });
  }

  async function restoreReadingBodyIfNeeded() {
    if (!noteBody || noteBody.dataset.evictedForEdit !== '1' || !currentNote) return;
    const restorePath = currentNote.path;
    delete noteBody.dataset.evictedForEdit;

    let content = currentNote.content;
    if (content == null) {
      noteBody.textContent = 'Đang khôi phục bản xem…';
      const refreshed = await fetchJson(`/api/note?path=${encodeURIComponent(restorePath)}`);
      if (!refreshed || !currentNote || currentNote.path !== restorePath) return;
      currentNote.frontmatter = refreshed.frontmatter;
      currentNote.tags = refreshed.tags;
      currentNote.backlinks = refreshed.backlinks;
      currentNote.mtime = refreshed.mtime;
      currentNote.size = refreshed.size;
      content = refreshed.content;
    }

    if (!currentNote || currentNote.path !== restorePath) return;
    setRenderedMarkdown(noteBody, content, restorePath);
    // Keep large reading documents single-copy: the DOM remains, source is fetched
    // on demand again only when the user edits or copies Markdown.
    currentNote.content = Number(currentNote.size || 0) > LARGE_NOTE_BYTES ? null : content;
  }

  btnCancelEdit.addEventListener('click', async () => {
    const editScrollRatio = getScrollRatio(editContainer);
    isEditing = false;
    releasePreviewDom();
    destroyCodeMirror();
    currentRawContent = null;
    if (editContainer) editContainer.style.display = 'none';
    if (noteContainer) noteContainer.style.display = 'block';
    if (tocPanel) tocPanel.style.display = isTocOpen ? 'flex' : 'none';
    if (noteContentWrapper) noteContentWrapper.style.display = 'block';
    await restoreReadingBodyIfNeeded();
    restoreScrollRatio(noteContainer, editScrollRatio);
    updateViewToggle();
    generateToc();
  });

  let isSaving = false;
  async function saveEditor(returnToReading = false) {
    if (isSaving || !currentNote || !cmEditorInstance) return false;
    isSaving = true;
    const savePath = currentNote.path;
    const newContent = cmEditorInstance.getValue();
    const editScrollRatio = returnToReading ? getScrollRatio(editContainer) : 0;
    if (editSaveStatus) editSaveStatus.textContent = 'Đang lưu…';

    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: savePath, content: newContent })
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'saved') throw new Error(data.error || 'Unknown error');

      currentRawContent = null;
      const updated = await fetchJson(`/api/note?path=${encodeURIComponent(savePath)}`);
      if (updated && currentNote && currentNote.path === savePath) {
        currentNote.frontmatter = updated.frontmatter;
        currentNote.tags = updated.tags;
        currentNote.backlinks = updated.backlinks;
        currentNote.mtime = updated.mtime;
        currentNote.size = updated.size;
        setRenderedMarkdown(noteBody, updated.content, updated.path);
        delete noteBody.dataset.evictedForEdit;
        currentNote.content = Number(updated.size || 0) > LARGE_NOTE_BYTES ? null : updated.content;
      } else {
        setRenderedMarkdown(noteBody, newContent, savePath);
        delete noteBody.dataset.evictedForEdit;
      }

      if (editSaveStatus) editSaveStatus.textContent = '✓ Đã lưu';

      if (returnToReading) {
        isEditing = false;
        releasePreviewDom();
        destroyCodeMirror();
        if (editContainer) editContainer.style.display = 'none';
        if (noteContainer) noteContainer.style.display = 'block';
        if (noteContentWrapper) noteContentWrapper.style.display = 'block';
        if (tocPanel) tocPanel.style.display = isTocOpen ? 'flex' : 'none';
        updateViewToggle();
        generateToc();
        restoreScrollRatio(noteContainer, editScrollRatio);
      } else if (cmEditorInstance) {
        cmEditorInstance.focus();
        setTimeout(() => { if (editSaveStatus) editSaveStatus.textContent = ''; }, 1200);
      }
      return true;
    } catch (e) {
      if (editSaveStatus) editSaveStatus.textContent = 'Lỗi lưu';
      alert((window.I18n ? window.I18n.t('editor.connectError') : 'Lỗi khi lưu: ') + e.message);
      return false;
    } finally {
      isSaving = false;
    }
  }

  if (btnSaveEdit) btnSaveEdit.addEventListener('click', () => saveEditor(false));
  window.addEventListener('oq-live-save-request', () => {
    if (isEditing) saveEditor(false);
  });
  window.addEventListener('oq-live-toggle-request', () => {
    if (isEditing) saveEditor(true);
  });

  // Reset Note View Helper
  function resetNoteView() {
    isEditing = false;
    releasePreviewDom();
    destroyCodeMirror();
    currentRawContent = null;
    currentNote = null;
    if (emptyState) emptyState.style.display = 'block';
    if (noteContentWrapper) noteContentWrapper.style.display = 'none';
    generateToc();
    if (noteContainer) noteContainer.style.display = 'block';
    if (editContainer) editContainer.style.display = 'none';
    if (btnCopyMd) btnCopyMd.style.display = 'none';
    if (btnViewToggle) btnViewToggle.style.display = 'none';
    if (btnOpenObsidian) btnOpenObsidian.style.display = 'none';
    if (contextDropdownWrapper) contextDropdownWrapper.style.display = 'none';
    if (noteBreadcrumb) {
      noteBreadcrumb.innerHTML = `<span>${window.I18n ? window.I18n.t('nav.selectNotePrompt') : 'Chọn một ghi chú để bắt đầu xem'}</span>`;
    }
    noteHistory.length = 0;
    historyIndex = -1;
    updateHistoryButtons();
  }

  // Vault Management Logic
  function formatDisplayPath(path) {
    if (!path) return '';
    return path.replace(/^\/home\/[^\/]+/, '~');
  }

  function renderVaultCards() {
    if (!vaultItemsList) return;
    vaultItemsList.innerHTML = '';

    if (!knownVaults || knownVaults.length === 0) {
      const emptyMsg = window.I18n
        ? window.I18n.t('vault.emptyVaults')
        : 'Chưa tìm thấy vault nào. Vui lòng thêm đường dẫn bên dưới.';
      vaultItemsList.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 13px;">${emptyMsg}</div>`;
      return;
    }

    knownVaults.forEach(vault => {
      const card = document.createElement('div');
      card.className = 'vault-card';
      if (vault.is_current && vault.exists) card.classList.add('active');
      if (!vault.exists) card.classList.add('missing');

      // Left
      const left = document.createElement('div');
      left.className = 'vault-card-left';

      const icon = document.createElement('div');
      icon.className = 'vault-card-icon';
      icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
      </svg>`;

      const info = document.createElement('div');
      info.className = 'vault-card-info';

      const nameRow = document.createElement('div');
      nameRow.className = 'vault-card-name-row';

      const name = document.createElement('span');
      name.className = 'vault-card-name';
      name.textContent = vault.name;
      nameRow.appendChild(name);

      const pathSpan = document.createElement('span');
      pathSpan.className = 'vault-card-path';
      pathSpan.textContent = formatDisplayPath(vault.path);
      pathSpan.title = vault.path;

      info.appendChild(nameRow);
      info.appendChild(pathSpan);
      left.appendChild(icon);
      left.appendChild(info);

      // Badges
      const badges = document.createElement('div');
      badges.className = 'vault-card-badges';

      if (!vault.exists) {
        const badgeMissing = document.createElement('span');
        badgeMissing.className = 'vault-badge badge-missing';
        badgeMissing.textContent = window.I18n ? window.I18n.t('vault.badgeMissing') : 'Đã biến mất';
        badges.appendChild(badgeMissing);
      } else {
        if (vault.is_current) {
          const badgeCur = document.createElement('span');
          badgeCur.className = 'vault-badge badge-current';
          badgeCur.textContent = window.I18n ? window.I18n.t('vault.badgeCurrent') : 'Đang mở';
          badges.appendChild(badgeCur);
        }
        if (vault.is_default) {
          const badgeDef = document.createElement('span');
          badgeDef.className = 'vault-badge badge-default';
          badgeDef.textContent = window.I18n ? window.I18n.t('vault.badgeDefault') : 'Mặc định';
          badges.appendChild(badgeDef);
        }
      }

      const badgeSource = document.createElement('span');
      badgeSource.className = 'vault-badge badge-source';
      badgeSource.textContent = vault.source === 'obsidian'
        ? (window.I18n ? window.I18n.t('vault.badgeSourceObsidian') : 'Obsidian')
        : (window.I18n ? window.I18n.t('vault.badgeSourceCustom') : 'Tùy chọn');
      badges.appendChild(badgeSource);

      card.appendChild(left);
      card.appendChild(badges);

      card.addEventListener('click', () => {
        if (!vault.exists) {
          alert(`⚠️ Thư mục vault không tồn tại trên hệ thống:\n${vault.path}\n\nThư mục này có thể đã bị xóa hoặc di chuyển.`);
          return;
        }
        if (vault.is_current && !isCurrentVaultMissing) {
          closeVaultModal();
          return;
        }
        switchVault(vault.path, chkSetDefaultVault ? chkSetDefaultVault.checked : true);
      });

      vaultItemsList.appendChild(card);
    });
  }

  function openVaultModal(isMandatory = false, customTitle = null, customDesc = null) {
    if (!vaultModalBackdrop) return;
    renderVaultCards();

    if (customTitle && vaultModalTitle) vaultModalTitle.textContent = customTitle;
    if (customDesc && vaultModalDesc) vaultModalDesc.textContent = customDesc;

    if (isMandatory) {
      if (btnCloseVaultModal) btnCloseVaultModal.style.display = 'none';
    } else {
      if (btnCloseVaultModal) btnCloseVaultModal.style.display = 'inline-flex';
    }

    if (vaultAddError) vaultAddError.style.display = 'none';
    if (inputCustomVault) inputCustomVault.value = '';

    vaultModalBackdrop.classList.add('active');
  }

  function closeVaultModal() {
    if (isCurrentVaultMissing) return;
    if (vaultModalBackdrop) {
      vaultModalBackdrop.classList.remove('active');
    }
  }

  async function checkVaultsStatus(initialCheck = false) {
    try {
      const res = await fetch('/api/vaults');
      if (!res.ok) return;
      const data = await res.json();

      currentVaultPath = data.current_vault || '';
      currentVaultName = data.current_vault_name || 'Obsidian';
      knownVaults = data.vaults || [];
      isCurrentVaultMissing = !data.current_vault_exists;

      if (sidebarVaultName) sidebarVaultName.textContent = currentVaultName;
      if (sidebarVaultPath) {
        sidebarVaultPath.textContent = isCurrentVaultMissing ? '⚠️ Không tìm thấy vault' : formatDisplayPath(currentVaultPath);
        sidebarVaultPath.title = currentVaultPath;
        if (isCurrentVaultMissing) {
          sidebarVaultPath.style.color = '#ef4444';
        } else {
          sidebarVaultPath.style.color = '';
        }
      }

      if (isCurrentVaultMissing) {
        if (vaultMissingAlert) vaultMissingAlert.style.display = 'flex';
        if (vaultMissingMsg) {
          vaultMissingMsg.textContent = `Thư mục vault không còn tồn tại tại: "${currentVaultPath}". Thư mục có thể đã bị xóa hoặc đổi tên. Vui lòng chọn hoặc thêm một vault khác để tiếp tục sử dụng.`;
        }
        openVaultModal(true, '⚠️ Vault đã biến mất!', 'Vui lòng chọn hoặc thêm một vault còn tồn tại trên máy tính.');
      } else if (data.is_first_run && initialCheck) {
        if (vaultMissingAlert) vaultMissingAlert.style.display = 'none';
        openVaultModal(false, 'Chọn Vault Obsidian để bắt đầu', 'Chọn vault bạn muốn mở mặc định trong Obsidian QuickView.');
      } else {
        if (vaultMissingAlert) vaultMissingAlert.style.display = 'none';
      }
    } catch (e) {
      console.error('Error checking vaults status:', e);
    }
  }

  async function switchVault(targetPath, setDefault = true) {
    try {
      const res = await fetch('/api/vaults/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: targetPath,
          set_default: setDefault
        })
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'ok') {
        alert('❌ Không thể chuyển vault: ' + (data.error || data.message || 'Lỗi không xác định'));
        return;
      }

      isCurrentVaultMissing = false;
      closeVaultModal();

      // Reset Note View & History
      resetNoteView();

      // Refresh sidebar data
      await checkVaultsStatus(false);
      treeLoaded = false;
      tagsLoaded = false;
      if (treeContainer) treeContainer.innerHTML = '<span>Đang tải danh mục...</span>';
      if (tagsContainer) tagsContainer.innerHTML = '<span>Đang tải tags...</span>';
      await Promise.all([loadTree(), loadRecent()]);

    } catch (e) {
      alert('❌ Lỗi kết nối khi chuyển vault: ' + e.message);
    }
  }

  async function addCustomVault() {
    if (!inputCustomVault) return;
    const path = inputCustomVault.value.trim();
    if (!path) {
      if (vaultAddError) {
        vaultAddError.textContent = 'Vui lòng nhập đường dẫn thư mục vault!';
        vaultAddError.style.display = 'block';
      }
      return;
    }

    try {
      const res = await fetch('/api/vaults/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path })
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'ok') {
        if (vaultAddError) {
          vaultAddError.textContent = data.error || data.message || 'Thư mục không tồn tại!';
          vaultAddError.style.display = 'block';
        }
        return;
      }

      // Switch to this newly added vault immediately
      await switchVault(path, chkSetDefaultVault ? chkSetDefaultVault.checked : true);
    } catch (e) {
      if (vaultAddError) {
        vaultAddError.textContent = 'Lỗi kết nối: ' + e.message;
        vaultAddError.style.display = 'block';
      }
    }
  }

  // Vault Switcher Event Listeners
  if (btnVaultSwitcher) {
    btnVaultSwitcher.addEventListener('click', () => {
      openVaultModal(isCurrentVaultMissing, 'Chuyển đổi Vault Obsidian', 'Chọn vault bạn muốn sử dụng hoặc thêm thư mục mới.');
    });
  }

  if (btnCloseVaultModal) {
    btnCloseVaultModal.addEventListener('click', closeVaultModal);
  }

  if (vaultModalBackdrop) {
    vaultModalBackdrop.addEventListener('click', (e) => {
      if (e.target === vaultModalBackdrop && !isCurrentVaultMissing) {
        closeVaultModal();
      }
    });
  }

  if (btnAddCustomVault) {
    btnAddCustomVault.addEventListener('click', addCustomVault);
  }

  if (inputCustomVault) {
    inputCustomVault.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomVault();
      }
    });
  }

  // Settings Modal Logic
  function updateSettingsLanguageUI() {
    const currentLang = window.I18n ? window.I18n.getLanguage() : (localStorage.getItem('obs_lang') || 'vi');
    const cards = document.querySelectorAll('.settings-lang-card');
    cards.forEach(card => {
      const lang = card.dataset.lang;
      const radio = card.querySelector('input[type="radio"]');
      if (lang === currentLang) {
        card.classList.add('active');
        if (radio) radio.checked = true;
      } else {
        card.classList.remove('active');
        if (radio) radio.checked = false;
      }
    });
  }

  function openSettingsModal() {
    if (settingsModalBackdrop) {
      updateSettingsLanguageUI();
      settingsModalBackdrop.classList.add('active');
    }
  }

  function closeSettingsModal() {
    if (settingsModalBackdrop) {
      settingsModalBackdrop.classList.remove('active');
    }
  }

  if (btnSettings) {
    btnSettings.addEventListener('click', openSettingsModal);
  }

  if (btnCloseSettingsModal) {
    btnCloseSettingsModal.addEventListener('click', closeSettingsModal);
  }

  if (settingsModalBackdrop) {
    settingsModalBackdrop.addEventListener('click', (e) => {
      if (e.target === settingsModalBackdrop) {
        closeSettingsModal();
      }
    });
  }

  // Language switcher card click handlers
  document.querySelectorAll('.settings-lang-card').forEach(card => {
    card.addEventListener('click', async () => {
      const lang = card.dataset.lang;
      if (lang && window.I18n && window.I18n.getLanguage() !== lang) {
        await window.I18n.setLanguage(lang);
        updateSettingsLanguageUI();
      }
    });
  });

  // Re-sync dynamic UI elements on language change
  window.addEventListener('languageChanged', (e) => {
    updateSettingsLanguageUI();
    updateContextBtnText();
    renderVaultCards();
    generateToc();
    renderRecentNotes();
    if (!currentNote && noteBreadcrumb) {
      noteBreadcrumb.innerHTML = `<span>${window.I18n ? window.I18n.t('nav.selectNotePrompt') : 'Chọn một ghi chú để bắt đầu xem'}</span>`;
    } else if (currentNote) {
      if (backlinksCountLabel && currentNote.backlinks && currentNote.backlinks.length > 0) {
        backlinksCountLabel.textContent = window.I18n
          ? window.I18n.t('note.backlinksCount', { count: currentNote.backlinks.length })
          : `Liên kết ngược (${currentNote.backlinks.length} ghi chú tham chiếu tới đây)`;
      }
    }
    if (isEditing && cmEditorInstance) {
      updateEditStats();
      scheduleEditStatsUpdate();
    }
    setSearchMode(currentSearchMode);
  });

  // Initial Load
  if (window.I18n) {
    window.I18n.init().then(() => {
      updateSettingsLanguageUI();
      updateContextBtnText();
    });
  } else {
    updateSettingsLanguageUI();
    updateContextBtnText();
  }

  setTocOpen(isTocOpen);
  checkVaultsStatus(true).finally(() => {
    loadRecent();
  });
  loadTree();

  // If URL has ?path=..., open it
  const urlParams = new URLSearchParams(window.location.search);
  const initialPath = urlParams.get('path');
  if (initialPath) {
    loadNote(initialPath);
  }
})();
