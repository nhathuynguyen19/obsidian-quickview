/**
 * Obsidian QuickView - API Client
 * Clean HTTP communication layer for all backend endpoints.
 */

export class ApiClient {
  static async fetchJson(url, options = {}) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP error! status: ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      console.error(`[ApiClient] Request to ${url} failed:`, e);
      throw e;
    }
  }

  static async fetchNote(path) {
    return this.fetchJson(`/api/note?path=${encodeURIComponent(path)}`);
  }

  static async saveNote(path, content) {
    return this.fetchJson('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content })
    });
  }

  static async searchNotes(query, mode = 'title', limit = 50) {
    return this.fetchJson(
      `/api/search?q=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}&limit=${encodeURIComponent(limit)}`
    );
  }

  static async fetchContext(path, depth = 1) {
    return this.fetchJson(
      `/api/context?path=${encodeURIComponent(path)}&depth=${encodeURIComponent(depth)}`
    );
  }

  static async resolveTarget(target) {
    return this.fetchJson(`/api/resolve?target=${encodeURIComponent(target)}`);
  }

  static async openAttachment(pathOrTarget) {
    try {
      const res = await this.fetchJson(`/api/open-file?path=${encodeURIComponent(pathOrTarget)}`);
      if (!res || res.status !== 'ok') {
        window.open('/vault/' + encodeURI(pathOrTarget), '_blank');
      }
      return res;
    } catch {
      window.open('/vault/' + encodeURI(pathOrTarget), '_blank');
      return null;
    }
  }

  static async fetchTree() {
    return this.fetchJson('/api/tree');
  }

  static async fetchTags() {
    return this.fetchJson('/api/tags');
  }

  static async reindex(force = false) {
    return this.fetchJson(`/api/reindex?force=${force ? '1' : '0'}`);
  }

  static async fetchInfo() {
    return this.fetchJson('/api/info');
  }

  static async fetchVaults() {
    return this.fetchJson('/api/vaults');
  }

  static async switchVault(targetPath, setDefault = true) {
    return this.fetchJson('/api/vaults/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: targetPath, set_default: setDefault })
    });
  }

  static async addCustomVault(targetPath) {
    return this.fetchJson('/api/vaults/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: targetPath })
    });
  }

  static async syncGit() {
    return this.fetchJson('/api/git-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
