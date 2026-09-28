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

  // Apply theme
  document.documentElement.setAttribute('data-theme', currentTheme);

  // DOM Elements
  const btnTheme = document.getElementById('btn-theme');
  const btnTriggerSearch = document.getElementById('btn-trigger-search');
  const searchModalBackdrop = document.getElementById('search-modal-backdrop');
  const searchInput = document.getElementById('search-input');
  const searchResultsContainer = document.getElementById('search-results');
  const searchStatusText = document.getElementById('search-status-text');
  const btnCloseModal = document.getElementById('btn-close-modal');

  const paneTree = document.getElementById('pane-tree');
  const paneRecent = document.getElementById('pane-recent');
  const paneTags = document.getElementById('pane-tags');
  const tabs = document.querySelectorAll('.sidebar-tab');

  const treeContainer = document.getElementById('tree-container');
  const recentContainer = document.getElementById('recent-container');
  const tagsContainer = document.getElementById('tags-container');

  const noteBreadcrumb = document.getElementById('note-breadcrumb');
  const emptyState = document.getElementById('empty-state');
  const noteContentWrapper = document.getElementById('note-content-wrapper');
  const noteFrontmatter = document.getElementById('note-frontmatter');
  const noteBody = document.getElementById('note-body');
  const noteBacklinks = document.getElementById('note-backlinks');
  const backlinksList = document.getElementById('backlinks-list');
  const backlinksCountLabel = document.getElementById('backlinks-count-label');

  const btnCopyMd = document.getElementById('btn-copy-md');
  const btnQuickEdit = document.getElementById('btn-quick-edit');
  const btnOpenObsidian = document.getElementById('btn-open-obsidian');

  const editContainer = document.getElementById('edit-container');
  const editTextarea = document.getElementById('edit-textarea');
  const btnSaveEdit = document.getElementById('btn-save-edit');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');

  // Configure Marked.js
  if (typeof marked !== 'undefined') {
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

  // Pre-process and render Markdown with Obsidian specifics
  function renderMarkdown(rawMd, currentNotePath) {
    let md = rawMd;

    // 1. Process Obsidian Embeds: ![[image.png]] or ![[image.png|300]]
    md = md.replace(/!\[\[(.*?)\]\]/g, (match, inner) => {
      const parts = inner.split('|');
      const filename = parts[0].trim();
      const extra = parts[1] ? `width="${parts[1].trim()}"` : '';
      const isImg = /\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(filename);
      if (isImg) {
        return `<img src="/vault/${encodeURI(filename)}" alt="${filename}" ${extra} loading="lazy" onerror="this.onerror=null; this.src='/vault/images/${encodeURI(filename)}';" />`;
      }
      return `<div class="embed-box">📄 Đính kèm: <a href="/vault/${encodeURI(filename)}" target="_blank">${filename}</a></div>`;
    });

    // 2. Process Obsidian Wikilinks: [[Target]] or [[Target|Alias]]
    md = md.replace(/\[\[(.*?)\]\]/g, (match, inner) => {
      const parts = inner.split('|');
      const target = parts[0].trim();
      const alias = parts[1] ? parts[1].trim() : target;
      return `<span class="wikilink" data-target="${target}">${alias}</span>`;
    });

    // 3. Render HTML via Marked
    let html = typeof marked !== 'undefined' ? marked.parse(md) : md;

    // 4. Process Obsidian Callouts
    // e.g. <blockquote><p>[!NOTE] Title ...
    html = html.replace(
      /<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|DANGER|TODO|FAQ|SUMMARY|EXAMPLE|QUOTE)\]\s*(.*?)<\/p>(.*?)<\/blockquote>/gis,
      (match, type, title, body) => {
        const typeLower = type.toLowerCase();
        const calloutTitle = title ? title.trim() : type.toUpperCase();
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

  // Load Note
  async function loadNote(path) {
    const data = await fetchJson(`/api/note?path=${encodeURIComponent(path)}`);
    if (!data) {
      alert('Không thể tải ghi chú: ' + path);
      return;
    }

    currentNote = data;
    isEditing = false;

    // Update UI elements
    emptyState.style.display = 'none';
    noteContentWrapper.style.display = 'block';
    editContainer.style.display = 'none';

    btnCopyMd.style.display = 'inline-flex';
    btnQuickEdit.style.display = 'inline-flex';
    btnOpenObsidian.style.display = 'inline-flex';

    // Breadcrumb
    const folderParts = (data.folder && data.folder !== '/') ? data.folder.split('/') : [];
    let breadcrumbHtml = folderParts.map(p => `<span>${p}</span> &gt; `).join('');
    breadcrumbHtml += `<span class="breadcrumb-title">${data.title}</span>`;
    noteBreadcrumb.innerHTML = breadcrumbHtml;

    // Frontmatter box
    const hasFrontmatter = Object.keys(data.frontmatter || {}).length > 0 || (data.tags && data.tags.length > 0);
    if (hasFrontmatter) {
      let fmHtml = '';
      if (data.tags && data.tags.length > 0) {
        fmHtml += `
          <div class="frontmatter-row">
            <span class="frontmatter-key">Tags:</span>
            <div>${data.tags.map(t => `<span class="tag-pill" data-tag="${t}">#${t}</span>`).join('')}</div>
          </div>
        `;
      }
      for (const [k, v] of Object.entries(data.frontmatter || {})) {
        if (k === 'tags' || k === 'tag') continue;
        const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
        fmHtml += `
          <div class="frontmatter-row">
            <span class="frontmatter-key">${k}:</span>
            <span>${valStr}</span>
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

  // Load Folder Tree
  async function loadTree() {
    const tree = await fetchJson('/api/tree');
    if (!tree) return;

    function renderNode(node) {
      if (node.type === 'file') {
        return `
          <div class="file-item" data-path="${node.path}">
            <span class="item-icon">📄</span>
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
            <span class="item-icon">📁</span>
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
        <span class="item-icon">📄</span>
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
        <span class="item-icon">🏷️</span>
        <span>#${t.tag}</span>
        <span class="item-badge">${t.count}</span>
      </div>
    `).join('');
  }

  // Quick Switcher Search
  async function doSearch(query) {
    searchStatusText.textContent = 'Đang tìm kiếm...';
    const data = await fetchJson(`/api/search?q=${encodeURIComponent(query)}&limit=40`);
    if (!data || !data.results) {
      searchStatusText.textContent = 'Lỗi tìm kiếm';
      return;
    }

    searchResults = data.results;
    selectedIndex = 0;
    searchStatusText.textContent = `${searchResults.length} kết quả`;

    if (searchResults.length === 0) {
      searchResultsContainer.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted);">
          Không tìm thấy ghi chú nào khớp với từ khóa
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
          <span class="search-item-title">${r.title}</span>
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

  function openSearchModal(initialQuery = '') {
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
  btnTriggerSearch.addEventListener('click', () => openSearchModal());
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
    if (e.key === 'ArrowDown') {
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

  // Global Shortcuts
  window.addEventListener('keydown', (e) => {
    // Ctrl+K or Ctrl+O -> Search
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'o')) {
      e.preventDefault();
      openSearchModal();
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

  // Delegated clicks for note items in sidebar
  document.addEventListener('click', (e) => {
    // File in tree or recent
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

    // Wikilink click inside note
    const wikilinkEl = e.target.closest('.wikilink');
    if (wikilinkEl && wikilinkEl.dataset.target) {
      const target = wikilinkEl.dataset.target;
      fetchJson(`/api/resolve?target=${encodeURIComponent(target)}`).then(res => {
        if (res && res.resolved_path) {
          loadNote(res.resolved_path);
        } else {
          alert(`Không tìm thấy ghi chú mục tiêu: [[${target}]]`);
        }
      });
      return;
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

  // Quick Edit Mode
  btnQuickEdit.addEventListener('click', () => {
    if (!currentNote) return;
    isEditing = true;
    noteContentWrapper.style.display = 'none';
    editContainer.style.display = 'flex';
    editTextarea.value = currentNote.raw_content;
    editTextarea.focus();
  });

  btnCancelEdit.addEventListener('click', () => {
    isEditing = false;
    editContainer.style.display = 'none';
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
