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
    this.btnCollapseAll = document.getElementById('btn-collapse-all-toc');

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

    if (this.btnCollapseAll) {
      this.btnCollapseAll.addEventListener('click', () => {
        this.toggleCollapseAll();
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

  toggleCollapseAll() {
    if (!this.list) return;
    const parentNodes = Array.from(this.list.querySelectorAll('.toc-node')).filter(n => n.querySelector('.toc-children'));
    if (parentNodes.length === 0) return;

    const anyExpanded = parentNodes.some(n => !n.classList.contains('collapsed'));
    parentNodes.forEach(n => {
      n.classList.toggle('collapsed', anyExpanded);
    });
  }

  renderHeadingTree(headings, onItemClick) {
    if (!this.list) return;

    if (headings.length === 0) {
      this.list.innerHTML = `<div class="toc-empty">${window.I18n ? window.I18n.t('toc.emptyNoHeadings') : 'Ghi chú không có tiêu đề'}</div>`;
      if (this.countBadge) this.countBadge.textContent = '0';
      return;
    }

    if (this.countBadge) this.countBadge.textContent = headings.length;
    this.list.innerHTML = '';

    // Stack to manage nested .toc-children containers
    const stack = [{ level: 0, container: this.list }];

    headings.forEach((h, index) => {
      // Find parent container in stack whose level < h.level
      while (stack.length > 1 && stack[stack.length - 1].level >= h.level) {
        stack.pop();
      }
      const parentContainer = stack[stack.length - 1].container;

      // Check if subsequent headings are descendants (level > h.level)
      const nextHeading = headings[index + 1];
      const hasChildren = nextHeading && nextHeading.level > h.level;

      const nodeEl = document.createElement('div');
      nodeEl.className = `toc-node toc-node-level-${h.level}`;

      const rowEl = document.createElement('div');
      rowEl.className = `toc-item-row toc-level-${h.level}`;

      if (hasChildren) {
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'toc-collapse-btn';
        toggleBtn.title = 'Thu gọn / Mở rộng nhóm tiêu đề';
        toggleBtn.setAttribute('aria-label', 'Toggle section');
        toggleBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          nodeEl.classList.toggle('collapsed');
        });
        rowEl.appendChild(toggleBtn);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'toc-collapse-spacer';
        rowEl.appendChild(spacer);
      }

      const a = document.createElement('a');
      a.className = `toc-item toc-level-${h.level}`;
      if (h.id) a.dataset.targetId = h.id;
      if (h.lineNumber) a.dataset.lineNumber = h.lineNumber;
      a.textContent = h.text;
      a.title = h.title || h.text;

      a.addEventListener('click', (e) => {
        e.preventDefault();
        onItemClick(h, a);
      });

      rowEl.appendChild(a);
      nodeEl.appendChild(rowEl);

      if (hasChildren) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'toc-children';
        nodeEl.appendChild(childrenContainer);
        parentContainer.appendChild(nodeEl);
        stack.push({ level: h.level, container: childrenContainer });
      } else {
        parentContainer.appendChild(nodeEl);
      }
    });

    this.updateActiveItem();
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
            lineFrom: line.from,
            title: window.I18n
              ? window.I18n.t('toc.lineJumpTitle', { line: l, title: m[2].trim() })
              : `Dòng ${l}: ${m[2].trim()}`
          });
        }
      }

      const editPreviewBody = document.getElementById('edit-preview-body');
      const cmEditorMount = document.getElementById('cm-editor-mount');

      this.renderHeadingTree(headings, (h, a) => {
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
          this.list.querySelectorAll('.toc-item-row').forEach(el => el.classList.remove('active'));
          a.classList.add('active');
          a.closest('.toc-item-row')?.classList.add('active');
        }
      });
      return;
    }

    // Normal Reader Mode
    const noteBody = document.getElementById('note-body');
    if (!noteBody) return;
    const headingElements = Array.from(noteBody.querySelectorAll('h1, h2, h3, h4, h5, h6'));

    const headings = headingElements.map((h, index) => {
      if (!h.id) {
        const slug = h.textContent.trim().toLowerCase().replace(/[^\w\u00C0-\u024F\u1EA0-\u1EF9]+/g, '-');
        h.id = `heading-${index}-${slug}`.replace(/-+$/, '');
      }
      return {
        level: parseInt(h.tagName.substring(1), 10) || 1,
        text: h.textContent.trim(),
        id: h.id,
        element: h,
        title: h.textContent.trim()
      };
    });

    this.renderHeadingTree(headings, (h, a) => {
      h.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      h.element.classList.add('heading-highlight');
      setTimeout(() => h.element.classList.remove('heading-highlight'), 1200);

      this.list.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
      this.list.querySelectorAll('.toc-item-row').forEach(el => el.classList.remove('active'));
      a.classList.add('active');
      a.closest('.toc-item-row')?.classList.add('active');
    });
  }

  updateActiveItem() {
    if (!this.list || !appState.isCoreFeatureEnabled('outline')) return;

    const setActive = (activeLink) => {
      if (!activeLink || activeLink.classList.contains('active')) return;
      this.list.querySelectorAll('.toc-item').forEach(el => el.classList.remove('active'));
      this.list.querySelectorAll('.toc-item-row').forEach(el => el.classList.remove('active'));
      activeLink.classList.add('active');
      activeLink.closest('.toc-item-row')?.classList.add('active');

      // Auto-expand any collapsed ancestors so current active heading is visible
      let parent = activeLink.closest('.toc-children');
      while (parent) {
        const node = parent.closest('.toc-node');
        if (node && node.classList.contains('collapsed')) {
          node.classList.remove('collapsed');
        }
        parent = node ? node.parentElement.closest('.toc-children') : null;
      }

      activeLink.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

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
        if (activeLink) setActive(activeLink);
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
      if (activeLink) setActive(activeLink);
    }
  }
}
