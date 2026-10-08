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
from core.vault_manager import (
    load_vault_config,
    save_vault_config,
    get_all_vaults,
    get_active_vault_path,
    get_vault_db_path,
)

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

    @staticmethod
    def _safe_join(base_dir, relative_path):
        """Join a client-supplied relative path without escaping base_dir."""
        try:
            base_abs = os.path.abspath(base_dir)
            candidate = os.path.abspath(os.path.join(base_abs, relative_path or ""))
            if os.path.commonpath([base_abs, candidate]) != base_abs:
                return None
            return candidate
        except (ValueError, TypeError):
            return None

    def _serve_file(self, file_path, content_type=None):
        """Serve files in bounded chunks and support a single HTTP byte range.

        Streaming avoids reading large PDFs/videos/attachments fully into Python RAM.
        """
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            self.send_error(404, "File Not Found")
            return

        if not content_type:
            content_type, _ = mimetypes.guess_type(file_path)
            content_type = content_type or "application/octet-stream"

        try:
            file_size = os.path.getsize(file_path)
            start_byte = 0
            end_byte = max(0, file_size - 1)
            status = 200

            range_header = self.headers.get("Range", "")
            if range_header.startswith("bytes=") and file_size > 0:
                range_spec = range_header[6:].split(",", 1)[0].strip()
                try:
                    first, last = range_spec.split("-", 1)
                    if first:
                        start_byte = int(first)
                        end_byte = int(last) if last else file_size - 1
                    elif last:
                        suffix = max(0, int(last))
                        start_byte = max(0, file_size - suffix)
                        end_byte = file_size - 1
                    if start_byte < 0 or start_byte >= file_size or end_byte < start_byte:
                        raise ValueError("invalid range")
                    end_byte = min(end_byte, file_size - 1)
                    status = 206
                except (ValueError, TypeError):
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{file_size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return

            length = 0 if file_size == 0 else (end_byte - start_byte + 1)
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(length))
            self.send_header("Accept-Ranges", "bytes")
            if status == 206:
                self.send_header("Content-Range", f"bytes {start_byte}-{end_byte}/{file_size}")

            # Avoid stale application code while still caching immutable media/fonts.
            if file_path.endswith((".js", ".css", ".html", ".json")):
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.send_header("Pragma", "no-cache")
                self.send_header("Expires", "0")
            else:
                self.send_header("Cache-Control", "public, max-age=3600")
            self.end_headers()

            if length <= 0:
                return

            remaining = length
            with open(file_path, "rb") as f:
                f.seek(start_byte)
                while remaining > 0:
                    chunk = f.read(min(64 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            # Client closed the tab/range request early; this is normal for media.
            return
        except Exception as e:
            try:
                self.send_error(500, f"Error reading file: {str(e)}")
            except Exception:
                pass

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
            rel = urllib.parse.unquote(path[len("/static/"):])
            file_path = self._safe_join(STATIC_DIR, rel)
            if file_path:
                self._serve_file(file_path)
            else:
                self.send_error(403, "Forbidden")
            return

        # 3. Vault files (images, attachments, docs)
        if path.startswith("/vault/"):
            rel_unquoted = urllib.parse.unquote(path[len("/vault/"):])
            vault_base = self.vault_index.vault_path
            file_path = self._safe_join(vault_base, rel_unquoted)

            if not (file_path and os.path.isfile(file_path)):
                resolved = self.vault_index.resolve_target(rel_unquoted)
                file_path = self._safe_join(vault_base, resolved) if resolved else None

            if file_path and os.path.isfile(file_path):
                self._serve_file(file_path)
            else:
                self.send_error(404, "Vault file not found")
            return

        # 4. API Endpoints
        if path == "/api/search":
            q = query.get("q", [""])[0]
            mode = query.get("mode", ["title"])[0]
            limit = int(query.get("limit", [50])[0])
            if not self.vault_index or not os.path.isdir(self.vault_index.vault_path):
                self._send_json({"results": [], "mode": mode})
                return
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
            note = self.vault_index.get_note_by_path(rel_path, include_raw=False)
            if note:
                self._send_json(note)
            else:
                self._send_error(404, f"Note not found: {rel_path}")
            return

        if path == "/api/note/raw":
            rel_path = query.get("path", [""])[0]
            if not rel_path or not rel_path.lower().endswith(".md"):
                self._send_error(400, "Missing or invalid markdown note path")
                return
            raw_note = self.vault_index.get_note_raw(rel_path)
            if raw_note:
                self._send_json(raw_note)
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
                full_check = self._safe_join(self.vault_index.vault_path, rel_path)
                if not (full_check and os.path.isfile(full_check)):
                    resolved = self.vault_index.resolve_target(rel_path)
                    if resolved:
                        rel_path = resolved

            if not rel_path:
                self._send_error(404, "File not found in vault")
                return

            full_path = self._safe_join(self.vault_index.vault_path, rel_path)
            if not full_path or not os.path.isfile(full_path):
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

        if path == "/api/tree-level":
            if not self.vault_index or not os.path.isdir(self.vault_index.vault_path):
                self._send_json({"name": "Vault", "type": "folder", "path": "", "children": []})
                return
            folder = query.get("folder", [""])[0]
            self._send_json(self.vault_index.get_tree_level(folder))
            return

        if path == "/api/tree":
            if not self.vault_index or not os.path.isdir(self.vault_index.vault_path):
                self._send_json({"name": "Vault", "type": "folder", "path": "", "children": {}})
                return
            tree = self.vault_index.get_tree()
            self._send_json(tree)
            return

        if path == "/api/tags":
            if not self.vault_index or not os.path.isdir(self.vault_index.vault_path):
                self._send_json({"tags": []})
                return
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

        if path == "/api/vaults":
            active_vault = self.vault_index.vault_path if self.vault_index else ""
            cfg = load_vault_config()
            vaults = get_all_vaults(active_vault)
            is_first_run = not cfg.get("first_run_completed", False)
            current_exists = os.path.isdir(active_vault) if active_vault else False
            current_name = os.path.basename(active_vault) if active_vault else ""
            self._send_json({
                "current_vault": active_vault,
                "current_vault_name": current_name,
                "current_vault_exists": current_exists,
                "is_first_run": is_first_run,
                "vaults": vaults
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

                if not rel_path.lower().endswith(".md"):
                    self._send_error(400, "Only markdown notes can be saved")
                    return

                vault_base = self.vault_index.vault_path
                safe_rel = os.path.normpath(rel_path).replace("\\", "/").lstrip("/")
                full_path = self._safe_join(vault_base, safe_rel)

                if not full_path:
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

        if path == "/api/vaults/switch":
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self._send_error(400, "Empty payload")
                return

            try:
                body = json.loads(self.rfile.read(content_length).decode("utf-8"))
                target_path = body.get("path", "").strip()
                set_default = body.get("set_default", True)

                if not target_path:
                    self._send_error(400, "Thiếu đường dẫn vault")
                    return

                target_path = os.path.normpath(os.path.expanduser(target_path))
                if not os.path.isdir(target_path):
                    self._send_error(400, f"Thư mục vault không tồn tại hoặc đã bị xóa: {target_path}")
                    return

                # Save persistent configuration
                save_vault_config(
                    default_vault=target_path if set_default else None,
                    first_run_completed=True
                )

                # Initialize index for selected vault
                new_db = get_vault_db_path(target_path)
                new_index = VaultIndex(vault_path=target_path, db_path=new_db)
                stats = new_index.update_index()
                ObsidianViewHandler.vault_index = new_index

                self._send_json({
                    "status": "ok",
                    "current_vault": target_path,
                    "current_vault_name": os.path.basename(target_path) or target_path,
                    "stats": stats
                })
            except Exception as e:
                self._send_error(500, f"Lỗi chuyển vault: {str(e)}")
            return

        if path == "/api/vaults/add":
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self._send_error(400, "Empty payload")
                return

            try:
                body = json.loads(self.rfile.read(content_length).decode("utf-8"))
                target_path = body.get("path", "").strip()
                if not target_path:
                    self._send_error(400, "Thiếu đường dẫn vault")
                    return

                target_path = os.path.normpath(os.path.expanduser(target_path))
                if not os.path.isdir(target_path):
                    self._send_error(400, f"Thư mục không tồn tại: {target_path}")
                    return

                cfg = load_vault_config()
                customs = cfg.get("custom_vaults", [])
                if target_path not in customs:
                    customs.append(target_path)
                    save_vault_config(custom_vaults=customs)

                cur = self.vault_index.vault_path if self.vault_index else target_path
                self._send_json({
                    "status": "ok",
                    "vaults": get_all_vaults(cur)
                })
            except Exception as e:
                self._send_error(500, f"Lỗi thêm vault: {str(e)}")
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
