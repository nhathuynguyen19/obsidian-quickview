# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other AI agents when working with code in this repository.

## What this repo is

Obsidian QuickView — lightweight Obsidian vault viewer/editor. Python 3.12 HTTP server + static SPA in browser. Zero external runtime dependencies (stdlib + SQLite FTS5 + CodeMirror 6).

## Project layout

```
bin/obs-view           # CLI entry: start/stop/status daemon, open browser
server.py              # root entry point (accepts port arg) → core/server.py
core/
  config.py            # constants only
  parser.py            # frontmatter, tags, wikilinks, diacritics
  search.py            # SearchEngine: SQLite FTS5 title/content/tag search
  index.py             # VaultIndex: SQLite schema, incremental index, note query, tree
  context.py           # ContextBuilder: BFS knowledge graph, ASCII tree, Mermaid, prompt
  git_sync.py          # GitSyncService: safe git commit/pull/push workflow
  vault_manager.py     # VaultManager: vault discovery, config persistence, switching
  routes.py            # HTTP API endpoint handlers (/api/*)
  server.py            # HTTP server + static file streaming
static/
  index.html           # SPA Shell layout
  app.css              # Master CSS manifest (@import modular stylesheets)
  css/                 # Modular CSS (variables, base, sidebar, note, markdown, toc, editor, search, modals)
  js/                  # Modular ES Modules (events, state, api, markdown, toc, editor, hotkeys, search, sidebar, note, vault, settings, app)
tests/                 # test_indexer.py, test_vault_manager.py, test_render_markdown.js
```

## Dependency rule

UI (`static/js/`) → HTTP (`/api/*`) → `core/routes.py` → `core/` domain services → Storage (`SQLite`, Vault `.md`).
Unidirectional flow, no cycles. UI never imports Python modules directly.

## Rules for Agents & Developers (Context-Minimized Engineering)

> [!IMPORTANT]
> **Check `ARCHITECTURE.md` before starting any task!**
> 1. Use the **Feature-to-File Matrix** in `ARCHITECTURE.md` to identify the EXACT files for your task.
> 2. Read and modify ONLY the allowed files. Never read unrelated files into context.
> 3. Do not mutate another component's DOM directly; communicate via `eventBus` or `appState`.
> 4. Keep files under 400-450 lines of code.
> 5. **Definition of Done (DoD)**: When adding a new feature or file:
>    - Add the file to `ARCHITECTURE.md` (Mermaid diagram + Feature-to-File Matrix).
>    - Run `pnpm test:arch` to verify 100% documentation coverage & file length.
>    - Run `pnpm test` to verify all tests pass.

## Run / dev / test

```bash
obs-view                                      # start server + open browser
obs-view --status                             # check server
obs-view --reindex                            # rebuild FTS5 index

pnpm test                                     # run all tests: markdown + python + architecture linter
pnpm test:arch                                # check ARCHITECTURE.md sync & line length limits
pnpm test:markdown                            # run JS render tests (tests/test_render_markdown.js)
python3 -m unittest discover tests            # Python unit tests
pnpm run build:cm6                            # rebuild CodeMirror 6 bundle
```

## Key interfaces

- `core/index.py` public: `update_index`, `get_note_by_path`, `resolve_target`, `get_tree`, `get_tags`, `get_note_context`
- `core/context.py` public: `ContextBuilder.build_context(vault_index, root_path, max_depth)`
- `core/git_sync.py` public: `GitSyncService.sync_vault(vault_path)`, `is_git_repo(vault_path)`
- `core/routes.py` public: `handle_get_route(path, query, vault_index)`, `handle_post_route(path, body, vault_index, on_switch)`
- `static/js/events.js` public: `eventBus.on(event, fn)`, `eventBus.emit(event, data)`
- `static/js/state.js` public: `appState`
- `static/js/api.js` public: `ApiClient`
- `static/js/markdown.js` public: `renderMarkdown(rawMd, currentNotePath)`, `renderLatex(latex, isBlock)`, `loadKatex()`

See `ARCHITECTURE.md` for full module specs, dependency graph, and the complete Feature-to-File Lookup Matrix.
