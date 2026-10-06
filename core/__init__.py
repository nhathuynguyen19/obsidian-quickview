"""
Core package exports for Obsidian QuickView.
"""

from core.config import DEFAULT_VAULT_PATH, DEFAULT_DB_PATH, DEFAULT_PORT, DEFAULT_HOST, IGNORE_DIRS
from core.parser import (
    remove_diacritics,
    extract_frontmatter_and_content,
    extract_tags,
    extract_wikilinks,
)
from core.search import SearchEngine
from core.index import VaultIndex

__all__ = [
    "DEFAULT_VAULT_PATH",
    "DEFAULT_DB_PATH",
    "DEFAULT_PORT",
    "DEFAULT_HOST",
    "IGNORE_DIRS",
    "remove_diacritics",
    "extract_frontmatter_and_content",
    "extract_tags",
    "extract_wikilinks",
    "SearchEngine",
    "VaultIndex",
]
