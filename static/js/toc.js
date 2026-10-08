/**
 * Obsidian QuickView - Table of Contents (Outline) & ScrollSpy
 * Supports live heading extraction in both Reader and Quick Edit modes.
 */

import { eventBus } from './events.js';
import { appState } from './state.js';

export class TocController {
  constructor() {
    this.panel = document.getElementById('sidebar-right') || document.getElementById('toc-panel');
    this.list = document.getElementById('toc-list');
    this.countBadge = document.getElementById('toc-count-badge');
    this.btnToggle = document.getElementById('btn-toggle-toc');
    this.btnClose = document.getElementById('btn-close-right-sidebar');

    this.debounceTimer = null;
    this.editorInstance = null;

    this.init();
  }

  init() {
    this.applyState(appState.isTocOpen);

    if (this.btnToggle) {
      this.btnToggle.addEventListener('click', () => {
        appState.setTocOpen(!appState.isTocOpen);
      });
    }

    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => {
        appState.setTocOpen(false);
      });
    }

    eventBus.on('toc:toggled', (open) => {
      this.applyState(open);
    });

    eventBus.on('note:rendered', () => {
      this.generate();
    });

    eventBus.on('editor:contentChanged', () => {
      this.scheduleUpdate();
    });

    eventBus.on('editing:stateChanged', () => {
      this.generate();
    });

    // Scroll spy on note body
    const noteContainer = document.getElementById('note-container');
    if (noteContainer) {
      noteContainer.addEventListener('scroll', () => {
        if (!appState.isEditing) {
          this.updateActiveItem();
        }
      }, { passive: true });
    }

    eventBus.on('settings:core_changed', (payload) => {
      this.onCoreSettingsChanged(payload);
    });

    this.applyCoreSettings(appState.coreSettings);
  }

  applyCoreSettings(settings) {
    if (!settings) return;
    const isEnabled = settings.outline !== false;
    if (this.btnToggle) {
      this.btnToggle.style.display = isEnabled ? '' : 'none';
    }
    if (!isEnabled) {
      if (this.panel) {
        this.panel.classList.add('collapsed');
        this.panel.style.display = 'none';
      }
      if (this.list) this.list.innerHTML = '';
      if (this.countBadge) this.countBadge.textContent = '0';
    } else {
      this.applyState(appState.isTocOpen);
      if (appState.isTocOpen) {
        this.generate();
      }
    }
  }

  onCoreSettingsChanged() {
    this.applyCoreSettings(appState.coreSettings);
  }

  setEditorInstance(instance) {
    this.editorInstance = instance;
  }

  applyState(open) {
    if (this.panel) {
      if (open) {
        this.panel.classList.remove('collapsed');
        this.panel.style.display = 'flex';
      } else {
        this.panel.classList.add('collapsed');
        this.panel.style.display = 'none';
      }
    }
    if (this.btnToggle) {
      this.btnToggle.classList.toggle('active', open);
    }
  }

  scheduleUpdate() {
    if (!appState.isCoreFeatureEnabled('outline')) return;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      if (appState.isEditing) {
        this.generate();
      }
    }, 250);
  }

  generate() {
    if (!this.list || !appState.isCoreFeatureEnabled('outline')) return;

    if (!appState.isEditing && !appState.currentNote) {
      this.list.innerHTML = `<div class="toc-empty">${window.I18n ? window.I18n.t('toc.emptyNoNote') : 'Chưa chọn ghi chú nào'}</div>`;
      if (this.countBadge) this.countBadge.textContent = '0';
      return;
    }

    // Quick Edit Mode
    if (appState.isEditing && this.editorInstance) {
      const doc = this.editorInstance.view.state.doc;
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
        this.list.innerHTML = `<div class="toc-empty">${window.I18n ? window.I18n.t('toc.emptyNoHeadings') : 'Ghi chú không có tiêu đề'}</div>`;
        if (this.countBadge) this.countBadge.textContent = '0';
        return;
      }

      if (this.countBadge) this.countBadge.textContent = headings.length;
      this.list.innerHTML = '';

      const editPreviewBody = document.getElementById('edit-preview-body');
      const cmEditorMount = document.getElementById('cm-editor-mount');

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
          if (this.editorInstance) {
            this.editorInstance.scrollToLine(h.lineNumber);

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

            if (appState.currentEditMode === 'split' || appState.currentEditMode === 'preview') {
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

            this.list.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
            a.classList.add('active');
          }
        });

        this.list.appendChild(a);
      });

      this.updateActiveItem();
      return;
    }

    // Normal Reader Mode
    const noteBody = document.getElementById('note-body');
    if (!noteBody) return;
    const headings = Array.from(noteBody.querySelectorAll('h1, h2, h3, h4, h5, h6'));

    if (headings.length === 0) {
      this.list.innerHTML = `<div class="toc-empty">${window.I18n ? window.I18n.t('toc.emptyNoHeadings') : 'Ghi chú không có tiêu đề'}</div>`;
      if (this.countBadge) this.countBadge.textContent = '0';
      return;
    }

    if (this.countBadge) this.countBadge.textContent = headings.length;
    this.list.innerHTML = '';

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

        this.list.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
        a.classList.add('active');
      });

      this.list.appendChild(a);
    });

    this.updateActiveItem();
  }

  updateActiveItem() {
    if (!this.list || !appState.isCoreFeatureEnabled('outline')) return;

    if (appState.isEditing) {
      const editContainer = document.getElementById('edit-container');
      const cmEditorMount = document.getElementById('cm-editor-mount');
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
        const activeLink = Array.from(this.list.querySelectorAll('.toc-item')).find(a => a.textContent.trim() === text);
        if (activeLink && !activeLink.classList.contains('active')) {
          this.list.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
          activeLink.classList.add('active');
          activeLink.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
      return;
    }

    const noteBody = document.getElementById('note-body');
    if (!noteBody) return;
    const headings = Array.from(noteBody.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    if (headings.length === 0) return;

    let currentHeading = headings[0];
    for (let i = 0; i < headings.length; i++) {
      const rect = headings[i].getBoundingClientRect();
      if (rect.top <= 120) {
        currentHeading = headings[i];
      } else {
        break;
      }
    }

    if (currentHeading && currentHeading.id) {
      const activeLink = this.list.querySelector(`.toc-item[data-target-id="${currentHeading.id}"]`);
      if (activeLink && !activeLink.classList.contains('active')) {
        this.list.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
        activeLink.classList.add('active');
        activeLink.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }
}
