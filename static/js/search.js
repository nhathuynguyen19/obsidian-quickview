/**
 * Obsidian QuickView - Search Modal Controller
 * Fast title and full-text search with debounce and keyboard navigation.
 */

import { eventBus } from './events.js';
import { ApiClient } from './api.js';
import { SVG_NOTE } from './icons.js';

export class SearchModalController {
  constructor() {
    this.backdrop = document.getElementById('search-modal-backdrop');
    this.input = document.getElementById('search-input');
    this.resultsContainer = document.getElementById('search-results');
    this.statusText = document.getElementById('search-status-text');
    this.btnClose = document.getElementById('btn-close-modal');

    this.tabTitle = document.getElementById('tab-search-title');
    this.tabContent = document.getElementById('tab-search-content');
    this.btnTriggerSearch = document.getElementById('btn-trigger-search');
    this.btnTriggerContentSearch = document.getElementById('btn-trigger-content-search');

    this.mode = 'title';
    this.results = [];
    this.selectedIndex = 0;
    this.debounceTimer = null;

    this.init();
  }

  init() {
    if (this.btnTriggerSearch) {
      this.btnTriggerSearch.addEventListener('click', () => this.open('', 'title'));
    }
    if (this.btnTriggerContentSearch) {
      this.btnTriggerContentSearch.addEventListener('click', () => this.open('', 'content'));
    }
    if (this.tabTitle) {
      this.tabTitle.addEventListener('click', () => this.setMode('title'));
    }
    if (this.tabContent) {
      this.tabContent.addEventListener('click', () => this.setMode('content'));
    }

    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.close());
    }

    if (this.backdrop) {
      this.backdrop.addEventListener('click', (e) => {
        if (e.target === this.backdrop) this.close();
      });
    }

    if (this.input) {
      this.input.addEventListener('input', (e) => {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.search(e.target.value);
        }, 80);
      });

      this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    if (this.resultsContainer) {
      this.resultsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.search-item');
        if (item && item.dataset.path) {
          this.close();
          eventBus.emit('note:open', { path: item.dataset.path });
        }
      });
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (this.tabTitle) this.tabTitle.classList.toggle('active', mode === 'title');
    if (this.tabContent) this.tabContent.classList.toggle('active', mode === 'content');

    if (this.input) {
      if (mode === 'title') {
        this.input.placeholder = window.I18n
          ? window.I18n.t('search.inputPlaceholderTitle')
          : 'Tìm theo tiêu đề ghi chú... (Ctrl K)';
      } else {
        this.input.placeholder = window.I18n
          ? window.I18n.t('search.inputPlaceholderContent')
          : 'Tìm theo nội dung markdown... (Ctrl Shift F)';
      }
    }

    if (this.backdrop && this.backdrop.classList.contains('active') && this.input) {
      this.search(this.input.value);
    }
  }

  open(initialQuery = '', mode = 'title') {
    this.setMode(mode);
    if (this.backdrop) this.backdrop.classList.add('active');
    if (this.input) {
      this.input.value = initialQuery;
      this.input.focus();
    }
    this.search(initialQuery);
  }

  close() {
    if (this.backdrop) this.backdrop.classList.remove('active');
  }

  async search(query) {
    if (this.statusText) {
      this.statusText.textContent = window.I18n ? window.I18n.t('search.statusSearching') : 'Đang tìm kiếm...';
    }

    try {
      const data = await ApiClient.searchNotes(query, this.mode, 40);
      if (!data || !data.results) {
        if (this.statusText) {
          this.statusText.textContent = window.I18n ? window.I18n.t('app.error') : 'Lỗi tìm kiếm';
        }
        return;
      }

      this.results = data.results;
      this.selectedIndex = 0;

      if (this.statusText) {
        this.statusText.textContent = window.I18n
          ? window.I18n.t('search.statusFound', { count: this.results.length })
          : `${this.results.length} kết quả`;
      }

      if (this.results.length === 0) {
        if (this.resultsContainer) {
          this.resultsContainer.innerHTML = `
            <div style="padding: 24px; text-align: center; color: var(--text-muted);">
              ${window.I18n ? window.I18n.t('search.statusNotFound') : 'Không tìm thấy ghi chú nào phù hợp'}
            </div>
          `;
        }
        return;
      }

      this.render();
    } catch {
      if (this.statusText) {
        this.statusText.textContent = window.I18n ? window.I18n.t('app.error') : 'Lỗi tìm kiếm';
      }
    }
  }

  render() {
    if (!this.resultsContainer) return;

    this.resultsContainer.innerHTML = this.results.map((r, i) => `
      <div class="search-item ${i === this.selectedIndex ? 'selected' : ''}" data-index="${i}" data-path="${r.path}">
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

    const selectedEl = this.resultsContainer.querySelector('.search-item.selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  handleKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      this.setMode(this.mode === 'title' ? 'content' : 'title');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.results.length > 0) {
        this.selectedIndex = (this.selectedIndex + 1) % this.results.length;
        this.render();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.results.length > 0) {
        this.selectedIndex = (this.selectedIndex - 1 + this.results.length) % this.results.length;
        this.render();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.results[this.selectedIndex]) {
        const path = this.results[this.selectedIndex].path;
        this.close();
        eventBus.emit('note:open', { path });
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }
}
