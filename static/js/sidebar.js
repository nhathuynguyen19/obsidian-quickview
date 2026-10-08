/**
 * Obsidian QuickView - Sidebar Controller
 * Manages Folder Tree, Recent Notes (LRU), and Tags list.
 */

import { eventBus } from './events.js';
import { appState } from './state.js';
import { ApiClient } from './api.js';
import { SVG_NOTE, SVG_FOLDER, SVG_TAG } from './icons.js';

export class SidebarController {
  constructor() {
    this.sidebar = document.getElementById('sidebar');
    this.btnToggle = document.getElementById('btn-toggle-sidebar');
    this.tabs = this.sidebar ? this.sidebar.querySelectorAll('.sidebar-tab') : [];
    this.panes = this.sidebar ? this.sidebar.querySelectorAll('.tab-pane') : [];

    this.treeContainer = document.getElementById('tree-container');
    this.recentContainer = document.getElementById('recent-container');
    this.tagsContainer = document.getElementById('tags-container');

    this.recentNotes = [];

    this.init();
  }

  init() {
    // Restore collapsed state
    if (localStorage.getItem('obs_sidebar_collapsed') === '1' && this.sidebar) {
      this.sidebar.classList.add('collapsed');
    }

    if (this.btnToggle) {
      this.btnToggle.addEventListener('click', () => this.toggle());
    }

    // Tabs switching
    this.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.tabs.forEach(t => t.classList.remove('active'));
        this.panes.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const targetId = 'pane-' + tab.dataset.tab;
        const targetPane = this.sidebar ? this.sidebar.querySelector('#' + targetId) : document.getElementById(targetId);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // Event bus bindings
    eventBus.on('note:currentChanged', (note) => {
      if (note) {
        if (appState.isCoreFeatureEnabled('recent')) {
          this.addRecentNote(note);
        }
        this.highlightActiveNote(note.path);
      }
    });

    eventBus.on('vault:infoChanged', () => {
      this.loadAll();
    });

    eventBus.on('settings:core_changed', (payload) => {
      this.onCoreSettingsChanged(payload);
    });

    this.applyCoreSettings(appState.coreSettings);
  }

  applyCoreSettings(settings) {
    if (!settings || !this.sidebar) return;
    const tabTree = this.sidebar.querySelector('.sidebar-tab[data-tab="tree"]');
    const tabRecent = this.sidebar.querySelector('.sidebar-tab[data-tab="recent"]');
    const tabTags = this.sidebar.querySelector('.sidebar-tab[data-tab="tags"]');

    if (tabTree) tabTree.style.display = settings.folders !== false ? '' : 'none';
    if (tabRecent) tabRecent.style.display = settings.recent !== false ? '' : 'none';
    if (tabTags) tabTags.style.display = settings.tags !== false ? '' : 'none';

    // If active tab is now hidden, switch to first visible tab
    const activeTab = this.sidebar.querySelector('.sidebar-tab.active');
    if (activeTab && activeTab.style.display === 'none') {
      activeTab.classList.remove('active');
      this.panes.forEach(p => p.classList.remove('active'));

      const firstVisible = Array.from(this.tabs).find(t => t.style.display !== 'none');
      if (firstVisible) {
        firstVisible.classList.add('active');
        const targetPane = this.sidebar.querySelector('#pane-' + firstVisible.dataset.tab);
        if (targetPane) targetPane.classList.add('active');
      }
    }
  }

  onCoreSettingsChanged(payload) {
    this.applyCoreSettings(appState.coreSettings);
    if (!payload) return;
    if (payload.feature === 'folders' && payload.enabled) {
      this.loadTree();
    } else if (payload.feature === 'recent' && payload.enabled) {
      this.loadRecent();
    } else if (payload.feature === 'tags' && payload.enabled) {
      this.loadTags();
    }
  }

  toggle() {
    if (this.sidebar) {
      this.sidebar.classList.toggle('collapsed');
      localStorage.setItem('obs_sidebar_collapsed', this.sidebar.classList.contains('collapsed') ? '1' : '0');
    }
  }

  async loadAll() {
    const promises = [];
    if (appState.isCoreFeatureEnabled('folders')) promises.push(this.loadTree());
    if (appState.isCoreFeatureEnabled('recent')) promises.push(this.loadRecent());
    if (appState.isCoreFeatureEnabled('tags')) promises.push(this.loadTags());
    await Promise.all(promises);
  }

  // --- Folder Tree ---
  async loadTree() {
    if (!this.treeContainer || !appState.isCoreFeatureEnabled('folders')) return;
    try {
      const tree = await ApiClient.fetchTree();
      if (!tree) return;

      const renderNode = (node) => {
        if (node.type === 'file') {
          return `
            <div class="file-item" data-path="${node.path}">
              ${SVG_NOTE}
              <span style="overflow: hidden; text-overflow: ellipsis;">${node.name}</span>
            </div>
          `;
        }

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
      };

      this.treeContainer.innerHTML = renderNode(tree);
      if (appState.currentNote) {
        this.highlightActiveNote(appState.currentNote.path);
      }
    } catch (e) {
      console.warn('Failed to load tree:', e);
    }
  }

  highlightActiveNote(path) {
    if (this.sidebar) {
      this.sidebar.querySelectorAll('.file-item, .recent-item').forEach(el => {
        el.classList.toggle('active', el.dataset.path === path);
      });
    }
  }

  // --- Recent Notes ---
  getRecentStorageKey() {
    const vKey = appState.currentVaultPath ? encodeURIComponent(appState.currentVaultPath) : 'default';
    return `obs_recent_${vKey}`;
  }

  saveRecentNotes() {
    try {
      localStorage.setItem(this.getRecentStorageKey(), JSON.stringify(this.recentNotes));
    } catch (e) {
      console.warn('Failed to save recent notes to localStorage:', e);
    }
  }

  loadRecentNotesFromStorage() {
    try {
      const stored = localStorage.getItem(this.getRecentStorageKey());
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse recent notes from localStorage:', e);
    }
    return null;
  }

  addRecentNote(note) {
    if (!note || !note.path) return;
    const path = note.path;
    const title = note.title || path.split('/').pop().replace(/\.md$/, '');
    const folder = (note.folder !== undefined && note.folder !== null)
      ? note.folder
      : (path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '');

    const existingIndex = this.recentNotes.findIndex(r => r.path === path);
    if (existingIndex !== -1) {
      this.recentNotes.splice(existingIndex, 1);
    }

    this.recentNotes.unshift({ path, title, folder });

    if (this.recentNotes.length > 50) {
      this.recentNotes = this.recentNotes.slice(0, 50);
    }

    this.saveRecentNotes();
    this.renderRecentNotes();
  }

  renderRecentNotes() {
    if (!this.recentContainer) return;

    if (!this.recentNotes || this.recentNotes.length === 0) {
      const emptyText = window.I18n ? window.I18n.t('sidebar.emptyRecent') : 'Chưa có ghi chú nào';
      this.recentContainer.innerHTML = `<div class="sidebar-empty" style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 13px;">${emptyText}</div>`;
      return;
    }

    const curPath = appState.currentNote ? appState.currentNote.path : null;

    this.recentContainer.innerHTML = this.recentNotes.map(r => `
      <div class="recent-item ${curPath === r.path ? 'active' : ''}" data-path="${r.path}">
        ${SVG_NOTE}
        <div style="overflow: hidden; text-overflow: ellipsis;">
          <div>${r.title}</div>
          <div style="font-size: 11px; opacity: 0.6;">${r.folder || ''}</div>
        </div>
      </div>
    `).join('');
  }

  async loadRecent() {
    if (!appState.isCoreFeatureEnabled('recent')) return;
    const stored = this.loadRecentNotesFromStorage();
    if (stored !== null) {
      this.recentNotes = stored;
      this.renderRecentNotes();
      return;
    }

    try {
      const data = await ApiClient.searchNotes('', 'title', 25);
      if (data && data.results && data.results.length > 0) {
        this.recentNotes = data.results.map(r => ({
          path: r.path,
          title: r.title,
          folder: r.folder || ''
        }));
        this.saveRecentNotes();
      } else {
        this.recentNotes = [];
      }
    } catch {
      this.recentNotes = [];
    }

    this.renderRecentNotes();
  }

  // --- Tags ---
  async loadTags() {
    if (!this.tagsContainer || !appState.isCoreFeatureEnabled('tags')) return;
    try {
      const data = await ApiClient.fetchTags();
      if (!data || !data.tags) return;

      this.tagsContainer.innerHTML = data.tags.map(t => `
        <div class="tag-item" data-tag="${t.tag}">
          ${SVG_TAG}
          <span>#${t.tag}</span>
          <span class="item-badge">${t.count}</span>
        </div>
      `).join('');
    } catch (e) {
      console.warn('Failed to load tags:', e);
    }
  }
}
