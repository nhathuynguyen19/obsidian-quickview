"""
Lightweight HTTP request handler and server runner for Obsidian QuickView.
Zero external framework overhead (< 20MB RAM, sub-millisecond response).
"""

import os
import sys
import json
import urllib.parse
import mimetypes
import subprocess
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from typing import Optional

from core.config import DEFAULT_VAULT_PATH, DEFAULT_PORT, DEFAULT_HOST
from core.index import VaultIndex

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
            self.send_header("Content-Disposition", "inline")
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
        if path == "/api/search":
            q = query.get("q", [""])[0]
            mode = query.get("mode", ["title"])[0]
            limit = int(query.get("limit", [50])[0])
            results = self.vault_index.search(q, mode=mode, limit=limit)
            self._send_json({"results": results, "mode": mode})
            return

        if path == "/api/note":
            rel_path = query.get("path", [""])[0]
            if not rel_path:
                self._send_error(400, "Missing 'path' query parameter")
                return
            if not rel_path.lower().endswith(".md"):
                self._send_error(400, "Chỉ ghi chú markdown (.md) mới được mở trong view note")
                return
            note = self.vault_index.get_note_by_path(rel_path)
            if note:
                self._send_json(note)
            else:
                self._send_error(404, f"Note not found: {rel_path}")
            return

        if path == "/api/context":
            rel_path = query.get("path", [""])[0]
            depth = query.get("depth", ["1"])[0]
            if not rel_path:
                self._send_error(400, "Missing 'path' query parameter")
                return
            try:
                depth_int = int(depth)
            except ValueError:
                depth_int = 1

            ctx = self.vault_index.get_note_context(rel_path, max_depth=depth_int)
            if ctx:
                self._send_json(ctx)
            else:
                self._send_error(404, f"Note not found for context: {rel_path}")
            return

        if path == "/api/resolve":
            target = query.get("target", [""])[0]
            if not target:
                self._send_error(400, "Missing 'target' parameter")
                return
            resolved = self.vault_index.resolve_target(target)
            is_attachment = False
            file_url = None
            if resolved:
                is_attachment = not resolved.lower().endswith(".md")
                full_path = os.path.join(self.vault_index.vault_path, resolved)
                file_url = "file://" + urllib.parse.quote(full_path)
            self._send_json({
                "target": target,
                "resolved_path": resolved,
                "is_attachment": is_attachment,
                "file_url": file_url
            })
            return

        if path == "/api/open-file":
            rel_path = query.get("path", [""])[0]
            target = query.get("target", [""])[0]
            if not rel_path and not target:
                self._send_error(400, "Missing 'path' or 'target' parameter")
                return
            if not rel_path and target:
                rel_path = self.vault_index.resolve_target(target)
            elif rel_path:
                full_check = os.path.join(self.vault_index.vault_path, rel_path)
                if not os.path.isfile(full_check):
                    resolved = self.vault_index.resolve_target(rel_path)
                    if resolved:
                        rel_path = resolved

            if not rel_path:
                self._send_error(404, "File not found in vault")
                return

            full_path = os.path.join(self.vault_index.vault_path, rel_path)
            if not os.path.isfile(full_path):
                self._send_error(404, "File does not exist on disk")
                return

            file_url = "file://" + urllib.parse.quote(full_path)
            try:
                subprocess.Popen(
                    ["firefox", "--new-tab", file_url],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                self._send_json({"status": "ok", "url": file_url})
            except Exception as e:
                self._send_error(500, f"Error launching Firefox: {str(e)}")
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

        if path == "/api/git-sync":
            vault_base = self.vault_index.vault_path

            # 1. Check if git repo
            check_git = subprocess.run(
                ["git", "rev-parse", "--is-inside-work-tree"],
                cwd=vault_base,
                capture_output=True,
                text=True
            )
            if check_git.returncode != 0 or check_git.stdout.strip() != "true":
                self._send_json({
                    "status": "error",
                    "stage": "git_init",
                    "message": f"Thư mục Vault ({vault_base}) không phải là một Git repository hợp lệ."
                })
                return

            # 2. Check git user.name and user.email
            name_check = subprocess.run(["git", "config", "user.name"], cwd=vault_base, capture_output=True, text=True)
            email_check = subprocess.run(["git", "config", "user.email"], cwd=vault_base, capture_output=True, text=True)
            user_name = name_check.stdout.strip()
            user_email = email_check.stdout.strip()

            if not user_name or not user_email:
                self._send_json({
                    "status": "error",
                    "stage": "git_config",
                    "message": "Chưa cấu hình Git user.name hoặc user.email (cần chạy: git config --global user.name '...' và git config --global user.email '...')."
                })
                return

            # 3. Check git remote
            remote_check = subprocess.run(["git", "remote", "get-url", "origin"], cwd=vault_base, capture_output=True, text=True)
            if remote_check.returncode != 0 or not remote_check.stdout.strip():
                self._send_json({
                    "status": "error",
                    "stage": "git_remote",
                    "message": "Repository chưa được cấu hình remote 'origin' để push."
                })
                return
            remote_url = remote_check.stdout.strip()

            # 4. Check status changes
            status_proc = subprocess.run(["git", "status", "--porcelain"], cwd=vault_base, capture_output=True, text=True)
            changed_lines = [l for l in status_proc.stdout.splitlines() if l.strip()]
            num_changed = len(changed_lines)

            # Check unpushed commits
            unpushed_proc = subprocess.run(["git", "log", "@{u}..HEAD", "--oneline"], cwd=vault_base, capture_output=True, text=True)
            has_unpushed = unpushed_proc.returncode == 0 and len(unpushed_proc.stdout.strip()) > 0

            if num_changed == 0 and not has_unpushed:
                self._send_json({
                    "status": "noop",
                    "message": "Vault đã đồng bộ hoàn toàn (không có file thay đổi và không có commit chưa push)."
                })
                return

            commit_message = ""
            if num_changed > 0:
                # 5. git add .
                add_proc = subprocess.run(["git", "add", "."], cwd=vault_base, capture_output=True, text=True)
                if add_proc.returncode != 0:
                    self._send_json({
                        "status": "error",
                        "stage": "git_add",
                        "message": f"Lỗi khi thực hiện 'git add .': {add_proc.stderr.strip()}"
                    })
                    return

                # 6. git commit
                import datetime
                now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                commit_message = f"sync: | {num_changed} files changed at {now_str}"

                commit_proc = subprocess.run(
                    ["git", "commit", "-m", commit_message],
                    cwd=vault_base,
                    capture_output=True,
                    text=True
                )
                if commit_proc.returncode != 0:
                    self._send_json({
                        "status": "error",
                        "stage": "git_commit",
                        "message": f"Lỗi khi tạo commit: {commit_proc.stderr.strip()}"
                    })
                    return

            # 7. git push
            branch_proc = subprocess.run(["git", "branch", "--show-current"], cwd=vault_base, capture_output=True, text=True)
            branch = branch_proc.stdout.strip() or "master"

            push_proc = subprocess.run(
                ["git", "push", "origin", branch],
                cwd=vault_base,
                capture_output=True,
                text=True,
                timeout=60
            )

            if push_proc.returncode != 0:
                err_msg = push_proc.stderr.strip() or push_proc.stdout.strip()
                self._send_json({
                    "status": "error",
                    "stage": "git_push",
                    "message": f"Đã add và commit thành công ({commit_message or 'trước đó'}) nhưng KHÔNG thể push lên GitHub ({remote_url}). Chi tiết: {err_msg}"
                })
                return

            self._send_json({
                "status": "ok",
                "stage": "success",
                "files_changed": num_changed,
                "commit_message": commit_message,
                "branch": branch,
                "remote_url": remote_url,
                "message": f"Đã add, commit và push thành công lên {remote_url} ({branch})!"
            })
            return

        self.send_error(404, "Endpoint not found")


def run_server(vault_path: str = DEFAULT_VAULT_PATH, port: int = DEFAULT_PORT, host: str = DEFAULT_HOST):
    """Starts the HTTP server with threading support."""
    index = VaultIndex(vault_path=vault_path)
    print(f"Checking / updating vault index ({vault_path})...")
    stats = index.update_index()
    print(f"Indexed {stats['total_notes']} notes in {stats['duration_ms']}ms.")

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
