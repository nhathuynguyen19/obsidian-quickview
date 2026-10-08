"""
Lightweight HTTP request handler and server runner for Obsidian QuickView.
Zero external framework overhead (< 20MB RAM, sub-millisecond response).
"""

import os
import sys
import json
import urllib.parse
import mimetypes
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from typing import Optional

from core.config import DEFAULT_VAULT_PATH, DEFAULT_PORT, DEFAULT_HOST
from core.index import VaultIndex
from core.vault_manager import (
    get_active_vault_path,
    get_vault_db_path,
)
from core.routes import handle_get_route, handle_post_route

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(PROJECT_DIR, "static")


class ObsidianViewHandler(BaseHTTPRequestHandler):
    vault_index: VaultIndex = None

    def log_message(self, format, *args):
        # Keep terminal silent during high-frequency requests
        pass

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, code, message):
        self._send_json({"error": message}, status=code)

    def _serve_file(self, file_path, content_type=None):
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            self.send_error(404, "File Not Found")
            return

        if not content_type:
            content_type, _ = mimetypes.guess_type(file_path)
            content_type = content_type or "application/octet-stream"

        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            # Disable cache for JS/CSS/HTML/JSON to avoid stale code; allow cache for fonts/images
            if file_path.endswith(('.js', '.css', '.html', '.json')):
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.send_header("Pragma", "no-cache")
                self.send_header("Expires", "0")
            else:
                self.send_header("Cache-Control", "public, max-age=3600")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading file: {str(e)}")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 1. Main UI
        if path in ("/", "/index.html"):
            index_path = os.path.join(STATIC_DIR, "index.html")
            self._serve_file(index_path, "text/html; charset=utf-8")
            return

        # 2. Static files
        if path.startswith("/static/"):
            rel = path[len("/static/"):]
            safe_rel = os.path.normpath(rel).lstrip(os.sep)
            file_path = os.path.join(STATIC_DIR, safe_rel)
            if os.path.commonpath([STATIC_DIR, file_path]) == STATIC_DIR:
                self._serve_file(file_path)
            else:
                self.send_error(403, "Forbidden")
            return

        # 3. Vault files (images, attachments, docs)
        if path.startswith("/vault/"):
            rel_unquoted = urllib.parse.unquote(path[len("/vault/"):])
            safe_rel = os.path.normpath(rel_unquoted).lstrip(os.sep)
            vault_base = self.vault_index.vault_path
            file_path = os.path.join(vault_base, safe_rel)

            if not (os.path.commonpath([vault_base, file_path]) == vault_base and os.path.isfile(file_path)):
                resolved = self.vault_index.resolve_target(safe_rel)
                if resolved:
                    resolved_file_path = os.path.join(vault_base, resolved)
                    if os.path.commonpath([vault_base, resolved_file_path]) == vault_base and os.path.isfile(resolved_file_path):
                        file_path = resolved_file_path

            if os.path.commonpath([vault_base, file_path]) == vault_base and os.path.isfile(file_path):
                self._serve_file(file_path)
            else:
                self.send_error(404, "Vault file not found")
            return

        # 4. API Endpoints
        if path.startswith("/api/"):
            res = handle_get_route(path, query, self.vault_index)
            if res is not None:
                status, data = res
                self._send_json(data, status=status)
                return
            self.send_error(404, "Endpoint not found")
            return

        self.send_error(404, "Endpoint not found")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            content_length = int(self.headers.get("Content-Length", 0))
            body = {}
            if content_length > 0:
                try:
                    body = json.loads(self.rfile.read(content_length).decode("utf-8"))
                except Exception:
                    self._send_error(400, "Invalid JSON payload")
                    return

            def on_switch_vault(target_path: str, set_default: bool):
                new_db = get_vault_db_path(target_path)
                new_index = VaultIndex(vault_path=target_path, db_path=new_db)
                stats = new_index.update_index()
                ObsidianViewHandler.vault_index = new_index
                return {
                    "status": "ok",
                    "current_vault": target_path,
                    "current_vault_name": os.path.basename(target_path) or target_path,
                    "stats": stats
                }

            res = handle_post_route(path, body, self.vault_index, on_switch_vault=on_switch_vault)
            if res is not None:
                status, data = res
                self._send_json(data, status=status)
                return
            self.send_error(404, "Endpoint not found")
            return

        self.send_error(404, "Endpoint not found")


def run_server(vault_path: Optional[str] = None, port: int = DEFAULT_PORT, host: str = DEFAULT_HOST):
    """Starts the HTTP server with threading support."""
    if not vault_path:
        active_path, exists, is_first_run = get_active_vault_path()
        vault_path = active_path
    else:
        vault_path = os.path.normpath(os.path.expanduser(vault_path))

    db_path = get_vault_db_path(vault_path)
    index = VaultIndex(vault_path=vault_path, db_path=db_path)
    print(f"Checking / updating vault index ({vault_path})...")
    stats = index.update_index()
    print(f"Indexed {stats.get('total_notes', 0)} notes in {stats.get('duration_ms', 0)}ms.")

    ObsidianViewHandler.vault_index = index

    server_address = (host, port)
    try:
        httpd = ThreadingHTTPServer(server_address, ObsidianViewHandler)
    except OSError:
        for p in range(port + 1, port + 20):
            try:
                httpd = ThreadingHTTPServer((host, p), ObsidianViewHandler)
                port = p
                break
            except OSError:
                continue

    url = f"http://{host}:{port}"
    print(f"Obsidian QuickView server running at: {url}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()
