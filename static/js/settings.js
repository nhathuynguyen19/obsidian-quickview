/**
 * Obsidian QuickView - Settings Modal Controller
 * Manages Language selection, Theme toggle, Hotkeys mapping, and Custom Snippets.
 */

import { eventBus } from './events.js';
import { appState } from './state.js';
import { hotkeysManager, HOTKEY_ACTIONS, DEFAULT_HOTKEYS } from './hotkeys.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class SettingsModalController {
  constructor() {
    this.btnSettings = document.getElementById('btn-settings');
    this.btnTheme = document.getElementById('btn-theme');
    this.backdrop = document.getElementById('settings-modal-backdrop');
    this.btnClose = document.getElementById('btn-close-settings-modal');

    this.tabBtnLanguage = document.getElementById('settings-tab-btn-language');
    this.tabBtnHotkeys = document.getElementById('settings-tab-btn-hotkeys');
    this.paneLanguage = document.getElementById('settings-pane-language');
    this.paneHotkeys = document.getElementById('settings-pane-hotkeys');

    this.subtabBtnButtons = document.getElementById('hotkeys-subtab-btn-buttons');
    this.subtabBtnSnippets = document.getElementById('hotkeys-subtab-btn-snippets');
    this.subpaneButtons = document.getElementById('hotkeys-subpane-buttons');
    this.subpaneSnippets = document.getElementById('hotkeys-subpane-snippets');

    this.buttonsList = document.getElementById('hotkeys-buttons-list');
    this.snippetsList = document.getElementById('hotkeys-snippets-list');
    this.searchInput = document.getElementById('hotkeys-search-input');
    this.btnResetAll = document.getElementById('btn-reset-all-hotkeys');

    this.conflictAlert = document.getElementById('hotkeys-conflict-alert');
    this.conflictText = document.getElementById('hotkeys-conflict-text');
    this.btnDismissConflict = document.getElementById('btn-dismiss-conflict');

    // Snippet dialog elements
    this.btnAddNewSnippet = document.getElementById('btn-add-new-snippet');
    this.snippetDialog = document.getElementById('snippet-dialog-backdrop');
    this.snippetTitle = document.getElementById('snippet-dialog-title');
    this.snippetName = document.getElementById('snippet-input-name');
    this.snippetText = document.getElementById('snippet-input-text');
    this.btnCloseSnippet = document.getElementById('btn-close-snippet-dialog');
    this.btnCancelSnippet = document.getElementById('btn-cancel-snippet-dialog');
    this.btnSaveSnippet = document.getElementById('btn-save-snippet-dialog');

    this.editingSnippetId = null;

    this.init();
  }

  init() {
    if (this.btnTheme) {
      this.btnTheme.addEventListener('click', () => {
        appState.toggleTheme();
      });
    }

    if (this.btnSettings) {
      this.btnSettings.addEventListener('click', () => this.open());
    }

    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.close());
    }

    if (this.backdrop) {
      this.backdrop.addEventListener('click', (e) => {
        if (e.target === this.backdrop) this.close();
      });
    }

    // Language cards
    document.querySelectorAll('.settings-lang-card').forEach(card => {
      card.addEventListener('click', async () => {
        const lang = card.dataset.lang;
        if (lang && window.I18n && window.I18n.getLanguage() !== lang) {
          await window.I18n.setLanguage(lang);
          this.updateLanguageUI();
        }
      });
    });

    // Settings tabs
    const navTabs = document.querySelectorAll('.settings-nav-tab');
    navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        navTabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-tab-pane').forEach(p => p.style.display = 'none');
        tab.classList.add('active');
        const targetPane = document.getElementById(`settings-pane-${tab.dataset.tab}`);
        if (targetPane) targetPane.style.display = 'block';
        if (tab.dataset.tab === 'hotkeys') {
          this.renderHotkeys();
          this.renderSnippets();
        }
      });
    });

    // Hotkey subtabs
    if (this.subtabBtnButtons) {
      this.subtabBtnButtons.addEventListener('click', () => this.setSubtab('buttons'));
    }
    if (this.subtabBtnSnippets) {
      this.subtabBtnSnippets.addEventListener('click', () => this.setSubtab('snippets'));
    }

    if (this.btnResetAll) {
      this.btnResetAll.addEventListener('click', () => {
        for (const k of Object.keys(DEFAULT_HOTKEYS)) {
          hotkeysManager.customHotkeys[k] = [...DEFAULT_HOTKEYS[k]];
        }
        hotkeysManager.saveStoredHotkeys();
        this.renderHotkeys();
        this.hideConflictAlert();
      });
    }

    if (this.btnDismissConflict) {
      this.btnDismissConflict.addEventListener('click', () => this.hideConflictAlert());
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => this.applyFilter());
    }

    // Delegated actions inside hotkeys pane
    if (this.paneHotkeys) {
      this.paneHotkeys.addEventListener('click', (e) => this.handleHotkeysPaneClick(e));
    }

    // Snippet dialog events
    if (this.btnAddNewSnippet) {
      this.btnAddNewSnippet.addEventListener('click', () => this.openNewSnippetDialog());
    }
    if (this.btnCloseSnippet) {
      this.btnCloseSnippet.addEventListener('click', () => this.closeSnippetDialog());
    }
    if (this.btnCancelSnippet) {
      this.btnCancelSnippet.addEventListener('click', () => this.closeSnippetDialog());
    }
    if (this.btnSaveSnippet) {
      this.btnSaveSnippet.addEventListener('click', () => this.saveSnippetFromDialog());
    }
    if (this.snippetDialog) {
      this.snippetDialog.addEventListener('click', (e) => {
        if (e.target === this.snippetDialog) this.closeSnippetDialog();
      });
    }

    // Keydown listener for hotkey recording
    window.addEventListener('keydown', (e) => this.handleRecordingKeyDown(e), true);
  }

  updateLanguageUI() {
    const currentLang = window.I18n ? window.I18n.getLanguage() : (localStorage.getItem('obs_lang') || 'vi');
    document.querySelectorAll('.settings-lang-card').forEach(card => {
      const lang = card.dataset.lang;
      const radio = card.querySelector('input[type="radio"]');
      const isCur = (lang === currentLang);
      card.classList.toggle('active', isCur);
      if (radio) radio.checked = isCur;
    });
  }

  open() {
    if (!this.backdrop) return;
    this.updateLanguageUI();
    this.renderHotkeys();
    this.renderSnippets();
    this.backdrop.classList.add('active');
    eventBus.emit('settings:opened');
  }

  close() {
    if (!this.backdrop) return;
    hotkeysManager.activeRecording = null;
    this.hideConflictAlert();
    this.backdrop.classList.remove('active');
  }

  setSubtab(subtab) {
    if (subtab === 'buttons') {
      if (this.subtabBtnButtons) this.subtabBtnButtons.classList.add('active');
      if (this.subtabBtnSnippets) this.subtabBtnSnippets.classList.remove('active');
      if (this.subpaneButtons) this.subpaneButtons.style.display = 'block';
      if (this.subpaneSnippets) this.subpaneSnippets.style.display = 'none';
      if (this.btnAddNewSnippet) this.btnAddNewSnippet.style.display = 'none';
    } else {
      if (this.subtabBtnSnippets) this.subtabBtnSnippets.classList.add('active');
      if (this.subtabBtnButtons) this.subtabBtnButtons.classList.remove('active');
      if (this.subpaneSnippets) this.subpaneSnippets.style.display = 'block';
      if (this.subpaneButtons) this.subpaneButtons.style.display = 'none';
      if (this.btnAddNewSnippet) this.btnAddNewSnippet.style.display = 'inline-flex';
    }
    this.applyFilter();
  }

  showConflictAlert(message) {
    if (this.conflictAlert && this.conflictText) {
      this.conflictText.textContent = message;
      this.conflictAlert.style.display = 'flex';
    }
  }

  hideConflictAlert() {
    if (this.conflictAlert) {
      this.conflictAlert.style.display = 'none';
    }
  }

  renderBadgesHtml(type, id, hotkeysArray) {
    let html = '';
    if (Array.isArray(hotkeysArray)) {
      for (const combo of hotkeysArray) {
        html += `
          <kbd class="hotkey-badge">
            <span>${escapeHtml(combo)}</span>
            <button type="button" class="btn-remove-key" data-type="${type}" data-id="${id}" data-key="${escapeHtml(combo)}" title="Xóa">✕</button>
          </kbd>
        `;
      }
    }
    const addBtnText = window.I18n ? window.I18n.t('settings.hotkeysAddBtn') : '+ Thêm phím';
    html += `
      <button type="button" class="btn-add-hotkey" data-type="${type}" data-id="${id}">
        ${addBtnText}
      </button>
    `;
    return html;
  }

  renderHotkeys() {
    if (!this.buttonsList) return;
    let html = '';
    for (const act of HOTKEY_ACTIONS) {
      const name = window.I18n ? window.I18n.t('hotkeys.' + act.id) : act.id;
      const desc = window.I18n ? window.I18n.t('hotkeys.' + act.id + 'Desc') : '';
      const resetText = window.I18n ? window.I18n.t('settings.hotkeysResetBtn') : 'Mặc định';
      const keys = hotkeysManager.customHotkeys[act.id] || [];

      html += `
        <div class="hotkey-row" data-id="${act.id}" data-type="button">
          <div class="hotkey-info">
            <span class="hotkey-name">${escapeHtml(name)}</span>
            ${desc ? `<span class="hotkey-desc">${escapeHtml(desc)}</span>` : ''}
          </div>
          <div class="hotkey-controls">
            <div class="hotkey-badges-wrap" id="badges-button-${act.id}">
              ${this.renderBadgesHtml('button', act.id, keys)}
            </div>
            <button type="button" class="btn-reset-hotkey" data-id="${act.id}" title="${resetText}">
              ${resetText}
            </button>
          </div>
        </div>
      `;
    }
    this.buttonsList.innerHTML = html;
    this.applyFilter();
  }

  renderSnippets() {
    if (!this.snippetsList) return;
    if (!hotkeysManager.customSnippets || hotkeysManager.customSnippets.length === 0) {
      const emptyText = window.I18n
        ? window.I18n.t('settings.snippetEmpty')
        : 'Chưa có snippet nào. Bấm "+ Tạo Snippet mới" để thêm.';
      this.snippetsList.innerHTML = `
        <div style="text-align: center; padding: 36px 12px; color: var(--text-muted); font-size: 13px;">
          ${emptyText}
        </div>
      `;
      return;
    }

    let html = '';
    for (const snip of hotkeysManager.customSnippets) {
      const keys = snip.hotkeys || [];
      const tooltipText = window.I18n
        ? window.I18n.t('settings.snippetInsertTooltip', { text: snip.text })
        : `Chèn chuỗi: "${snip.text}"`;

      html += `
        <div class="hotkey-row" data-id="${snip.id}" data-type="snippet">
          <div class="hotkey-info">
            <div class="snippet-title-row">
              <span class="hotkey-name">${escapeHtml(snip.name)}</span>
              <code class="snippet-code-badge" title="${escapeHtml(tooltipText)}">${escapeHtml(snip.text)}</code>
            </div>
          </div>
          <div class="hotkey-controls">
            <div class="hotkey-badges-wrap" id="badges-snippet-${snip.id}">
              ${this.renderBadgesHtml('snippet', snip.id, keys)}
            </div>
            <button type="button" class="btn btn-icon btn-sm btn-edit-snippet" data-id="${snip.id}" title="Sửa Snippet">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button type="button" class="btn btn-icon btn-sm btn-delete-snippet" data-id="${snip.id}" title="Xóa Snippet">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }
    this.snippetsList.innerHTML = html;
    this.applyFilter();
  }

  applyFilter() {
    const q = this.searchInput ? this.searchInput.value.toLowerCase().trim() : '';
    document.querySelectorAll('.hotkey-row').forEach(row => {
      if (!q) {
        row.style.display = 'flex';
        return;
      }
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(q) ? 'flex' : 'none';
    });
  }

  startRecording(type, id) {
    this.hideConflictAlert();
    hotkeysManager.activeRecording = { type, id };
    const containerId = type === 'button' ? `badges-button-${id}` : `badges-snippet-${id}`;
    const container = document.getElementById(containerId);
    if (!container) return;

    const recordingMsg = window.I18n ? window.I18n.t('settings.hotkeysRecording') : 'Bấm tổ hợp phím... (Esc để hủy)';
    const existingBadges = type === 'button'
      ? (hotkeysManager.customHotkeys[id] || [])
      : ((hotkeysManager.customSnippets.find(s => s.id === id) || {}).hotkeys || []);

    let html = '';
    for (const combo of existingBadges) {
      html += `
        <kbd class="hotkey-badge">
          <span>${escapeHtml(combo)}</span>
          <button type="button" class="btn-remove-key" data-type="${type}" data-id="${id}" data-key="${escapeHtml(combo)}" title="Xóa">✕</button>
        </kbd>
      `;
    }
    html += `<kbd class="hotkey-badge recording">${recordingMsg}</kbd>`;
    container.innerHTML = html;
  }

  handleHotkeysPaneClick(e) {
    const btnRemove = e.target.closest('.btn-remove-key');
    if (btnRemove) {
      e.preventDefault();
      e.stopPropagation();
      const type = btnRemove.dataset.type;
      const id = btnRemove.dataset.id;
      const key = btnRemove.dataset.key;
      if (type === 'button') {
        hotkeysManager.customHotkeys[id] = (hotkeysManager.customHotkeys[id] || []).filter(k => k !== key);
        hotkeysManager.saveStoredHotkeys();
        this.renderHotkeys();
      } else if (type === 'snippet') {
        const snip = hotkeysManager.customSnippets.find(s => s.id === id);
        if (snip) {
          snip.hotkeys = (snip.hotkeys || []).filter(k => k !== key);
          hotkeysManager.saveStoredSnippets();
          this.renderSnippets();
        }
      }
      return;
    }

    const btnAdd = e.target.closest('.btn-add-hotkey');
    if (btnAdd) {
      e.preventDefault();
      e.stopPropagation();
      this.startRecording(btnAdd.dataset.type, btnAdd.dataset.id);
      return;
    }

    const btnReset = e.target.closest('.btn-reset-hotkey');
    if (btnReset) {
      e.preventDefault();
      e.stopPropagation();
      const id = btnReset.dataset.id;
      if (DEFAULT_HOTKEYS[id]) {
        hotkeysManager.customHotkeys[id] = [...DEFAULT_HOTKEYS[id]];
        hotkeysManager.saveStoredHotkeys();
        this.renderHotkeys();
        this.hideConflictAlert();
      }
      return;
    }

    const btnEditSnip = e.target.closest('.btn-edit-snippet');
    if (btnEditSnip) {
      e.preventDefault();
      e.stopPropagation();
      this.openEditSnippetDialog(btnEditSnip.dataset.id);
      return;
    }

    const btnDeleteSnip = e.target.closest('.btn-delete-snippet');
    if (btnDeleteSnip) {
      e.preventDefault();
      e.stopPropagation();
      this.deleteSnippet(btnDeleteSnip.dataset.id);
      return;
    }
  }

  handleRecordingKeyDown(e) {
    if (!hotkeysManager.activeRecording) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      const rec = hotkeysManager.activeRecording;
      hotkeysManager.activeRecording = null;
      if (rec.type === 'button') this.renderHotkeys();
      else this.renderSnippets();
      return;
    }

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      return;
    }

    const combo = hotkeysManager.normalizeKeyComboFromEvent(e);
    if (!combo) {
      this.showConflictAlert(window.I18n ? window.I18n.t('settings.hotkeysRecording') : 'Cần kết hợp với phím Ctrl, Alt hoặc Shift');
      return;
    }

    const conflict = hotkeysManager.findHotkeyConflict(combo, hotkeysManager.activeRecording.type, hotkeysManager.activeRecording.id);
    if (conflict) {
      const errTemplate = window.I18n ? window.I18n.t('settings.hotkeysConflictError') : 'Phím tắt "{key}" đã được gán cho: "{name}"!';
      this.showConflictAlert(errTemplate.replace('{key}', combo).replace('{name}', conflict.name));
      const rec = hotkeysManager.activeRecording;
      hotkeysManager.activeRecording = null;
      if (rec.type === 'button') this.renderHotkeys();
      else this.renderSnippets();
      return;
    }

    const rec = hotkeysManager.activeRecording;
    if (rec.type === 'button') {
      if (!hotkeysManager.customHotkeys[rec.id]) hotkeysManager.customHotkeys[rec.id] = [];
      hotkeysManager.customHotkeys[rec.id].push(combo);
      hotkeysManager.saveStoredHotkeys();
      this.renderHotkeys();
    } else if (rec.type === 'snippet') {
      const snip = hotkeysManager.customSnippets.find(s => s.id === rec.id);
      if (snip) {
        if (!snip.hotkeys) snip.hotkeys = [];
        snip.hotkeys.push(combo);
        hotkeysManager.saveStoredSnippets();
        this.renderSnippets();
      }
    }

    this.hideConflictAlert();
    hotkeysManager.activeRecording = null;
  }

  openNewSnippetDialog() {
    this.editingSnippetId = null;
    if (this.snippetTitle) {
      this.snippetTitle.textContent = window.I18n ? window.I18n.t('settings.snippetModalTitle') : 'Tạo / Sửa Snippet';
    }
    if (this.snippetName) this.snippetName.value = '';
    if (this.snippetText) this.snippetText.value = '';
    if (this.snippetDialog) {
      this.snippetDialog.classList.add('active');
      this.snippetDialog.style.display = 'flex';
    }
    setTimeout(() => { if (this.snippetName) this.snippetName.focus(); }, 50);
  }

  openEditSnippetDialog(snippetId) {
    const snip = hotkeysManager.customSnippets.find(s => s.id === snippetId);
    if (!snip) return;
    this.editingSnippetId = snippetId;
    if (this.snippetTitle) {
      this.snippetTitle.textContent = window.I18n ? window.I18n.t('settings.snippetModalTitle') : 'Tạo / Sửa Snippet';
    }
    if (this.snippetName) this.snippetName.value = snip.name || '';
    if (this.snippetText) this.snippetText.value = snip.text || '';
    if (this.snippetDialog) {
      this.snippetDialog.classList.add('active');
      this.snippetDialog.style.display = 'flex';
    }
    setTimeout(() => { if (this.snippetName) this.snippetName.focus(); }, 50);
  }

  closeSnippetDialog() {
    if (this.snippetDialog) {
      this.snippetDialog.classList.remove('active');
      this.snippetDialog.style.display = 'none';
    }
    this.editingSnippetId = null;
  }

  saveSnippetFromDialog() {
    const name = this.snippetName ? this.snippetName.value.trim() : '';
    const text = this.snippetText ? this.snippetText.value : '';
    if (!name) {
      if (this.snippetName) this.snippetName.focus();
      return;
    }
    if (!text) {
      if (this.snippetText) this.snippetText.focus();
      return;
    }

    if (this.editingSnippetId) {
      const snip = hotkeysManager.customSnippets.find(s => s.id === this.editingSnippetId);
      if (snip) {
        snip.name = name;
        snip.text = text;
      }
    } else {
      const newId = 'snip_' + Date.now();
      hotkeysManager.customSnippets.push({
        id: newId,
        name: name,
        text: text,
        hotkeys: []
      });
    }

    hotkeysManager.saveStoredSnippets();
    this.renderSnippets();
    this.closeSnippetDialog();
  }

  deleteSnippet(snippetId) {
    const snip = hotkeysManager.customSnippets.find(s => s.id === snippetId);
    if (!snip) return;
    const confirmMsg = window.I18n
      ? window.I18n.t('settings.snippetDeleteConfirm', { name: snip.name })
      : `Bạn có chắc muốn xóa snippet "${snip.name}"?`;
    if (confirm(confirmMsg)) {
      hotkeysManager.customSnippets = hotkeysManager.customSnippets.filter(s => s.id !== snippetId);
      hotkeysManager.saveStoredSnippets();
      this.renderSnippets();
    }
  }
}
