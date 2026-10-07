/**
 * Obsidian QuickView - Editor Controller
 * Encapsulates CodeMirror 6 instance, live/source/split/preview modes, and note saving.
 */

import { eventBus } from './events.js';
import { appState } from './state.js';
import { ApiClient } from './api.js';
import { renderMarkdown, loadKatex } from './markdown.js';

export class EditorController {
  constructor() {
    this.container = document.getElementById('edit-container');
    this.contentWrapper = document.getElementById('edit-content-wrapper');
    this.sourcePane = document.getElementById('edit-source-pane');
    this.previewPane = document.getElementById('edit-preview-pane');
    this.previewBody = document.getElementById('edit-preview-body');
    this.editorMount = document.getElementById('cm-editor-mount');
    this.editStats = document.getElementById('edit-stats');

    this.btnLive = document.getElementById('btn-mode-live');
    this.btnSource = document.getElementById('btn-mode-source');
    this.btnSplit = document.getElementById('btn-mode-split');
    this.btnPreview = document.getElementById('btn-mode-preview');
    this.btnSave = document.getElementById('btn-save-edit');
    this.btnCancel = document.getElementById('btn-cancel-edit');
    this.btnQuickEdit = document.getElementById('btn-quick-edit');

    this.cmInstance = null;
    this.livePreviewDebounceTimer = null;
    this.isSaving = false;

    this.init();
  }

  init() {
    if (this.btnLive) this.btnLive.addEventListener('click', () => this.setMode('live'));
    if (this.btnSource) this.btnSource.addEventListener('click', () => this.setMode('source'));
    if (this.btnSplit) this.btnSplit.addEventListener('click', () => this.setMode('split'));
    if (this.btnPreview) this.btnPreview.addEventListener('click', () => this.setMode('preview'));

    if (this.btnQuickEdit) {
      this.btnQuickEdit.addEventListener('click', () => this.startEditing());
    }

    if (this.btnCancel) {
      this.btnCancel.addEventListener('click', () => this.cancelEditing());
    }

    if (this.btnSave) {
      this.btnSave.addEventListener('click', () => this.save());
    }

    eventBus.on('theme:changed', (theme) => {
      if (this.cmInstance) {
        this.cmInstance.setTheme(theme);
      }
    });
  }

  getInstance() {
    return this.cmInstance;
  }

  updateStats(text) {
    if (!this.editStats) return;
    const lines = text.split('\n').length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    this.editStats.textContent = window.I18n
      ? window.I18n.t('editor.stats', { words, lines })
      : `${words} từ | ${lines} dòng`;
  }

  updateLivePreview() {
    if (!this.previewBody || !this.cmInstance) return;
    const text = this.cmInstance.getValue();
    this.updateStats(text);
    if (appState.currentEditMode === 'split' || appState.currentEditMode === 'preview') {
      if (text.includes('$')) {
        loadKatex();
      }
      const renderedHtml = renderMarkdown(text, appState.currentNote ? appState.currentNote.path : '');
      this.previewBody.innerHTML = renderedHtml;
    }
  }

  scheduleLivePreviewUpdate() {
    clearTimeout(this.livePreviewDebounceTimer);
    this.livePreviewDebounceTimer = setTimeout(() => this.updateLivePreview(), 60);
  }

  setMode(mode) {
    appState.setEditMode(mode);

    [this.btnLive, this.btnSource, this.btnSplit, this.btnPreview].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    if (this.contentWrapper) {
      this.contentWrapper.classList.remove('edit-mode-live', 'edit-mode-source', 'split-mode', 'preview-mode');
    }

    if (mode === 'live') {
      if (this.btnLive) this.btnLive.classList.add('active');
      if (this.contentWrapper) this.contentWrapper.classList.add('edit-mode-live');
      if (this.cmInstance) this.cmInstance.setLivePreview(true);
      if (this.sourcePane) this.sourcePane.style.display = 'block';
      if (this.previewPane) this.previewPane.style.display = 'none';
      if (this.cmInstance) this.cmInstance.focus();
    } else if (mode === 'source') {
      if (this.btnSource) this.btnSource.classList.add('active');
      if (this.contentWrapper) this.contentWrapper.classList.add('edit-mode-source');
      if (this.cmInstance) this.cmInstance.setLivePreview(false);
      if (this.sourcePane) this.sourcePane.style.display = 'block';
      if (this.previewPane) this.previewPane.style.display = 'none';
      if (this.cmInstance) this.cmInstance.focus();
    } else if (mode === 'split') {
      if (this.btnSplit) this.btnSplit.classList.add('active');
      if (this.contentWrapper) this.contentWrapper.classList.add('split-mode', 'edit-mode-live');
      if (this.cmInstance) this.cmInstance.setLivePreview(true);
      if (this.sourcePane) this.sourcePane.style.display = 'block';
      if (this.previewPane) this.previewPane.style.display = 'block';
      this.updateLivePreview();
      if (this.cmInstance) this.cmInstance.focus();
    } else if (mode === 'preview') {
      if (this.btnPreview) this.btnPreview.classList.add('active');
      if (this.contentWrapper) this.contentWrapper.classList.add('preview-mode');
      if (this.sourcePane) this.sourcePane.style.display = 'none';
      if (this.previewPane) this.previewPane.style.display = 'block';
      this.updateLivePreview();
    }
  }

  initCodeMirror() {
    if (this.cmInstance || !window.ObsidianCM6 || !this.editorMount) return;
    this.cmInstance = window.ObsidianCM6.createEditor(this.editorMount, {
      doc: appState.currentNote ? appState.currentNote.raw_content : '',
      theme: appState.currentTheme,
      livePreview: appState.currentEditMode !== 'source',
      onChange: (text) => {
        this.updateStats(text);
        eventBus.emit('editor:contentChanged', text);
        if (appState.currentEditMode === 'split' || appState.currentEditMode === 'preview') {
          this.scheduleLivePreviewUpdate();
        }
      },
      onSave: () => {
        this.save();
      },
      onCancel: () => {
        this.cancelEditing();
      }
    });

    if (this.cmInstance) {
      this.cmInstance.setLivePreview(appState.currentEditMode !== 'source');
    }
  }

  startEditing() {
    if (!appState.currentNote) return;
    appState.setIsEditing(true);

    const noteContainer = document.getElementById('note-container');
    const noteContentWrapper = document.getElementById('note-content-wrapper');
    if (noteContainer) noteContainer.style.display = 'none';
    if (noteContentWrapper) noteContentWrapper.style.display = 'none';
    if (this.container) this.container.style.display = 'flex';

    if (!this.cmInstance) {
      this.initCodeMirror();
    }

    if (this.cmInstance) {
      this.cmInstance.setValue(appState.currentNote.raw_content);
      this.cmInstance.setTheme(appState.currentTheme);
    }

    this.setMode(appState.currentEditMode);
    this.updateStats(appState.currentNote.raw_content);
    this.updateLivePreview();

    setTimeout(() => {
      if (this.cmInstance && appState.currentEditMode !== 'preview') {
        this.cmInstance.focus();
      }
    }, 20);
  }

  cancelEditing() {
    appState.setIsEditing(false);
    if (this.container) this.container.style.display = 'none';
    const noteContainer = document.getElementById('note-container');
    const noteContentWrapper = document.getElementById('note-content-wrapper');
    if (noteContainer) noteContainer.style.display = 'block';
    if (noteContentWrapper) noteContentWrapper.style.display = 'block';
  }

  async save() {
    if (this.isSaving || !appState.currentNote || !this.cmInstance) return;
    this.isSaving = true;
    const savePath = appState.currentNote.path;
    const newContent = this.cmInstance.getValue();

    if (this.btnSave) {
      this.btnSave.textContent = window.I18n ? window.I18n.t('editor.saving') : 'Đang lưu...';
    }

    try {
      const data = await ApiClient.saveNote(savePath, newContent);
      if (data && data.status === 'saved') {
        if (this.btnSave) {
          this.btnSave.textContent = window.I18n ? window.I18n.t('editor.saved') : '✅ Đã lưu';
        }
        appState.currentNote.raw_content = newContent;

        try {
          const updated = await ApiClient.fetchNote(savePath);
          if (updated && appState.currentNote && appState.currentNote.path === savePath) {
            Object.assign(appState.currentNote, updated);
            const noteBody = document.getElementById('note-body');
            if (noteBody) {
              noteBody.innerHTML = renderMarkdown(updated.content, updated.path);
            }
            this.updateLivePreview();
            eventBus.emit('note:updated', updated);
          }
        } catch (_ignore) {}

        appState.setIsEditing(true);
        if (this.container) this.container.style.display = 'flex';

        if (this.cmInstance && appState.currentEditMode !== 'preview') {
          this.cmInstance.focus();
        }

        setTimeout(() => {
          if (this.btnSave) {
            this.btnSave.textContent = window.I18n ? window.I18n.t('editor.save') : '💾 Lưu ghi chú';
          }
        }, 800);
      } else {
        alert((window.I18n ? window.I18n.t('editor.saveError') : 'Lỗi lưu ghi chú: ') + (data?.error || 'Unknown error'));
        if (this.btnSave) {
          this.btnSave.textContent = window.I18n ? window.I18n.t('editor.save') : '💾 Lưu ghi chú';
        }
      }
    } catch (e) {
      alert((window.I18n ? window.I18n.t('editor.connectError') : 'Lỗi kết nối khi lưu: ') + e.message);
      if (this.btnSave) {
        this.btnSave.textContent = window.I18n ? window.I18n.t('editor.save') : '💾 Lưu ghi chú';
      }
    } finally {
      this.isSaving = false;
    }
  }

  insertSnippet(text) {
    if (!this.cmInstance) return;
    try {
      const view = this.cmInstance.view;
      const state = view.state;
      const sel = state.selection.main;
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: text },
        selection: { anchor: sel.from + text.length }
      });
      view.focus();
    } catch (e) {
      console.warn('Failed to insert snippet:', e);
    }
  }
}
