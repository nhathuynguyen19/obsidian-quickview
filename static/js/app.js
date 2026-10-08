/**
 * Obsidian QuickView - Client Bootstrap & Orchestration
 * Blazing fast, modular, zero external runtime bloat.
 */

import { eventBus } from './events.js';
import { appState } from './state.js';
import { loadKatex } from './markdown.js';
import { TocController } from './toc.js';
import { EditorController } from './editor.js';
import { hotkeysManager } from './hotkeys.js';
import { SearchModalController } from './search.js';
import { SidebarController } from './sidebar.js';
import { NoteViewerController } from './note.js';
import { VaultModalController } from './vault.js';
import { SettingsModalController } from './settings.js';
import { CoreSettingsController } from './core_settings.js';

// Configure Marked.js link renderer and syntax highlighting
if (typeof marked !== 'undefined') {
  const renderer = {
    link(href, title, text) {
      let linkHref = typeof href === 'object' && href ? href.href : href;
      let linkTitle = typeof href === 'object' && href ? href.title : title;
      let linkText = typeof href === 'object' && href ? href.text : text;

      const titleAttr = linkTitle ? ` title="${linkTitle}"` : '';
      if (linkHref && linkHref.startsWith('#')) {
        return `<a href="${linkHref}"${titleAttr}>${linkText}</a>`;
      }
      return `<a href="${linkHref}" target="_blank" rel="noopener noreferrer"${titleAttr}>${linkText}</a>`;
    }
  };

  if (typeof marked.use === 'function') {
    marked.use({ renderer });
  }

  marked.setOptions({
    gfm: true,
    breaks: true,
    highlight: function (code, lang) {
      if (typeof hljs !== 'undefined') {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        try {
          return hljs.highlight(code, { language }).value;
        } catch (_) {}
      }
      return code;
    }
  });
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize modular controllers
  const sidebar = new SidebarController();
  const noteViewer = new NoteViewerController();
  const editor = new EditorController();
  const toc = new TocController();
  const search = new SearchModalController();
  const vault = new VaultModalController();
  const settings = new SettingsModalController();
  const coreSettings = new CoreSettingsController();

  // Wire TOC with CodeMirror instance once editor is started
  eventBus.on('editing:stateChanged', () => {
    toc.setEditorInstance(editor.getInstance());
  });

  // Wire tag search from note pills
  eventBus.on('search:tag', (tag) => {
    search.open('#' + tag, 'title');
  });

  // Wire vault switcher with sidebar reload
  eventBus.on('vault:switched', () => {
    sidebar.loadAll();
  });

  // Register hotkey actions
  hotkeysManager.registerActionHandler('toggle_sidebar', (e) => {
    if (e) e.preventDefault();
    sidebar.toggle();
    return true;
  });

  hotkeysManager.registerActionHandler('search_title', (e) => {
    if (e) e.preventDefault();
    search.open('', 'title');
    return true;
  });

  hotkeysManager.registerActionHandler('search_content', (e) => {
    if (e) e.preventDefault();
    search.open('', 'content');
    return true;
  });

  hotkeysManager.registerActionHandler('toggle_toc', (e) => {
    if (e) e.preventDefault();
    appState.setTocOpen(!appState.isTocOpen);
    return true;
  });

  hotkeysManager.registerActionHandler('toggle_theme', (e) => {
    if (e) e.preventDefault();
    appState.toggleTheme();
    return true;
  });

  hotkeysManager.registerActionHandler('history_back', (e) => {
    if (e) e.preventDefault();
    const prev = appState.goBack();
    if (prev) noteViewer.loadNote(prev, false);
    return true;
  });

  hotkeysManager.registerActionHandler('history_forward', (e) => {
    if (e) e.preventDefault();
    const next = appState.goForward();
    if (next) noteViewer.loadNote(next, false);
    return true;
  });

  hotkeysManager.registerActionHandler('quick_edit', (e) => {
    if (e) e.preventDefault();
    if (!appState.isEditing) editor.startEditing();
    return true;
  });

  hotkeysManager.registerActionHandler('save_note', (e) => {
    if (e) e.preventDefault();
    if (appState.isEditing) editor.save();
    return true;
  });

  hotkeysManager.registerActionHandler('cancel_edit', (e) => {
    if (e) e.preventDefault();
    if (appState.isEditing) editor.cancelEditing();
    return true;
  });

  hotkeysManager.registerActionHandler('copy_md', (e) => {
    if (e) e.preventDefault();
    noteViewer.copyMarkdown();
    return true;
  });

  hotkeysManager.registerActionHandler('copy_context', (e) => {
    if (e) e.preventDefault();
    noteViewer.copyContext();
    return true;
  });

  hotkeysManager.registerActionHandler('open_obsidian', (e) => {
    if (e) e.preventDefault();
    noteViewer.openObsidian();
    return true;
  });

  hotkeysManager.registerActionHandler('push_vault', (e) => {
    if (e) e.preventDefault();
    noteViewer.syncVault();
    return true;
  });

  hotkeysManager.registerActionHandler('open_settings', (e) => {
    if (e) e.preventDefault();
    settings.open();
    return true;
  });

  hotkeysManager.setSnippetInsertHandler((snip) => {
    editor.insertSnippet(snip.text);
  });

  // Re-sync dynamic UI elements on language change
  window.addEventListener('languageChanged', () => {
    settings.updateLanguageUI();
    noteViewer.updateContextBtnText();
    vault.renderCards();
    toc.generate();
    sidebar.renderRecentNotes();
    settings.renderHotkeys();
    settings.renderSnippets();
  });

  // Initialize i18n
  if (window.I18n) {
    await window.I18n.init();
    settings.updateLanguageUI();
    noteViewer.updateContextBtnText();
  }

  // Load vault status and sidebar
  await vault.checkStatus(true);
  await sidebar.loadAll();

  // Load initial note from URL ?path=... if provided
  const urlParams = new URLSearchParams(window.location.search);
  const initialPath = urlParams.get('path');
  if (initialPath) {
    noteViewer.loadNote(initialPath);
  }
});
