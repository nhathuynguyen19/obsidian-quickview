/**
 * Obsidian QuickView - Hotkeys & Snippets System
 * Handles keyboard combinations, conflict detection, snippets, and action dispatching.
 */

import { eventBus } from './events.js';

export const DEFAULT_HOTKEYS = {
  toggle_sidebar: ['Ctrl+\\'],
  search_title: ['Ctrl+K', 'Ctrl+O'],
  search_content: ['Ctrl+Shift+K', 'Ctrl+Shift+F'],
  toggle_toc: ['Ctrl+Shift+O'],
  toggle_theme: ['Alt+Shift+D'],
  history_back: ['Alt+ArrowLeft'],
  history_forward: ['Alt+ArrowRight'],
  quick_edit: ['Ctrl+E'],
  save_note: ['Ctrl+S'],
  cancel_edit: ['Escape'],
  copy_md: ['Alt+C'],
  copy_context: ['Alt+Shift+C'],
  open_obsidian: ['Alt+O'],
  push_vault: ['Ctrl+Shift+G'],
  open_settings: ['Ctrl+,']
};

export const DEFAULT_SNIPPETS = [
  {
    id: 'snip_h3',
    name: 'Heading 3',
    text: '### ',
    hotkeys: ['Alt+3']
  },
  {
    id: 'snip_task',
    name: 'Task Box',
    text: '- [ ] ',
    hotkeys: ['Alt+X']
  },
  {
    id: 'snip_callout',
    name: 'Callout Note',
    text: '> [!NOTE]\n> ',
    hotkeys: ['Alt+N']
  }
];

export const HOTKEY_ACTIONS = [
  { id: 'toggle_sidebar' },
  { id: 'search_title' },
  { id: 'search_content' },
  { id: 'toggle_toc' },
  { id: 'toggle_theme' },
  { id: 'history_back' },
  { id: 'history_forward' },
  { id: 'quick_edit' },
  { id: 'save_note' },
  { id: 'cancel_edit' },
  { id: 'copy_md' },
  { id: 'copy_context' },
  { id: 'open_obsidian' },
  { id: 'push_vault' },
  { id: 'open_settings' }
];

export class HotkeysManager {
  constructor() {
    this.customHotkeys = this.loadStoredHotkeys();
    this.customSnippets = this.loadStoredSnippets();
    this.actionHandlers = {};
    this.snippetInsertHandler = null;
    this.activeRecording = null; // null or { type, id }

    this.isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

    this.init();
  }

  init() {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  registerActionHandler(actionId, handler) {
    this.actionHandlers[actionId] = handler;
  }

  setSnippetInsertHandler(handler) {
    this.snippetInsertHandler = handler;
  }

  loadStoredHotkeys() {
    try {
      const raw = localStorage.getItem('obs_custom_hotkeys');
      if (raw) {
        const parsed = JSON.parse(raw);
        const merged = {};
        for (const act of HOTKEY_ACTIONS) {
          merged[act.id] = Array.isArray(parsed[act.id]) ? parsed[act.id] : [...DEFAULT_HOTKEYS[act.id]];
        }
        return merged;
      }
    } catch (e) {
      console.warn('Failed to load custom hotkeys:', e);
    }
    const cloned = {};
    for (const act of HOTKEY_ACTIONS) {
      cloned[act.id] = [...DEFAULT_HOTKEYS[act.id]];
    }
    return cloned;
  }

  saveStoredHotkeys() {
    try {
      localStorage.setItem('obs_custom_hotkeys', JSON.stringify(this.customHotkeys));
    } catch (e) {
      console.warn('Failed to save custom hotkeys:', e);
    }
  }

  loadStoredSnippets() {
    try {
      const raw = localStorage.getItem('obs_custom_snippets');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load custom snippets:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_SNIPPETS));
  }

  saveStoredSnippets() {
    try {
      localStorage.setItem('obs_custom_snippets', JSON.stringify(this.customSnippets));
    } catch (e) {
      console.warn('Failed to save custom snippets:', e);
    }
  }

  normalizeKeyComboFromEvent(e) {
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      return null;
    }

    const parts = [];
    if (e.ctrlKey || (this.isMac && e.metaKey)) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (!this.isMac && e.metaKey) parts.push('Meta');

    let key = e.key;
    if (key === ' ') {
      key = 'Space';
    } else if (key === 'Escape' || key === 'Esc') {
      key = 'Escape';
    } else if (key === 'Enter') {
      key = 'Enter';
    } else if (key === 'Tab') {
      key = 'Tab';
    } else if (key === 'Backspace') {
      key = 'Backspace';
    } else if (key === 'Delete') {
      key = 'Delete';
    } else if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
      // standard Arrow keys preserved
    } else if (e.code && e.code.startsWith('Key')) {
      key = e.code.slice(3).toUpperCase();
    } else if (e.code && e.code.startsWith('Digit')) {
      key = e.code.slice(5);
    } else if (e.code === 'Backslash') {
      key = '\\';
    } else if (e.code === 'Slash') {
      key = '/';
    } else if (e.code === 'Comma') {
      key = ',';
    } else if (e.code === 'Period') {
      key = '.';
    } else if (key.length === 1) {
      key = key.toUpperCase();
    }

    parts.push(key);
    return parts.join('+');
  }

  findHotkeyConflict(combo, targetType, targetId) {
    if (!combo) return null;
    for (const [actionId, hotkeys] of Object.entries(this.customHotkeys)) {
      if (targetType === 'button' && targetId === actionId) continue;
      if (Array.isArray(hotkeys) && hotkeys.includes(combo)) {
        return {
          type: 'button',
          id: actionId,
          name: window.I18n ? window.I18n.t(`hotkeys.actions.${actionId}`) : actionId
        };
      }
    }

    for (const snip of this.customSnippets) {
      if (targetType === 'snippet' && targetId === snip.id) continue;
      if (Array.isArray(snip.hotkeys) && snip.hotkeys.includes(combo)) {
        return {
          type: 'snippet',
          id: snip.id,
          name: snip.name || snip.id
        };
      }
    }

    return null;
  }

  handleKeyDown(e) {
    // If currently recording hotkey in settings modal, let recorder handle it
    if (this.activeRecording) {
      return;
    }

    const combo = this.normalizeKeyComboFromEvent(e);
    if (!combo) return;

    // Check custom hotkey actions
    for (const [actionId, combos] of Object.entries(this.customHotkeys)) {
      if (Array.isArray(combos) && combos.includes(combo)) {
        if (this.actionHandlers[actionId]) {
          const handled = this.actionHandlers[actionId](e);
          if (handled) return;
        }
      }
    }

    // Check snippets
    for (const snip of this.customSnippets) {
      if (Array.isArray(snip.hotkeys) && snip.hotkeys.includes(combo)) {
        if (this.snippetInsertHandler) {
          e.preventDefault();
          this.snippetInsertHandler(snip);
          return;
        }
      }
    }
  }
}

export const hotkeysManager = new HotkeysManager();
