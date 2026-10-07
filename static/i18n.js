/**
 * Obsidian QuickView - Internationalization (i18n) Module
 * Supports Vietnamese (vi) and English (en).
 * Loads translations from separate JSON files in /static/locales/.
 */
(function () {
  'use strict';

  const SUPPORTED_LANGUAGES = ['vi', 'en'];
  const DEFAULT_LANGUAGE = 'vi';
  const translationsCache = {};
  let currentLanguage = localStorage.getItem('obs_lang') || DEFAULT_LANGUAGE;

  if (!SUPPORTED_LANGUAGES.includes(currentLanguage)) {
    currentLanguage = DEFAULT_LANGUAGE;
  }

  /**
   * Fetch and cache translation JSON for a language
   */
  async function loadTranslation(lang) {
    if (translationsCache[lang]) {
      return translationsCache[lang];
    }
    try {
      const res = await fetch(`/static/locales/${lang}.json?v=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      translationsCache[lang] = data;
      return data;
    } catch (e) {
      console.error(`[i18n] Failed to load translations for ${lang}:`, e);
      return translationsCache[DEFAULT_LANGUAGE] || {};
    }
  }

  /**
   * Get nested value from object using dot notation, e.g. "nav.quickEdit"
   */
  function getNestedValue(obj, path) {
    if (!obj || !path) return null;
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return null;
      cur = cur[p];
    }
    return cur;
  }

  /**
   * Translate a key with optional parameter substitution
   * Usage: I18n.t('nav.copyContext', { depth: 1 })
   */
  function t(key, params = {}) {
    if (!key) return '';

    let text = null;
    const dict = translationsCache[currentLanguage];
    if (dict) {
      text = getNestedValue(dict, key);
    }

    // Fallback to Vietnamese if missing in English
    if (text === null && currentLanguage !== DEFAULT_LANGUAGE && translationsCache[DEFAULT_LANGUAGE]) {
      text = getNestedValue(translationsCache[DEFAULT_LANGUAGE], key);
    }

    if (text === null || text === undefined) {
      return key;
    }

    if (typeof text !== 'string') {
      return String(text);
    }

    // Replace {placeholder} with params
    if (params && Object.keys(params).length > 0) {
      text = text.replace(/\{(\w+)\}/g, (match, paramName) => {
        return params[paramName] !== undefined ? params[paramName] : match;
      });
    }

    return text;
  }

  /**
   * Automatically apply translations to DOM elements with data-i18n attributes
   */
  function applyTranslations() {
    // 1. Text or HTML Content
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      const val = t(key);
      if (val !== null && val !== undefined) {
        if (el.dataset.i18nHtml === 'true') {
          el.innerHTML = val;
        } else {
          el.textContent = val;
        }
      }
    });

    // 2. Titles / Tooltips
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.dataset.i18nTitle;
      const val = t(key);
      if (val !== null && val !== undefined) {
        el.title = val;
      }
    });

    // 3. Input Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      const val = t(key);
      if (val !== null && val !== undefined) {
        el.placeholder = val;
      }
    });

    // 4. Aria Labels
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const key = el.dataset.i18nAria;
      const val = t(key);
      if (val !== null && val !== undefined) {
        el.setAttribute('aria-label', val);
      }
    });

    // Update document html lang
    document.documentElement.setAttribute('lang', currentLanguage);
  }

  /**
   * Change current language, persist choice, and refresh UI
   */
  async function setLanguage(lang) {
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      lang = DEFAULT_LANGUAGE;
    }
    currentLanguage = lang;
    localStorage.setItem('obs_lang', lang);

    await loadTranslation(lang);
    applyTranslations();

    // Broadcast event for custom UI components to re-render
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
  }

  /**
   * Get currently active language code
   */
  function getLanguage() {
    return currentLanguage;
  }

  let initPromise = null;

  /**
   * Initialize i18n system
   */
  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      // Load current language and preload the other for instantaneous switching
      await loadTranslation(currentLanguage);
      applyTranslations();

      const otherLang = currentLanguage === 'vi' ? 'en' : 'vi';
      loadTranslation(otherLang).catch(() => {});
    })();
    return initPromise;
  }

  // Auto-init on script load
  init();

  window.I18n = {
    init,
    t,
    setLanguage,
    getLanguage,
    applyTranslations,
    SUPPORTED_LANGUAGES
  };
})();
