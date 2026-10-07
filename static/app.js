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

  const editContainer = document.getElementById('edit-container');
  const editTextarea = document.getElementById('edit-textarea');
  const btnSaveEdit = document.getElementById('btn-save-edit');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');

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
      alert('Không thể tải ghi chú: ' + path);
      return;
    }

    currentNote = data;
    isEditing = false;

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

    // Backlinks
    if (data.backlinks && data.backlinks.length > 0) {
      backlinksCountLabel.textContent = `Liên kết ngược (${data.backlinks.length} ghi chú tham chiếu tới đây)`;
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

  // Load Recent Notes
  async function loadRecent() {
    const data = await fetchJson('/api/search?limit=30');
    if (!data || !data.results) return;

    recentContainer.innerHTML = data.results.map(r => `
      <div class="recent-item" data-path="${r.path}">
        ${SVG_NOTE}
        <div style="overflow: hidden; text-overflow: ellipsis;">
          <div>${r.title}</div>
          <div style="font-size: 11px; opacity: 0.6;">${r.folder}</div>
        </div>
      </div>
    `).join('');
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
      searchInput.placeholder = 'Tìm theo tiêu đề ghi chú... (Ctrl K)';
    } else {
      searchInput.placeholder = 'Tìm theo nội dung markdown... (Ctrl Shift F)';
    }

    if (searchModalBackdrop.classList.contains('active')) {
      doSearch(searchInput.value);
    }
  }

  // Quick Switcher Search
  async function doSearch(query) {
    searchStatusText.textContent = 'Đang tìm kiếm...';
    const mode = currentSearchMode;
    const data = await fetchJson(`/api/search?q=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}&limit=40`);
    if (!data || !data.results) {
      searchStatusText.textContent = 'Lỗi tìm kiếm';
      return;
    }

    searchResults = data.results;
    selectedIndex = 0;
    const modeLabel = mode === 'title' ? 'kết quả tiêu đề' : 'kết quả nội dung';
    searchStatusText.textContent = `${searchResults.length} ${modeLabel}`;

    if (searchResults.length === 0) {
      searchResultsContainer.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted);">
          Không tìm thấy ghi chú nào khớp (${mode === 'title' ? 'theo tiêu đề' : 'trong nội dung'})
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
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      if (isEditing) {
        e.preventDefault();
        btnSaveEdit.click();
      }
    }
    // Escape
    if (e.key === 'Escape') {
      if (searchModalBackdrop.classList.contains('active')) {
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
        btnCopyLink.innerHTML = '<span>Đã chép!</span>';
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

      btnCopyContext.innerHTML = `🌐 Copy Context (Cấp ${depth})`;
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
      btnCopyMd.textContent = '✅ Đã copy!';
      setTimeout(() => btnCopyMd.textContent = originalText, 1500);
    });
  });

  btnOpenObsidian.addEventListener('click', () => {
    if (!currentNote) return;
    // Obsidian protocol: obsidian://open?vault=obsidian&file=path
    // Vault folder name is 'obsidian'
    const vaultName = 'obsidian';
    const filePath = encodeURIComponent(currentNote.path.replace(/\.md$/, ''));
    const uri = `obsidian://open?vault=${vaultName}&file=${filePath}`;
    window.location.href = uri;
  });

  // Quick Edit Mode & Auto-resizing Textarea
  function autoResizeTextarea() {
    if (!editTextarea) return;
    editTextarea.style.height = 'auto';
    const newHeight = Math.max(380, editTextarea.scrollHeight);
    editTextarea.style.height = newHeight + 'px';
  }

  if (editTextarea) {
    editTextarea.addEventListener('input', autoResizeTextarea);
  }

  btnQuickEdit.addEventListener('click', () => {
    if (!currentNote) return;
    isEditing = true;
    if (noteContainer) noteContainer.style.display = 'none';
    noteContentWrapper.style.display = 'none';
    editContainer.style.display = 'flex';
    editTextarea.value = currentNote.raw_content;
    setTimeout(() => {
      autoResizeTextarea();
      editTextarea.focus();
    }, 10);
  });

  btnCancelEdit.addEventListener('click', () => {
    isEditing = false;
    editContainer.style.display = 'none';
    if (noteContainer) noteContainer.style.display = 'block';
    noteContentWrapper.style.display = 'block';
  });

  btnSaveEdit.addEventListener('click', async () => {
    if (!currentNote) return;
    const newContent = editTextarea.value;
    btnSaveEdit.textContent = 'Đang lưu...';

    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: currentNote.path,
          content: newContent
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'saved') {
        btnSaveEdit.textContent = '✅ Đã lưu';
        setTimeout(() => {
          btnSaveEdit.textContent = '💾 Lưu ghi chú';
          loadNote(currentNote.path);
        }, 600);
      } else {
        alert('Lỗi lưu ghi chú: ' + (data.error || 'Unknown error'));
        btnSaveEdit.textContent = '💾 Lưu ghi chú';
      }
    } catch (e) {
      alert('Lỗi kết nối khi lưu: ' + e.message);
      btnSaveEdit.textContent = '💾 Lưu ghi chú';
    }
  });

  // Initial Load
  loadTree();
  loadRecent();
  loadTags();

  // If URL has ?path=..., open it
  const urlParams = new URLSearchParams(window.location.search);
  const initialPath = urlParams.get('path');
  if (initialPath) {
    loadNote(initialPath);
  }
})();
