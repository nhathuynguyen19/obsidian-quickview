/**
 * Obsidian QuickView - Vault Modal Controller
 * Manages vault switching, custom vault paths, and missing vault alerts.
 */

import { eventBus } from './events.js';
import { appState } from './state.js';
import { ApiClient } from './api.js';

export class VaultModalController {
  constructor() {
    this.btnSwitcher = document.getElementById('btn-vault-switcher');
    this.sidebarVaultName = document.getElementById('sidebar-vault-name');
    this.sidebarVaultPath = document.getElementById('sidebar-vault-path');

    this.backdrop = document.getElementById('vault-modal-backdrop');
    this.btnClose = document.getElementById('btn-close-vault-modal');
    this.titleEl = document.getElementById('vault-modal-title');
    this.descEl = document.getElementById('vault-modal-desc');

    this.missingAlert = document.getElementById('vault-missing-alert');
    this.missingMsg = document.getElementById('vault-missing-msg');
    this.itemsList = document.getElementById('vault-items-list');
    this.inputCustom = document.getElementById('input-custom-vault');
    this.btnAddCustom = document.getElementById('btn-add-custom-vault');
    this.addError = document.getElementById('vault-add-error');
    this.chkSetDefault = document.getElementById('chk-set-default-vault');

    this.init();
  }

  init() {
    if (this.btnSwitcher) {
      this.btnSwitcher.addEventListener('click', () => {
        this.open(appState.isCurrentVaultMissing, 'Chuyển đổi Vault Obsidian', 'Chọn vault bạn muốn sử dụng hoặc thêm thư mục mới.');
      });
    }

    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.close());
    }

    if (this.backdrop) {
      this.backdrop.addEventListener('click', (e) => {
        if (e.target === this.backdrop && !appState.isCurrentVaultMissing) {
          this.close();
        }
      });
    }

    if (this.btnAddCustom) {
      this.btnAddCustom.addEventListener('click', () => this.addCustomVault());
    }
  }

  formatDisplayPath(path) {
    if (!path) return '';
    return path.replace(/^\/home\/[^\/]+/, '~');
  }

  renderCards() {
    if (!this.itemsList) return;
    this.itemsList.innerHTML = '';

    if (!appState.knownVaults || appState.knownVaults.length === 0) {
      const emptyMsg = window.I18n
        ? window.I18n.t('vault.emptyVaults')
        : 'Chưa tìm thấy vault nào. Vui lòng thêm đường dẫn bên dưới.';
      this.itemsList.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 13px;">${emptyMsg}</div>`;
      return;
    }

    appState.knownVaults.forEach(vault => {
      const card = document.createElement('div');
      card.className = 'vault-card';
      if (vault.is_current && vault.exists) card.classList.add('active');
      if (!vault.exists) card.classList.add('missing');

      const left = document.createElement('div');
      left.className = 'vault-card-left';

      const icon = document.createElement('div');
      icon.className = 'vault-card-icon';
      icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
      </svg>`;

      const info = document.createElement('div');
      info.className = 'vault-card-info';

      const nameRow = document.createElement('div');
      nameRow.className = 'vault-card-name-row';

      const name = document.createElement('span');
      name.className = 'vault-card-name';
      name.textContent = vault.name;
      nameRow.appendChild(name);

      const pathSpan = document.createElement('span');
      pathSpan.className = 'vault-card-path';
      pathSpan.textContent = this.formatDisplayPath(vault.path);
      pathSpan.title = vault.path;

      info.appendChild(nameRow);
      info.appendChild(pathSpan);
      left.appendChild(icon);
      left.appendChild(info);

      const badges = document.createElement('div');
      badges.className = 'vault-card-badges';

      if (!vault.exists) {
        const badgeMissing = document.createElement('span');
        badgeMissing.className = 'vault-badge badge-missing';
        badgeMissing.textContent = window.I18n ? window.I18n.t('vault.badgeMissing') : 'Đã biến mất';
        badges.appendChild(badgeMissing);
      } else {
        if (vault.is_current) {
          const badgeCur = document.createElement('span');
          badgeCur.className = 'vault-badge badge-current';
          badgeCur.textContent = window.I18n ? window.I18n.t('vault.badgeCurrent') : 'Đang mở';
          badges.appendChild(badgeCur);
        }
        if (vault.is_default) {
          const badgeDef = document.createElement('span');
          badgeDef.className = 'vault-badge badge-default';
          badgeDef.textContent = window.I18n ? window.I18n.t('vault.badgeDefault') : 'Mặc định';
          badges.appendChild(badgeDef);
        }
      }

      const badgeSource = document.createElement('span');
      badgeSource.className = 'vault-badge badge-source';
      badgeSource.textContent = vault.source === 'obsidian'
        ? (window.I18n ? window.I18n.t('vault.badgeSourceObsidian') : 'Obsidian')
        : (window.I18n ? window.I18n.t('vault.badgeSourceCustom') : 'Tùy chọn');
      badges.appendChild(badgeSource);

      card.appendChild(left);
      card.appendChild(badges);

      card.addEventListener('click', () => {
        if (!vault.exists) {
          alert(`⚠️ Thư mục vault không tồn tại trên hệ thống:\n${vault.path}\n\nThư mục này có thể đã bị xóa hoặc di chuyển.`);
          return;
        }
        if (vault.is_current && !appState.isCurrentVaultMissing) {
          this.close();
          return;
        }
        this.switchVault(vault.path, this.chkSetDefault ? this.chkSetDefault.checked : true);
      });

      this.itemsList.appendChild(card);
    });
  }

  open(isMandatory = false, customTitle = null, customDesc = null) {
    if (!this.backdrop) return;
    this.renderCards();

    if (customTitle && this.titleEl) this.titleEl.textContent = customTitle;
    if (customDesc && this.descEl) this.descEl.textContent = customDesc;

    if (isMandatory) {
      if (this.btnClose) this.btnClose.style.display = 'none';
    } else {
      if (this.btnClose) this.btnClose.style.display = 'inline-flex';
    }

    if (this.addError) this.addError.style.display = 'none';
    if (this.inputCustom) this.inputCustom.value = '';

    this.backdrop.classList.add('active');
  }

  close() {
    if (appState.isCurrentVaultMissing) return;
    if (this.backdrop) this.backdrop.classList.remove('active');
  }

  async checkStatus(initialCheck = false) {
    try {
      const data = await ApiClient.fetchVaults();
      if (!data) return;

      const path = data.current_vault || '';
      const name = data.current_vault_name || 'Obsidian';
      const vaults = data.vaults || [];
      const isMissing = !data.current_vault_exists;

      appState.setVaultInfo(path, name, vaults, isMissing);

      if (this.sidebarVaultName) this.sidebarVaultName.textContent = name;
      if (this.sidebarVaultPath) {
        this.sidebarVaultPath.textContent = isMissing ? '⚠️ Không tìm thấy vault' : this.formatDisplayPath(path);
        this.sidebarVaultPath.title = path;
        this.sidebarVaultPath.style.color = isMissing ? '#ef4444' : '';
      }

      if (isMissing) {
        if (this.missingAlert) this.missingAlert.style.display = 'flex';
        if (this.missingMsg) {
          this.missingMsg.textContent = `Thư mục vault không còn tồn tại tại: "${path}". Vui lòng chọn hoặc thêm một vault khác để tiếp tục.`;
        }
        this.open(true, '⚠️ Vault đã biến mất!', 'Vui lòng chọn hoặc thêm một vault còn tồn tại trên máy tính.');
      } else if (data.is_first_run && initialCheck) {
        if (this.missingAlert) this.missingAlert.style.display = 'none';
        this.open(false, 'Chọn Vault Obsidian để bắt đầu', 'Chọn vault bạn muốn mở mặc định trong Obsidian QuickView.');
      } else {
        if (this.missingAlert) this.missingAlert.style.display = 'none';
      }
    } catch (e) {
      console.warn('Failed to check vault status:', e);
    }
  }

  async switchVault(targetPath, setDefault = true) {
    try {
      const data = await ApiClient.switchVault(targetPath, setDefault);
      if (!data || data.status !== 'ok') {
        alert('❌ Không thể chuyển vault: ' + (data?.error || 'Lỗi không xác định'));
        return;
      }

      appState.isCurrentVaultMissing = false;
      this.close();

      // Reset note view
      appState.setCurrentNote(null);
      const emptyState = document.getElementById('empty-state');
      const noteContentWrapper = document.getElementById('note-content-wrapper');
      if (emptyState) emptyState.style.display = 'flex';
      if (noteContentWrapper) noteContentWrapper.style.display = 'none';

      await this.checkStatus(false);
      eventBus.emit('vault:switched', targetPath);
    } catch (e) {
      alert('❌ Lỗi kết nối khi chuyển vault: ' + e.message);
    }
  }

  async addCustomVault() {
    if (!this.inputCustom) return;
    const path = this.inputCustom.value.trim();
    if (!path) {
      if (this.addError) {
        this.addError.textContent = 'Vui lòng nhập đường dẫn thư mục vault!';
        this.addError.style.display = 'block';
      }
      return;
    }

    try {
      const data = await ApiClient.addCustomVault(path);
      if (!data || data.status !== 'ok') {
        if (this.addError) {
          this.addError.textContent = data?.error || 'Thư mục không tồn tại!';
          this.addError.style.display = 'block';
        }
        return;
      }

      await this.switchVault(path, this.chkSetDefault ? this.chkSetDefault.checked : true);
    } catch (e) {
      if (this.addError) {
        this.addError.textContent = 'Lỗi kết nối: ' + e.message;
        this.addError.style.display = 'block';
      }
    }
  }
}
