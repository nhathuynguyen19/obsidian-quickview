# Architecture — Obsidian QuickView

## Module map

| Module | Responsibility | Inputs | Outputs | Depends on |
|---|---|---|---|---|
| `bin/obs-view` | CLI launcher, server process management, browser open | CLI args | starts/stops server | `server.py` |
| `server.py` | HTTP server, all API routes | HTTP requests | JSON responses | `core/*` |
| `core/config.py` | Constants only (paths, port, ignore dirs) | — | constants | — |
| `core/parser.py` | Markdown parsing: frontmatter, tags, wikilinks, diacritics | raw markdown text | structured data (dict, list) | — |
| `core/search.py` | FTS5 search engine (title/content/tag/all modes) | query string + mode | ranked results with snippets | `core/parser.py` (remove_diacritics) |
| `core/index.py` | SQLite schema, incremental indexing, backlinks, tree, tags, context, resolve | vault path + db path | search/note/tree/tags/context data | `core/parser.py`, `core/search.py` |
| `core/vault_manager.py` | Vault discovery, config persistence, vault switching | vault paths | vault list / config dict | `core/config.py` |
| `static/app.js` | UI orchestration, lazy assets, sanitized Markdown render, editor lifecycle, lazy tree, search, theme, TOC | user events → API calls | DOM updates | server API (HTTP) |
| `static/app.css` | Dark/light themes, callouts, layout, responsive | — | visual style | — |
| `static/index.html` | Minimal SPA shell; does not eagerly load CM6/highlight.js | — | DOM structure | `app.js`, `app.css` |
| `scripts/cm6-entry.js` | Source of CM6 selection-aware Live Preview and clean EditorState lifecycle | Markdown document | editor extensions | CodeMirror 6 / Lezer |
| `static/cm6-live-preview-runtime.js` | Compatibility runtime for the checked-in prebuilt CM6 bundle | prebuilt CM6 internals | optimized editor API | `cm6-bundle.min.js` |
| `tests/` | Unit tests for indexer, vault manager, markdown render | — | pass/fail | respective modules |

## Dependency rules

```
static/app.js ──HTTP──▶ server.py ──▶ core/index.py ──▶ core/parser.py
                                       │
                                  core/search.py ──▶ core/parser.py
                                       │
                                  core/vault_manager.py ──▶ core/config.py
                                       │
                                  core/index.py ──▶ core/config.py
```

- **UI never imports core directly** — talks via HTTP API only
- **core/config.py** has zero dependencies (底层 foundation)
- **core/parser.py** has zero core dependencies (pure parsing)
- **core/search.py** depends only on parser (for diacritics removal)
- **core/index.py** depends on parser + search
- **core/vault_manager.py** depends only on config
- **server.py** imports all core modules (composition root)

## Public interfaces

### core/parser.py
```python
remove_diacritics(s: str) -> str
extract_frontmatter_and_content(raw: str) -> tuple[dict, str]
extract_tags(frontmatter: dict, content: str) -> list[str]
extract_wikilinks(content: str) -> list[dict]
```

### core/search.py
```python
search(query: str, mode: str, limit: int) -> list[dict]
# mode: 'title' | 'content' | 'all'
# returns: [{path, title, folder, mtime, size, tags, snippet_content}]
```

### core/index.py
```python
update_index(force: bool = False) -> dict
search(query, mode, limit) -> list[dict]
get_note_by_path(path: str, include_raw: bool = True) -> dict | None
get_note_raw(path: str) -> dict | None
get_tree_level(folder: str = "") -> dict
get_note_context(path: str, max_depth: int) -> dict | None
resolve_target(title: str) -> str | None
get_tree() -> dict
get_tags() -> list[dict]
```

### core/vault_manager.py
```python
load_vault_config() -> dict
save_vault_config(default_vault, custom_vaults, first_run_completed) -> dict
get_all_vaults(current_vault) -> list[dict]
get_active_vault_path() -> tuple[str, bool, bool]
get_vault_db_path(vault_path: str) -> str
```

### server.py API
```
GET  /api/search?q=&mode=title|content|all&limit=
GET  /api/note?path=              # reading payload, no duplicate raw source
GET  /api/note/raw?path=          # raw Markdown on demand
GET  /api/context?path=&depth=
GET  /api/resolve?target=
GET  /api/open-file?path=
GET  /api/tree-level?folder=      # lazy tree used by UI
GET  /api/tree                    # compatibility/full-tree endpoint
GET  /api/tags
GET  /api/reindex?force=1
GET  /api/info
GET  /api/vaults
POST /api/vaults/switch  {path, set_default}
POST /api/vaults/add     {path}
POST /api/save           {path, content}
POST /api/git-sync
```

## Where to look for common tasks

| Task | Read these files only |
|---|---|
| Fix search results | `core/search.py`, `core/index.py` |
| Add new API endpoint | `server.py` + relevant `core/*.py` |
| Change UI layout | `static/app.css`, `static/index.html` |
| Add editor feature | `scripts/cm6-entry.js`, `static/app.js` (edit lifecycle) |
| Change vault config | `core/vault_manager.py`, `core/config.py` |
| Fix markdown rendering | `core/parser.py`, `static/app.js` (render section) |
| Add new syntax support | `core/parser.py` + `static/app.js` + `static/app.css` |
| Fix indexing bug | `core/index.py`, `core/parser.py` |

## Notes

- `server.py` at root is the entry point (accepts port arg); actual logic lives in `core/server.py`
- `indexer.py` at root is legacy — logic moved to `core/index.py`
- CodeMirror 6 source is `scripts/cm6-entry.js`; `scripts/build-cm6.js` rebuilds `static/cm6-bundle.min.js`. The checked-in bundle exposes a small compatibility surface consumed by `static/cm6-live-preview-runtime.js`; after a local rebuild the source implementation works directly.
- CM6 and Highlight.js are loaded only when needed. KaTeX remains lazy-loaded.
- Reading and raw-edit note payloads are intentionally separate to avoid holding two copies of every open note.
- Tests: `tests/test_indexer.py`, `tests/test_vault_manager.py`, `tests/test_render_markdown.js`
