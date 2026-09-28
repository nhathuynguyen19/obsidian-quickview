"""
Lightweight HTTP Server for Obsidian QuickView.
Powered exclusively by Python standard library (http.server, urllib, json, os).
Memory footprint: < 20MB.
"""

import os
import sys
import json
import urllib.parse
import mimetypes
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from typing import Optional

from indexer import VaultIndex, DEFAULT_VAULT_PATH, DEFAULT_DB_PATH

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(PROJECT_DIR, "static")


class ObsidianViewHandler(BaseHTTPRequestHandler):
    vault_index: VaultIndex = None  # Will be set by server runner

    def log_message(self, format, *args):
        # Keep terminal output clean and silent during normal operations
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
            # Prevent path traversal
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
            if os.path.commonpath([vault_base, file_path]) == vault_base and os.path.isfile(file_path):
                self._serve_file(file_path)
            else:
                self.send_error(404, "Vault file not found")
            return

        # 4. API Endpoints
        if path == "/api/search":
            q = query.get("q", [""])[0]
            limit = int(query.get("limit", [50])[0])
            results = self.vault_index.search(q, limit=limit)
            self._send_json({"results": results})
            return

        if path == "/api/note":
            rel_path = query.get("path", [""])[0]
            if not rel_path:
                self._send_error(400, "Missing 'path' query parameter")
                return
            note = self.vault_index.get_note_by_path(rel_path)
            if note:
                self._send_json(note)
            else:
                self._send_error(404, f"Note not found: {rel_path}")
            return

        if path == "/api/resolve":
            target = query.get("target", [""])[0]
            if not target:
                self._send_error(400, "Missing 'target' parameter")
                return
            resolved = self.vault_index.resolve_target(target)
            self._send_json({"target": target, "resolved_path": resolved})
            return

        if path == "/api/tree":
            tree = self.vault_index.get_tree()
            self._send_json(tree)
            return

        if path == "/api/tags":
            tags = self.vault_index.get_tags()
            self._send_json({"tags": tags})
            return

        if path == "/api/reindex":
            force = query.get("force", ["0"])[0] in ("1", "true")
            stats = self.vault_index.update_index(force=force)
            self._send_json({"status": "ok", "stats": stats})
            return

        if path == "/api/info":
            self._send_json({
                "vault_path": self.vault_index.vault_path,
                "db_path": self.vault_index.db_path,
            })
            return

        self.send_error(404, "Endpoint not found")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Quick Edit: save updated content back to the note file
        if path == "/api/save":
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self._send_error(400, "Empty payload")
                return

            try:
                body = json.loads(self.rfile.read(content_length).decode("utf-8"))
                rel_path = body.get("path", "").strip()
                content = body.get("content", "")

                if not rel_path:
                    self._send_error(400, "Missing note path")
                    return

                vault_base = self.vault_index.vault_path
                safe_rel = os.path.normpath(rel_path).lstrip(os.sep)
                full_path = os.path.join(vault_base, safe_rel)

                if os.path.commonpath([vault_base, full_path]) != vault_base:
                    self._send_error(403, "Access outside vault forbidden")
                    return

                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                with open(full_path, "w", encoding="utf-8") as f:
                    f.write(content)

                # Re-index single note immediately
                mtime = os.path.getmtime(full_path)
                size = os.path.getsize(full_path)
                conn = self.vault_index._get_connection()
                with conn:
                    self.vault_index._index_single_note(conn, safe_rel, full_path, mtime, size)
                conn.close()

                self._send_json({"status": "saved", "path": safe_rel, "mtime": mtime})
            except Exception as e:
                self._send_error(500, f"Error saving note: {str(e)}")
            return

        self.send_error(404, "Endpoint not found")


def run_server(vault_path: str = DEFAULT_VAULT_PATH, port: int = 8765, host: str = "127.0.0.1"):
    index = VaultIndex(vault_path=vault_path)
    print(f"Checking / updating vault index ({vault_path})...")
    stats = index.update_index()
    print(f"Indexed {stats['total_notes']} notes in {stats['duration_ms']}ms.")

    ObsidianViewHandler.vault_index = index

    server_address = (host, port)
    try:
        httpd = ThreadingHTTPServer(server_address, ObsidianViewHandler)
    except OSError:
        # Port in use: find next available port
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


if __name__ == "__main__":
    port_arg = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    vault_arg = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_VAULT_PATH
    run_server(vault_path=vault_arg, port=port_arg)
