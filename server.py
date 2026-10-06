#!/usr/bin/env python3
"""
Entry point for Obsidian QuickView HTTP Server.
Delegates to modular core.server package.
"""

import sys
from core.config import DEFAULT_PORT, DEFAULT_VAULT_PATH
from core.server import run_server

if __name__ == "__main__":
    port_arg = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    vault_arg = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_VAULT_PATH
    run_server(vault_path=vault_arg, port=port_arg)
