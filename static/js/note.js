/**
 * Obsidian QuickView - Note Viewer Controller
 * Handles note loading, rendering, breadcrumbs, frontmatter, backlinks, and actions.
 */

import { eventBus } from './events.js';
import { appState } from './state.js';
import { ApiClient } from './api.js';
import { renderMarkdown, loadKatex } from './markdown.js';

export class NoteViewerController {
  constructor() {
    this.container = document.getElementById('note-container');
    this.emptyState = document.getElementById('empty-state');
    this.contentWrapper = document.getElementById('note-content-wrapper');
    this.breadcrumb = document.getElementById('note-breadcrumb');
    this.frontmatter = document.getElementById('note-frontmatter');
    this.body = document.getElementById('note-body');
    this.backlinksSection = document.getElementById('note-backlinks');
    this.backlinksList = document.getElementById('backlinks-list');
    this.backlinksCountLabel = document.getElementById('backlinks-count-label');

    // Buttons
    this.btnCopyMd = document.getElementById('btn-copy-md');
    this.btnOpenObsidian = document.getElementById('btn-open-obsidian');
    this.btnSyncVault = document.getElementById('btn-sync-vault');
    this.btnCopyContext = document.getElementById('btn-copy-context');
    this.btnContextMenuTrigger = document.getElementById('btn-context-menu-trigger');
    this.contextDropdownMenu = document.getElementById('context-dropdown-menu');
    this.contextDropdownWrapper = document.getElementById('context-dropdown-wrapper');
    this.selectedContextDepth = 1;

    this.btnHistoryBack = document.getElementById('btn-history-back');
    this.btnHistoryForward = document.getElementById('btn-history-forward');

    this.init();
  }

  init() {
    if (this.btnCopyMd) {
      this.btnCopyMd.addEventListener('click', () => this.copyMarkdown());
    }

    if (this.btnOpenObsidian) {
      this.btnOpenObsidian.addEventListener('click', () => this.openObsidian());
    }

    if (this.btnSyncVault) {
      this.btnSyncVault.addEventListener('click', () => this.syncVault());
    }

    if (this.btnCopyContext) {
      this.btnCopyContext.addEventListener('click', () => this.copyContext());
    }

    if (this.btnContextMenuTrigger) {
      this.btnContextMenuTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.contextDropdownMenu) {
          this.contextDropdownMenu.classList.toggle('show');
        }
      });
    }

    document.querySelectorAll('#context-dropdown-menu .dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const depth = parseInt(item.dataset.depth, 10) || 1;
        this.selectedContextDepth = depth;

        document.querySelectorAll('#context-dropdown-menu .dropdown-item').forEach(el => {
          const isCur = parseInt(el.dataset.depth, 10) === depth;
          el.classList.toggle('active', isCur);
          const chk = el.querySelector('.depth-check');
          if (chk) chk.textContent = isCur ? '✓' : '';
        });

        this.updateContextBtnText();
        if (this.contextDropdownMenu) this.contextDropdownMenu.classList.remove('show');
      });
    });

    document.addEventListener('click', () => {
      if (this.contextDropdownMenu) this.contextDropdownMenu.classList.remove('show');
    });

    // History buttons
    if (this.btnHistoryBack) {
      this.btnHistoryBack.addEventListener('click', () => {
        const path = appState.goBack();
        if (path) this.loadNote(path, false);
      });
    }

    if (this.btnHistoryForward) {
      this.btnHistoryForward.addEventListener('click', () => {
        const path = appState.goForward();
        if (path) this.loadNote(path, false);
      });
    }

    eventBus.on('history:changed', ({ canBack, canForward }) => {
      if (this.btnHistoryBack) this.btnHistoryBack.disabled = !canBack;
      if (this.btnHistoryForward) this.btnHistoryForward.disabled = !canForward;
    });

    eventBus.on('note:open', ({ path }) => {
      this.loadNote(path);
    });

    // Delegated clicks inside note container
    document.addEventListener('click', (e) => this.handleDelegatedClick(e));
  }

  updateContextBtnText() {
    if (!this.btnCopyContext) return;
    const label = window.I18n
      ? window.I18n.t('nav.copyContext', { depth: this.selectedContextDepth })
      : `Context (${this.selectedContextDepth})`;
    this.btnCopyContext.innerHTML = `🌐 ${label}`;
  }

  async loadNote(path, pushHistory = true) {
    if (!path.toLowerCase().endsWith('.md')) {
      ApiClient.openAttachment(path);
      return;
    }

    try {
      const data = await ApiClient.fetchNote(path);
      if (!data) return;

      appState.setCurrentNote(data);
      appState.setIsEditing(false);

      if (data.content && data.content.includes('$')) {
        loadKatex();
      }

      if (pushHistory) {
        appState.pushHistory(data.path);
      }

      this.renderNote(data);
    } catch (e) {
      alert((window.I18n ? window.I18n.t('app.error') : 'Lỗi') + ': ' + path);
    }
  }

  renderNote(data) {
    if (this.emptyState) this.emptyState.style.display = 'none';
    if (this.contentWrapper) this.contentWrapper.style.display = 'block';
    if (this.container) this.container.style.display = 'block';

    const editContainer = document.getElementById('edit-container');
    if (editContainer) editContainer.style.display = 'none';

    if (this.btnCopyMd) this.btnCopyMd.style.display = 'inline-flex';
    const btnQuickEdit = document.getElementById('btn-quick-edit');
    if (btnQuickEdit) btnQuickEdit.style.display = 'inline-flex';
    if (this.btnOpenObsidian) this.btnOpenObsidian.style.display = 'inline-flex';
    if (this.contextDropdownWrapper) this.contextDropdownWrapper.style.display = 'inline-flex';

    // Breadcrumbs
    let breadcrumbHtml = '';
    if (appState.historyIndex > 0) {
      const prevPath = appState.noteHistory[appState.historyIndex - 1];
      const prevTitle = prevPath.split(/[/\\]/).pop().replace(/\.md$/, '');
      breadcrumbHtml += `<a class="breadcrumb-crumb" data-path="${prevPath}" title="Quay lại ${prevTitle}">${prevTitle}</a>`;
      breadcrumbHtml += `<span class="breadcrumb-separator">›</span>`;
    } else {
      const folderParts = (data.folder && data.folder !== '/') ? data.folder.split('/') : [];
      if (folderParts.length > 0) {
        breadcrumbHtml += folderParts.map(p => `<span>${p}</span>`).join('<span class="breadcrumb-separator">›</span>');
        breadcrumbHtml += `<span class="breadcrumb-separator">›</span>`;
      }
    }
    breadcrumbHtml += `<span class="breadcrumb-title" title="${data.title}">${data.title}</span>`;
    if (this.breadcrumb) this.breadcrumb.innerHTML = breadcrumbHtml;

    // Frontmatter
    const hasFrontmatter = Object.keys(data.frontmatter || {}).length > 0 || (data.tags && data.tags.length > 0);
    if (hasFrontmatter && this.frontmatter) {
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
        const valHtml = this.formatFrontmatterValue(k, v);
        fmHtml += `
          <div class="frontmatter-row">
            <span class="frontmatter-key">${k}:</span>
            <div class="frontmatter-val">${valHtml}</div>
          </div>
        `;
      }
      this.frontmatter.innerHTML = fmHtml;
      this.frontmatter.style.display = fmHtml ? 'block' : 'none';
    } else if (this.frontmatter) {
      this.frontmatter.style.display = 'none';
    }

    // Body
    if (this.body) {
      this.body.innerHTML = renderMarkdown(data.content, data.path);
    }

    // Backlinks
    if (data.backlinks && data.backlinks.length > 0 && this.backlinksSection && this.backlinksList) {
      if (this.backlinksCountLabel) {
        this.backlinksCountLabel.textContent = window.I18n
          ? window.I18n.t('note.backlinksCount', { count: data.backlinks.length })
          : `Liên kết ngược (${data.backlinks.length} ghi chú tham chiếu tới đây)`;
      }
      this.backlinksList.innerHTML = data.backlinks.map(b => `
        <div class="backlink-card" data-path="${b.path}">
          <span>📝 <strong>${b.title}</strong></span>
          <span style="font-size: 11px; opacity: 0.7;">${b.folder}</span>
        </div>
      `).join('');
      this.backlinksSection.style.display = 'block';
    } else if (this.backlinksSection) {
      this.backlinksSection.style.display = 'none';
    }

    if (this.container) this.container.scrollTop = 0;
    eventBus.emit('note:rendered', data);
  }

  formatFrontmatterValue(key, val) {
    if (val === null || val === undefined) return '';
    const rawStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
    const isShareLink = String(key).toLowerCase() === 'share_link';
    const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;

    if (isShareLink || urlRegex.test(rawStr)) {
      return rawStr.replace(urlRegex, (url) => {
        return `<span class="frontmatter-link-wrapper">` +
          `<a href="${url}" target="_blank" rel="noopener noreferrer" class="frontmatter-url" title="Mở liên kết">${url}</a>` +
          `<button type="button" class="btn-copy-link" data-url="${url}" title="Sao chép liên kết">` +
            `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>` +
            `<span>Copy</span>` +
          `</button>` +
        `</span>`;
      });
    }

    const div = document.createElement('div');
    div.textContent = rawStr;
    return div.innerHTML;
  }

  copyMarkdown() {
    if (!appState.currentNote) return;
    navigator.clipboard.writeText(appState.currentNote.raw_content).then(() => {
      if (!this.btnCopyMd) return;
      const originalText = this.btnCopyMd.textContent;
      this.btnCopyMd.textContent = window.I18n ? ('✅ ' + window.I18n.t('app.copied')) : '✅ Đã copy!';
      setTimeout(() => this.btnCopyMd.textContent = originalText, 1500);
    });
  }

  openObsidian() {
    if (!appState.currentNote) return;
    const vaultName = encodeURIComponent(appState.currentVaultName || 'obsidian');
    const filePath = encodeURIComponent(appState.currentNote.path.replace(/\.md$/, ''));
    const uri = `obsidian://open?vault=${vaultName}&file=${filePath}`;
    window.location.href = uri;
  }

  async copyContext() {
    if (!appState.currentNote || !this.btnCopyContext) return;
    const origHtml = this.btnCopyContext.innerHTML;
    this.btnCopyContext.innerHTML = '⏳ Đang tổng hợp context...';
    this.btnCopyContext.disabled = true;

    try {
      const res = await ApiClient.fetchContext(appState.currentNote.path, this.selectedContextDepth);
      if (!res || !res.context_markdown) {
        alert('Không thể tổng hợp context cho ghi chú này.');
        this.btnCopyContext.innerHTML = origHtml;
        this.btnCopyContext.disabled = false;
        return;
      }

      await navigator.clipboard.writeText(res.context_markdown);
      this.btnCopyContext.innerHTML = `✅ Đã copy (${res.total_notes} notes)!`;
      setTimeout(() => {
        this.btnCopyContext.innerHTML = origHtml;
        this.btnCopyContext.disabled = false;
      }, 2000);
    } catch (err) {
      alert('Lỗi khi sao chép context: ' + err.message);
      this.btnCopyContext.innerHTML = origHtml;
      this.btnCopyContext.disabled = false;
    }
  }

  async syncVault() {
    if (!this.btnSyncVault) return;
    const origHtml = this.btnSyncVault.innerHTML;
    this.btnSyncVault.disabled = true;
    this.btnSyncVault.innerHTML = `
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
      const data = await ApiClient.syncGit();
      if (data.status === 'ok') {
        this.btnSyncVault.innerHTML = `<span class="btn-text">✅ Đã push (${data.files_changed} files)!</span>`;
        alert(`✅ ${data.message}\nCommit: ${data.commit_message || 'HEAD'}`);
      } else if (data.status === 'noop') {
        this.btnSyncVault.innerHTML = `<span class="btn-text">👌 Đã đồng bộ</span>`;
        alert(`👌 ${data.message}`);
      } else {
        this.btnSyncVault.innerHTML = `<span class="btn-text">❌ Lỗi push</span>`;
        alert(`❌ Đồng bộ thất bại:\n${data.message || 'Lỗi không xác định'}`);
      }
    } catch (err) {
      this.btnSyncVault.innerHTML = `<span class="btn-text">❌ Lỗi kết nối</span>`;
      alert(`❌ Lỗi kết nối server khi push vault: ${err.message}`);
    } finally {
      setTimeout(() => {
        this.btnSyncVault.innerHTML = origHtml;
        this.btnSyncVault.disabled = false;
      }, 3000);
    }
  }

  handleDelegatedClick(e) {
    // Copy link button inside frontmatter
    const copyLinkBtn = e.target.closest('.btn-copy-link');
    if (copyLinkBtn) {
      e.preventDefault();
      const url = copyLinkBtn.dataset.url;
      if (url) {
        navigator.clipboard.writeText(url).then(() => {
          const span = copyLinkBtn.querySelector('span');
          if (span) {
            const old = span.textContent;
            span.textContent = '✓ Copied';
            setTimeout(() => span.textContent = old, 1500);
          }
        });
      }
      return;
    }

    // Breadcrumb navigation click
    const crumbEl = e.target.closest('.breadcrumb-crumb');
    if (crumbEl && crumbEl.dataset.path) {
      e.preventDefault();
      this.loadNote(crumbEl.dataset.path);
      return;
    }

    // File in tree or recent or backlink
    const fileEl = e.target.closest('.file-item, .recent-item, .backlink-card');
    if (fileEl && fileEl.dataset.path) {
      this.loadNote(fileEl.dataset.path);
      return;
    }

    // Tag click
    const tagEl = e.target.closest('.tag-item, .tag-pill');
    if (tagEl && tagEl.dataset.tag) {
      eventBus.emit('search:tag', tagEl.dataset.tag);
      return;
    }

    // Image click
    const imgEl = e.target.closest('.note-content img');
    if (imgEl && !imgEl.closest('a')) {
      const src = imgEl.getAttribute('src');
      if (src) {
        window.open(src, '_blank');
        return;
      }
    }

    // Embed box / attachment
    const embedLink = e.target.closest('.embed-box a, .image-embed-link, .wikilink-attachment');
    if (embedLink) {
      e.preventDefault();
      const target = embedLink.dataset.target || embedLink.getAttribute('href');
      if (target) {
        ApiClient.openAttachment(target.replace(/^\/vault\//, ''));
      }
      return;
    }

    // Wikilink click
    const wikilinkEl = e.target.closest('.wikilink');
    if (wikilinkEl && wikilinkEl.dataset.target) {
      e.preventDefault();
      const target = wikilinkEl.dataset.target;
      ApiClient.resolveTarget(target).then(res => {
        if (res && res.resolved_path) {
          if (res.is_attachment || !res.resolved_path.toLowerCase().endsWith('.md')) {
            ApiClient.openAttachment(res.resolved_path);
          } else {
            this.loadNote(res.resolved_path);
          }
        } else {
          alert(`Không tìm thấy ghi chú hoặc tài liệu mục tiêu: [[${target}]]`);
        }
      });
      return;
    }
  }
}
