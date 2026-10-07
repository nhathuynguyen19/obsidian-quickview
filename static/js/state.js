/**
 * Obsidian QuickView - Central Application State
 * Single source of truth for runtime state and navigation history.
 */

import { eventBus } from './events.js';

class StateStore {
  constructor() {
    this.currentNote = null;
    this.isEditing = false;
    this.currentTheme = localStorage.getItem('obs_theme') || 'dark';
    this.currentEditMode = localStorage.getItem('obs_edit_mode') || 'live';
    this.isTocOpen = localStorage.getItem('obs_toc_open') !== 'false';

    this.currentVaultPath = '';
    this.currentVaultName = '';
    this.knownVaults = [];
    this.isCurrentVaultMissing = false;

    // Navigation history
    this.noteHistory = [];
    this.historyIndex = -1;

    // Apply theme immediately
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', this.currentTheme);
    }
  }

  setTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('obs_theme', theme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    eventBus.emit('theme:changed', theme);
  }

  toggleTheme() {
    this.setTheme(this.currentTheme === 'dark' ? 'light' : 'dark');
  }

  setEditMode(mode) {
    this.currentEditMode = mode;
    localStorage.setItem('obs_edit_mode', mode);
    eventBus.emit('editMode:changed', mode);
  }

  setTocOpen(open) {
    this.isTocOpen = open;
    localStorage.setItem('obs_toc_open', String(open));
    eventBus.emit('toc:toggled', open);
  }

  setCurrentNote(note) {
    this.currentNote = note;
    eventBus.emit('note:currentChanged', note);
  }

  setIsEditing(isEditing) {
    this.isEditing = isEditing;
    eventBus.emit('editing:stateChanged', isEditing);
  }

  setVaultInfo(vaultPath, vaultName, knownVaults = [], isMissing = false) {
    this.currentVaultPath = vaultPath;
    this.currentVaultName = vaultName || (vaultPath ? vaultPath.split(/[/\\]/).pop() : '');
    this.knownVaults = knownVaults;
    this.isCurrentVaultMissing = isMissing;
    eventBus.emit('vault:infoChanged', {
      path: this.currentVaultPath,
      name: this.currentVaultName,
      known: this.knownVaults,
      isMissing: this.isCurrentVaultMissing
    });
  }

  // Navigation history operations
  pushHistory(path) {
    if (this.historyIndex >= 0 && this.noteHistory[this.historyIndex] === path) {
      return;
    }
    if (this.historyIndex < this.noteHistory.length - 1) {
      this.noteHistory.splice(this.historyIndex + 1);
    }
    this.noteHistory.push(path);
    this.historyIndex = this.noteHistory.length - 1;
    eventBus.emit('history:changed', {
      canBack: this.historyIndex > 0,
      canForward: this.historyIndex < this.noteHistory.length - 1
    });
  }

  canGoBack() {
    return this.historyIndex > 0;
  }

  canGoForward() {
    return this.historyIndex < this.noteHistory.length - 1;
  }

  goBack() {
    if (this.canGoBack()) {
      this.historyIndex--;
      const path = this.noteHistory[this.historyIndex];
      eventBus.emit('history:changed', {
        canBack: this.canGoBack(),
        canForward: this.canGoForward()
      });
      return path;
    }
    return null;
  }

  goForward() {
    if (this.canGoForward()) {
      this.historyIndex++;
      const path = this.noteHistory[this.historyIndex];
      eventBus.emit('history:changed', {
        canBack: this.canGoBack(),
        canForward: this.canGoForward()
      });
      return path;
    }
    return null;
  }
}

export const appState = new StateStore();
