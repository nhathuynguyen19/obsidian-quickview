/**
 * Obsidian QuickView - Editor Controller
 * Encapsulates CodeMirror 6 instance, live/source/split/preview modes, lazy-loading, and note saving.
 */

import { eventBus } from './events.js';
import { appState } from './state.js';
import { ApiClient } from './api.js';
import { renderMarkdown, loadKatex } from './markdown.js';

let cm6LoadPromise = null;

export function loadCodeMirror6() {
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

export function getScrollRatio(element) {
  if (!element) return 0;
  const max = Math.max(0, element.scrollHeight - element.clientHeight);
  return max > 0 ? Math.max(0, Math.min(1, element.scrollTop / max)) : 0;
}

export function restoreScrollRatio(element, ratio) {
  if (!element) return;
  const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
  requestAnimationFrame(() => {
    const max = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = max * safeRatio;
  });
}

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
    const str = typeof text === 'string' ? text : (this.cmInstance ? this.cmInstance.getValue() : '');
    const lines = str.split('\n').length;
    const words = str.trim() ? str.trim().split(/\s+/).length : 0;
    this.editStats.textContent = window.I18n
      ? window.I18n.t('editor.stats', { words, lines })
      : `${words} từ | ${lines} dòng`;
  }

  releasePreviewDom() {
    clearTimeout(this.livePreviewDebounceTimer);
    if (this.previewBody) {
      this.previewBody.replaceChildren();
    }
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
      this.releasePreviewDom();
      if (this.cmInstance) this.cmInstance.focus();
    } else if (mode === 'source') {
      if (this.btnSource) this.btnSource.classList.add('active');
      if (this.contentWrapper) this.contentWrapper.classList.add('edit-mode-source');
      if (this.cmInstance) this.cmInstance.setLivePreview(false);
      if (this.sourcePane) this.sourcePane.style.display = 'block';
      if (this.previewPane) this.previewPane.style.display = 'none';
      this.releasePreviewDom();
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

  destroyCodeMirror() {
    clearTimeout(this.livePreviewDebounceTimer);
    if (this.cmInstance) {
      try {
        this.cmInstance.destroy();
      } catch (_) {}
      this.cmInstance = null;
    }
    if (this.editorMount) {
      this.editorMount.replaceChildren();
    }
  }

  initCodeMirror(rawText) {
    if (this.cmInstance || !window.ObsidianCM6 || !this.editorMount) return;
    const initialDoc = typeof rawText === 'string'
      ? rawText
      : (appState.currentNote ? (appState.currentNote.raw_content || '') : '');

    this.cmInstance = window.ObsidianCM6.createEditor(this.editorMount, {
      doc: initialDoc,
      notePath: appState.currentNote ? appState.currentNote.path : '',
      theme: appState.currentTheme,
      livePreview: appState.currentEditMode !== 'source',
      onChange: () => {
        const text = this.cmInstance ? this.cmInstance.getValue() : '';
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

  async startEditing() {
    if (!appState.currentNote || appState.isEditing) return;
    const noteContainer = document.getElementById('note-container');
    const readingScrollRatio = getScrollRatio(noteContainer);

    try {
      let rawText = appState.currentNote.raw_content;
      if (typeof rawText !== 'string') {
        try {
          const rawRes = await ApiClient.fetchNoteRaw(appState.currentNote.path);
          if (rawRes && typeof rawRes.raw_content === 'string') {
            rawText = rawRes.raw_content;
            appState.currentNote.raw_content = rawText;
          }
        } catch (_) {}
        if (typeof rawText !== 'string') {
          rawText = appState.currentNote.content || '';
        }
      }

      await loadCodeMirror6();

      const noteContentWrapper = document.getElementById('note-content-wrapper');
      if (noteContainer) noteContainer.style.display = 'none';
      if (noteContentWrapper) noteContentWrapper.style.display = 'none';
      if (this.container) this.container.style.display = 'flex';

      this.destroyCodeMirror();
      this.initCodeMirror(rawText);

      this.setMode(appState.currentEditMode);
      this.updateStats(rawText);
      if (appState.currentEditMode === 'split' || appState.currentEditMode === 'preview') {
        this.updateLivePreview();
      }

      appState.setIsEditing(true);
      eventBus.emit('editing:stateChanged', true);

      restoreScrollRatio(this.container, readingScrollRatio);

      setTimeout(() => {
        if (this.cmInstance && appState.currentEditMode !== 'preview') {
          this.cmInstance.focus();
        }
      }, 20);
    } catch (err) {
      console.error('Failed to initialize editor:', err);
      alert((window.I18n ? window.I18n.t('app.error') : 'Lỗi') + ': ' + err.message);
      this.cancelEditing();
    }
  }

  cancelEditing() {
    this.destroyCodeMirror();
    this.releasePreviewDom();
    appState.setIsEditing(false);
    eventBus.emit('editing:stateChanged', false);

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
            if (appState.currentEditMode === 'split' || appState.currentEditMode === 'preview') {
              this.updateLivePreview();
            }
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
