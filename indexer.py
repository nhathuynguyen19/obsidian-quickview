"""
Backward-compatibility adapter for indexer.py.
All logic has been separated into modular files in the `core/` package:
- core/config.py: Constants & configuration
- core/parser.py: Frontmatter, tags, and wikilinks parsing
- core/search.py: FTS5 and SQLite search algorithms
- core/index.py: VaultIndex database and incremental sync
"""

from core import (
    DEFAULT_VAULT_PATH,
    DEFAULT_DB_PATH,
    IGNORE_DIRS,
    remove_diacritics,
    extract_frontmatter_and_content,
    extract_tags,
    extract_wikilinks,
    SearchEngine,
    VaultIndex,
)

__all__ = [
    "DEFAULT_VAULT_PATH",
    "DEFAULT_DB_PATH",
    "IGNORE_DIRS",
    "remove_diacritics",
    "extract_frontmatter_and_content",
    "extract_tags",
    "extract_wikilinks",
    "SearchEngine",
    "VaultIndex",
]
