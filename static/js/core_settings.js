/**
 * Obsidian QuickView - Core Settings Controller
 * Manages toggling of Core Features: Folders, Recent, Tags, and Outline.
 * Ensures toggled-off features are hidden from the UI and do not run in the background.
 */

import { eventBus } from './events.js';
import { appState } from './state.js';

export class CoreSettingsController {
  constructor() {
    this.toggles = {
      folders: document.getElementById('toggle-core-folders'),
      recent: document.getElementById('toggle-core-recent'),
      tags: document.getElementById('toggle-core-tags'),
      outline: document.getElementById('toggle-core-outline')
    };

    this.init();
  }

  init() {
    // Bind toggle change listeners
    Object.keys(this.toggles).forEach(feature => {
      const toggle = this.toggles[feature];
      if (toggle) {
        toggle.addEventListener('change', () => {
          appState.setCoreFeature(feature, toggle.checked);
        });
      }
    });

    // Sync toggle switch states
    eventBus.on('settings:opened', () => this.syncUI());
    eventBus.on('settings:core_changed', () => this.syncUI());

    this.syncUI();
  }

  syncUI() {
    Object.keys(this.toggles).forEach(feature => {
      const toggle = this.toggles[feature];
      if (toggle) {
        toggle.checked = appState.isCoreFeatureEnabled(feature);
      }
    });
  }
}
