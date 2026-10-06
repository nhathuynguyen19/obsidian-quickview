"""
Core Configuration and Constants for Obsidian QuickView.
"""

import os

DEFAULT_VAULT_PATH = "/home/huy/mygit/obsidian"
DEFAULT_DB_PATH = os.path.expanduser("~/.cache/obsidian-quickview/index.db")
DEFAULT_PORT = 8765
DEFAULT_HOST = "127.0.0.1"

IGNORE_DIRS = {
    ".git",
    ".obsidian",
    ".trash",
    ".smart-env",
    ".copilot-index",
    ".opencode",
    ".agents",
    ".claude",
    ".copilot",
    "node_modules",
    "__pycache__",
}
