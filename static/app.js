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
  const btnQuickEdit = document.getElementById('btn-quick-edit');
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
  const editPreviewPane = document.getElementById('edit-preview-pane');
  const editPreviewBody = document.getElementById('edit-preview-body');
  const cmEditorMount = document.getElementById('cm-editor-mount');
  const editStats = document.getElementById('edit-stats');
  const btnModeLive = document.getElementById('btn-mode-live');
  const btnModeSource = document.getElementById('btn-mode-source');
  const btnModeSplit = document.getElementById('btn-mode-split');
  const btnModePreview = document.getElementById('btn-mode-preview');
  const btnSaveEdit = document.getElementById('btn-save-edit');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');

  let cmEditorInstance = null;
  let currentEditMode = localStorage.getItem('obs_edit_mode') || 'live'; // 'live' | 'source' | 'split' | 'preview'
  let livePreviewDebounceTimer = null;

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

    marked.setOptions({
      gfm: true,
      breaks: true,
      highlight: function (code, lang) {
        if (typeof hljs !== 'undefined') {
          const language = hljs.getLanguage(lang) ? lang : 'plaintext';
          try {
            return hljs.highlight(code, { language }).value;
          } catch (e) {
            return code;
          }
        }
        return code;
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
    }
    const escaped = String(latex).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return isBlock
      ? `<pre class="math-block-error"><code>$$${escaped}$$</code></pre>`
      : `<code class="math-inline-error">$${escaped}$</code>`;
  }

  // Pre-process and render Markdown with Obsidian specifics
  function renderMarkdown(rawMd, currentNotePath) {
    let md = rawMd;

    const codeBlocks = [];
    const mathBlocks = [];
    const mathInlines = [];

    // 1. Protect code blocks: ```...``` or ~~~...~~~
    md = md.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (match) => {
      const id = codeBlocks.length;
      codeBlocks.push(match);
      return `%%CODEBLOCK_${id}%%`;
    });

    // 2. Protect inline code: `...`
    md = md.replace(/`([^`\n]+?)`/g, (match) => {
      const id = codeBlocks.length;
      codeBlocks.push(match);
      return `%%CODEBLOCK_${id}%%`;
    });

    // 3. Extract Block Math: $$ ... $$ or $$\n ... \n$$
    md = md.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
      const id = mathBlocks.length;
      // Strip leading blockquote '>' if present on each line
      const clean = content.replace(/^[ \t]*>[ \t]?/gm, '').trim();
      mathBlocks.push(clean);
      return `%%MATHBLOCK_${id}%%`;
    });

    // 4. Extract Inline Math: $...$
    md = md.replace(/(^|[^\\])\$([^\s\$\n](?:[^\$\n]*?[^\s\$\n])?)\$/g, (match, prefix, content) => {
      const id = mathInlines.length;
      mathInlines.push(content);
      return `${prefix}%%MATHINLINE_${id}%%`;
    });

    // 5. Restore code blocks so marked can parse them normally
    md = md.replace(/%%CODEBLOCK_(\d+)%%/g, (match, id) => {
      return codeBlocks[parseInt(id, 10)];
    });

    // Regex nhận diện các định dạng file đính kèm / tài liệu / media
    const ATTACHMENT_EXT_REGEX = /\.(png|jpe?g|gif|svg|webp|bmp|ico|pdf|mp4|webm|ogv|mp3|wav|ogg|m4a|flac|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|tar|gz|txt|csv)$/i;

    // 6. Process Obsidian Embeds: ![[image.png]] or ![[image.png|300]]
    md = md.replace(/!\[\[(.*?)\]\]/g, (match, inner) => {
      const parts = inner.split('|');
      const filename = parts[0].trim();
      const extra = parts[1] ? `width="${parts[1].trim()}"` : '';
      const isImg = /\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(filename);
      if (isImg) {
        return `<a href="/vault/${encodeURI(filename)}" target="_blank" rel="noopener noreferrer" class="image-embed-link" title="Mở ảnh trên tab mới"><img src="/vault/${encodeURI(filename)}" alt="${filename}" ${extra} loading="lazy" onerror="this.onerror=null; this.src='/vault/images/${encodeURI(filename)}';" /></a>`;
      }
      return `<div class="embed-box">📄 Đính kèm: <a href="/vault/${encodeURI(filename)}" target="_blank" rel="noopener noreferrer">${filename}</a></div>`;
    });

    // 7. Process Obsidian Wikilinks: [[Target]] or [[Target|Alias]]
    md = md.replace(/\[\[(.*?)\]\]/g, (match, inner) => {
      const parts = inner.split('|');
      const target = parts[0].trim();
      const alias = parts[1] ? parts[1].trim() : target;
      const targetWithoutAnchor = target.split('#')[0];
      const isAtt = ATTACHMENT_EXT_REGEX.test(targetWithoutAnchor);
      if (isAtt) {
        return `<a class="wikilink wikilink-attachment" href="/vault/${encodeURI(target)}" target="_blank" rel="noopener noreferrer" data-target="${target}">${alias}</a>`;
      }
      return `<span class="wikilink" data-target="${target}">${alias}</span>`;
    });

    // 8. Render HTML via Marked
    let html = typeof marked !== 'undefined' ? marked.parse(md) : md;

    // 9. Process Obsidian Callouts
    html = html.replace(
      /<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|DANGER|TODO|FAQ|SUMMARY|EXAMPLE|QUOTE)\]\s*([^\n<]*)(?:<br\s*\/?>|\n)?([\s\S]*?)<\/p>\s*([\s\S]*?)<\/blockquote>/gis,
      (match, type, title, firstParaRest, remainingBody) => {
        const typeLower = type.toLowerCase();
        const calloutTitle = title ? title.trim() : type.toUpperCase();
        let body = '';
        if (firstParaRest && firstParaRest.trim()) {
          body += `<p>${firstParaRest.trim()}</p>`;
        }
        if (remainingBody && remainingBody.trim()) {
          body += remainingBody.trim();
        }
        return `
          <div class="callout callout-${typeLower}">
            <div class="callout-title">
              <span>📌</span>
              <strong>${calloutTitle}</strong>
            </div>
            <div class="callout-body">${body}</div>
          </div>
        `;
      }
    );

    // 10. Unwrap <p> around block math placeholders
    html = html.replace(/<p>\s*(%%MATHBLOCK_\d+%%)\s*<\/p>/g, '$1');

    // 11. Replace Block Math Placeholders with KaTeX rendered HTML
    html = html.replace(/%%MATHBLOCK_(\d+)%%/g, (match, id) => {
      const latex = mathBlocks[parseInt(id, 10)];
      return `<div class="math-block">${renderLatex(latex, true)}</div>`;
    });

    // 12. Replace Inline Math Placeholders
    html = html.replace(/%%MATHINLINE_(\d+)%%/g, (match, id) => {
      const latex = mathInlines[parseInt(id, 10)];
      return `<span class="math-inline">${renderLatex(latex, false)}</span>`;
    });

    return html;
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
    btnQuickEdit.style.display = 'inline-flex';
    btnOpenObsidian.style.display = 'inline-flex';
    contextDropdownWrapper.style.display = 'inline-flex';

    // Render Clickable Breadcrumbs:
    // If user navigated from a previous note in history, display that note as clickable crumb!
    let breadcrumbHtml = '';
    if (historyIndex > 0) {
      const prevNote = noteHistory[historyIndex - 1];
      breadcrumbHtml += `<a class="breadcrumb-crumb" data-path="${prevNote.path}" title="Quay lại ${prevNote.title}">${prevNote.title}</a>`;
      breadcrumbHtml += `<span class="breadcrumb-separator">›</span>`;
    } else {
      const folderParts = (data.folder && data.folder !== '/') ? data.folder.split('/') : [];
      if (folderParts.length > 0) {
        breadcrumbHtml += folderParts.map(p => `<span>${p}</span>`).join('<span class="breadcrumb-separator">›</span>');
        breadcrumbHtml += `<span class="breadcrumb-separator">›</span>`;
      }
    }
    breadcrumbHtml += `<span class="breadcrumb-title" title="${data.title}">${data.title}</span>`;
    noteBreadcrumb.innerHTML = breadcrumbHtml;

    // Helper to format frontmatter values (clickable link + copy button if URL or share_link)
    function formatFrontmatterValue(key, val) {
      if (val === null || val === undefined) return '';
      const rawStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
      const isShareLink = String(key).toLowerCase() === 'share_link';
      const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;

      if (isShareLink || urlRegex.test(rawStr)) {
        // Replace URLs with clickable link + copy button
        const html = rawStr.replace(urlRegex, (url) => {
          return `<span class="frontmatter-link-wrapper">` +
            `<a href="${url}" target="_blank" rel="noopener noreferrer" class="frontmatter-url" title="Mở liên kết">${url}</a>` +
            `<button type="button" class="btn-copy-link" data-url="${url}" title="Sao chép liên kết">` +
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
      let fmHtml = '';
      if (data.tags && data.tags.length > 0) {
        fmHtml += `
          <div class="frontmatter-row">
            <span class="frontmatter-key">Tags:</span>
            <div class="frontmatter-val">${data.tags.map(t => `<span class="tag-pill" data-tag="${t}">#${t}</span>`).join('')}</div>
          </div>
        `;
      }
      for (const [k, v] of Object.entries(data.frontmatter || {})) {
        if (k === 'tags' || k === 'tag') continue;
        const valHtml = formatFrontmatterValue(k, v);
        fmHtml += `
          <div class="frontmatter-row">
            <span class="frontmatter-key">${k}:</span>
            <div class="frontmatter-val">${valHtml}</div>
          </div>
        `;
      }
      noteFrontmatter.innerHTML = fmHtml;
      noteFrontmatter.style.display = fmHtml ? 'block' : 'none';
    } else {
      noteFrontmatter.style.display = 'none';
    }

    // Render markdown content
    noteBody.innerHTML = renderMarkdown(data.content, data.path);

    // Generate Table of Contents (Outline)
    generateToc();

    // Backlinks
    if (data.backlinks && data.backlinks.length > 0) {
      backlinksCountLabel.textContent = window.I18n
        ? window.I18n.t('note.backlinksCount', { count: data.backlinks.length })
        : `Liên kết ngược (${data.backlinks.length} ghi chú tham chiếu tới đây)`;
      backlinksList.innerHTML = data.backlinks.map(b => `
        <div class="backlink-card" data-path="${b.path}">
          <span>📝 <strong>${b.title}</strong></span>
          <span style="font-size: 11px; opacity: 0.7;">${b.folder}</span>
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

  // Icons
  const SVG_NOTE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="item-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
  const SVG_FOLDER = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="item-icon"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
  const SVG_TAG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="item-icon"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`;

  // Load Folder Tree
  async function loadTree() {
    const tree = await fetchJson('/api/tree');
    if (!tree) return;

    function renderNode(node) {
      if (node.type === 'file') {
        return `
          <div class="file-item" data-path="${node.path}">
            ${SVG_NOTE}
            <span style="overflow: hidden; text-overflow: ellipsis;">${node.name}</span>
          </div>
        `;
      }

      // Folder
      const childKeys = Object.keys(node.children || {}).sort((a, b) => {
        const aIsFolder = node.children[a].type === 'folder';
        const bIsFolder = node.children[b].type === 'folder';
        if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
        return a.localeCompare(b);
      });

      const childrenHtml = childKeys.map(k => renderNode(node.children[k])).join('');
      const count = childKeys.length;

      return `
        <details class="tree-folder" ${node.name === 'Vault' || node.name === 'Notes' ? 'open' : ''}>
          <summary class="folder-item">
            ${SVG_FOLDER}
            <strong>${node.name}</strong>
            <span class="item-badge">${count}</span>
          </summary>
          <div class="tree-node">
            ${childrenHtml}
          </div>
        </details>
      `;
    }

    treeContainer.innerHTML = renderNode(tree);
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
      <div class="recent-item ${curPath === r.path ? 'active' : ''}" data-path="${r.path}">
        ${SVG_NOTE}
        <div style="overflow: hidden; text-overflow: ellipsis;">
          <div>${r.title}</div>
          <div style="font-size: 11px; opacity: 0.6;">${r.folder || ''}</div>
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

    tagsContainer.innerHTML = data.tags.map(t => `
      <div class="tag-item" data-tag="${t.tag}">
        ${SVG_TAG}
        <span>#${t.tag}</span>
        <span class="item-badge">${t.count}</span>
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

  function renderSearchResults() {
    searchResultsContainer.innerHTML = searchResults.map((r, i) => `
      <div class="search-item ${i === selectedIndex ? 'selected' : ''}" data-index="${i}" data-path="${r.path}">
        <div class="search-item-header">
          <span class="search-item-title" style="display: inline-flex; align-items: center; gap: 6px;">
            ${SVG_NOTE}
            <span>${r.title}</span>
          </span>
          <span class="search-item-path">${r.folder}</span>
        </div>
        ${r.snippet_content ? `<div class="search-snippet">${r.snippet_content}</div>` : ''}
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
  btnCopyMd.addEventListener('click', () => {
    if (!currentNote) return;
    navigator.clipboard.writeText(currentNote.raw_content).then(() => {
      const originalText = btnCopyMd.textContent;
      btnCopyMd.textContent = window.I18n ? ('✅ ' + window.I18n.t('app.copied')) : '✅ Đã copy!';
      setTimeout(() => btnCopyMd.textContent = originalText, 1500);
    });
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
    }, 250);
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

    // Quick Edit Mode: Extract headings directly from CodeMirror Editor
    if (isEditing && cmEditorInstance) {
      const doc = cmEditorInstance.view.state.doc;
      const headings = [];
      for (let l = 1; l <= doc.lines; l++) {
        const line = doc.line(l);
        const m = line.text.match(/^(#{1,6})\s+(.+)$/);
        if (m) {
          headings.push({
            level: m[1].length,
            text: m[2].trim(),
            lineNumber: l,
            lineFrom: line.from
          });
        }
      }

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

  // Word & Line Count Stats
  function updateEditStats(text) {
    if (!editStats) return;
    const lines = text.split('\n').length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    editStats.textContent = window.I18n
      ? window.I18n.t('editor.stats', { words, lines })
      : `${words} từ | ${lines} dòng`;
  }

  // Update Live Preview Pane
  function updateLivePreview() {
    if (!editPreviewBody || !cmEditorInstance) return;
    const text = cmEditorInstance.getValue();
    updateEditStats(text);
    if (currentEditMode === 'split' || currentEditMode === 'preview') {
      const renderedHtml = renderMarkdown(text, currentNote ? currentNote.path : '');
      editPreviewBody.innerHTML = renderedHtml;
    }
  }

  function scheduleLivePreviewUpdate() {
    clearTimeout(livePreviewDebounceTimer);
    livePreviewDebounceTimer = setTimeout(updateLivePreview, 60);
  }

  // Switch Edit Mode: 'live' | 'source' | 'split' | 'preview'
  function setEditMode(mode) {
    currentEditMode = mode;
    localStorage.setItem('obs_edit_mode', mode);

    [btnModeLive, btnModeSource, btnModeSplit, btnModePreview].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    if (editContentWrapper) {
      editContentWrapper.classList.remove('edit-mode-live', 'edit-mode-source', 'split-mode', 'preview-mode');
    }

    if (mode === 'live') {
      if (btnModeLive) btnModeLive.classList.add('active');
      if (editContentWrapper) editContentWrapper.classList.add('edit-mode-live');
      if (cmEditorInstance) cmEditorInstance.setLivePreview(true);
      if (editSourcePane) editSourcePane.style.display = 'block';
      if (editPreviewPane) editPreviewPane.style.display = 'none';
      if (cmEditorInstance) cmEditorInstance.focus();
    } else if (mode === 'source') {
      if (btnModeSource) btnModeSource.classList.add('active');
      if (editContentWrapper) editContentWrapper.classList.add('edit-mode-source');
      if (cmEditorInstance) cmEditorInstance.setLivePreview(false);
      if (editSourcePane) editSourcePane.style.display = 'block';
      if (editPreviewPane) editPreviewPane.style.display = 'none';
      if (cmEditorInstance) cmEditorInstance.focus();
    } else if (mode === 'split') {
      if (btnModeSplit) btnModeSplit.classList.add('active');
      if (editContentWrapper) editContentWrapper.classList.add('split-mode', 'edit-mode-live');
      if (cmEditorInstance) cmEditorInstance.setLivePreview(true);
      if (editSourcePane) editSourcePane.style.display = 'block';
      if (editPreviewPane) editPreviewPane.style.display = 'block';
      updateLivePreview();
      if (cmEditorInstance) cmEditorInstance.focus();
    } else if (mode === 'preview') {
      if (btnModePreview) btnModePreview.classList.add('active');
      if (editContentWrapper) editContentWrapper.classList.add('preview-mode');
      if (editSourcePane) editSourcePane.style.display = 'none';
      if (editPreviewPane) editPreviewPane.style.display = 'block';
      updateLivePreview();
    }
  }

  if (btnModeLive) btnModeLive.addEventListener('click', () => setEditMode('live'));
  if (btnModeSource) btnModeSource.addEventListener('click', () => setEditMode('source'));
  if (btnModeSplit) btnModeSplit.addEventListener('click', () => setEditMode('split'));
  if (btnModePreview) btnModePreview.addEventListener('click', () => setEditMode('preview'));

  // Initialize CodeMirror 6 Editor
  function initCodeMirror() {
    if (cmEditorInstance || !window.ObsidianCM6 || !cmEditorMount) return;
    cmEditorInstance = window.ObsidianCM6.createEditor(cmEditorMount, {
      doc: currentNote ? currentNote.raw_content : '',
      theme: currentTheme,
      livePreview: currentEditMode !== 'source',
      onChange: (text) => {
        updateEditStats(text);
        scheduleTocUpdate();
        if (currentEditMode === 'split' || currentEditMode === 'preview') {
          scheduleLivePreviewUpdate();
        }
      },
      onSave: () => {
        if (btnSaveEdit) btnSaveEdit.click();
      },
      onCancel: () => {
        if (btnCancelEdit) btnCancelEdit.click();
      }
    });

    if (cmEditorInstance) {
      cmEditorInstance.setLivePreview(currentEditMode !== 'source');
    }
  }

  btnQuickEdit.addEventListener('click', () => {
    if (!currentNote) return;
    isEditing = true;
    if (noteContainer) noteContainer.style.display = 'none';
    if (tocPanel) tocPanel.style.display = isTocOpen ? 'flex' : 'none';
    noteContentWrapper.style.display = 'none';
    editContainer.style.display = 'flex';

    if (!cmEditorInstance) {
      initCodeMirror();
    }

    if (cmEditorInstance) {
      cmEditorInstance.setValue(currentNote.raw_content);
      cmEditorInstance.setTheme(currentTheme);
    }

    setEditMode(currentEditMode);
    updateEditStats(currentNote.raw_content);
    updateLivePreview();
    generateToc();

    setTimeout(() => {
      if (cmEditorInstance && currentEditMode !== 'preview') {
        cmEditorInstance.focus();
      }
    }, 20);
  });

  btnCancelEdit.addEventListener('click', () => {
    isEditing = false;
    editContainer.style.display = 'none';
    if (noteContainer) noteContainer.style.display = 'block';
    if (tocPanel) tocPanel.style.display = isTocOpen ? 'flex' : 'none';
    noteContentWrapper.style.display = 'block';
    generateToc();
  });

  let isSaving = false;
  btnSaveEdit.addEventListener('click', async () => {
    if (isSaving || !currentNote || !cmEditorInstance) return;
    isSaving = true;
    const savePath = currentNote.path;
    const newContent = cmEditorInstance.getValue();
    btnSaveEdit.textContent = window.I18n ? window.I18n.t('editor.saving') : 'Đang lưu...';

    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: savePath,
          content: newContent
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'saved') {
        btnSaveEdit.textContent = window.I18n ? window.I18n.t('editor.saved') : '✅ Đã lưu';
        // Cập nhật raw_content cục bộ ngay lập tức
        currentNote.raw_content = newContent;

        // Fetch lại note từ server để cập nhật parsed content, frontmatter, backlinks
        // nhưng KHÔNG thoát editor - chỉ cập nhật dữ liệu ngầm
        try {
          const updated = await fetchJson(`/api/note?path=${encodeURIComponent(savePath)}`);
          if (updated && currentNote && currentNote.path === savePath) {
            // Chỉ cập nhật dữ liệu, giữ nguyên trạng thái editing
            currentNote.content = updated.content;
            currentNote.frontmatter = updated.frontmatter;
            currentNote.tags = updated.tags;
            currentNote.backlinks = updated.backlinks;
            currentNote.mtime = updated.mtime;
            currentNote.raw_content = updated.raw_content;

            // Cập nhật HTML preview ngầm (cho khi user thoát edit sẽ thấy nội dung mới)
            if (noteBody) noteBody.innerHTML = renderMarkdown(updated.content, updated.path);
            // Cập nhật live preview nếu đang ở split/preview mode
            updateLivePreview();
            generateToc();
          }
        } catch (_ignore) {}

        // Đảm bảo editor vẫn hiển thị đúng sau save
        isEditing = true;
        if (noteContainer) noteContainer.style.display = 'none';
        if (noteContentWrapper) noteContentWrapper.style.display = 'none';
        if (editContainer) editContainer.style.display = 'flex';
        if (tocPanel) tocPanel.style.display = isTocOpen ? 'flex' : 'none';

        // Phục hồi focus cho CodeMirror để tiếp tục gõ bình thường
        if (cmEditorInstance && currentEditMode !== 'preview') {
          cmEditorInstance.focus();
        }

        setTimeout(() => {
          btnSaveEdit.textContent = window.I18n ? window.I18n.t('editor.save') : '💾 Lưu ghi chú';
        }, 800);
      } else {
        alert((window.I18n ? window.I18n.t('editor.saveError') : 'Lỗi lưu ghi chú: ') + (data.error || 'Unknown error'));
        btnSaveEdit.textContent = window.I18n ? window.I18n.t('editor.save') : '💾 Lưu ghi chú';
      }
    } catch (e) {
      alert((window.I18n ? window.I18n.t('editor.connectError') : 'Lỗi kết nối khi lưu: ') + e.message);
      btnSaveEdit.textContent = window.I18n ? window.I18n.t('editor.save') : '💾 Lưu ghi chú';
    } finally {
      isSaving = false;
    }
  });

  // Reset Note View Helper
  function resetNoteView() {
    currentNote = null;
    isEditing = false;
    if (emptyState) emptyState.style.display = 'block';
    if (noteContentWrapper) noteContentWrapper.style.display = 'none';
    generateToc();
    if (noteContainer) noteContainer.style.display = 'block';
    if (editContainer) editContainer.style.display = 'none';
    if (btnCopyMd) btnCopyMd.style.display = 'none';
    if (btnQuickEdit) btnQuickEdit.style.display = 'none';
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
      await Promise.all([
        loadTree(),
        loadRecent(),
        loadTags()
      ]);

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
      updateEditStats(cmEditorInstance.getValue());
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
  loadTags();

  // If URL has ?path=..., open it
  const urlParams = new URLSearchParams(window.location.search);
  const initialPath = urlParams.get('path');
  if (initialPath) {
    loadNote(initialPath);
  }
})();
