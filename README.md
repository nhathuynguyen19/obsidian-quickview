# Obsidian QuickView

The **lightest** Obsidian vault viewer and editor — instant launch for low-spec machines (Intel Celeron, 4GB RAM).

## Real-World Performance

| Metric | Obsidian (Electron) | Obsidian QuickView |
|---|---|---|
| RAM at startup | 400MB – 1GB | **~25MB** (server) + ~70MB (browser tab) |
| CPU on launch | High, sustained | **Negligible** |
| First vault index | 10–30s | **~1–3s** (FTS5) |
| App launch | 5–15s | **< 0.2s** |

> Numbers measured via `ps` — standalone Python server, browser tab loads static HTML/JS, no Electron overhead.

## Know the limits

Obsidian QuickView **does not replace Obsidian**. Use it for:

- ✅ Quick Markdown note viewing
- ✅ Instant full-text vault search
- ✅ Basic editing (write Markdown, `Ctrl+S` save)
- ✅ LaTeX formulas, wikilinks, backlinks, frontmatter

❌ **Still need Obsidian for**:
- Community plugins (Templater, Dataview, Obsidian Charts…)
- Canvas, Graph View, Daily Notes templates
- Obsidian Sync / Remotely Save
- Complex YAML frontmatter editing, core Obsidian features

**Rule**: QuickView for **fast reading/writing**. Obsidian for **deep content work**.

## Features

### FTS5 Instant Search
- Vietnamese diacritic-insensitive: type `12 thi` → finds `12 Thì`
- Separate tabs: **Title / Content / Tag**
- `all` mode: merges title + content results

### CodeMirror 6 — 4 Edit Modes
- **Live**: edit + preview together
- **Source**: raw Markdown only
- **Split**: side-by-side source & preview
- **Preview**: read-only rendered view

### Vault Management
- Switch vault without restart
- Auto-detect Obsidian Desktop vaults + custom paths
- Persistent default vault selection

### Git Sync
- One button: `git add → commit → push origin`
- Pre-checks: valid repo, user.name/email, remote origin

### Context Export + Mermaid
- Export linked-note context as Markdown (depth 1–2)
- Auto-generated Mermaid graph diagram

## Installation

```bash
# Install obs-view command
bash install.sh

# Launch app
obs-view

# Open a specific note
obs-view "12 Thì"

# Rebuild index
obs-view --reindex
```

## Tech Stack

Python 3.12 Standard Library + SQLite FTS5 + CodeMirror 6 + KaTeX — zero external dependencies, fully offline.

## License

MIT — see [LICENSE](LICENSE).
