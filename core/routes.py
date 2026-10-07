"""
HTTP API route handlers for Obsidian QuickView.
Dispatches GET and POST requests for search, notes, context, tree, tags, git-sync, and vaults.
"""

import os
import json
import urllib.parse
import subprocess
from typing import Dict, Any, Tuple, Optional, Callable

from core.vault_manager import (
    load_vault_config,
    save_vault_config,
    get_all_vaults,
    get_vault_db_path,
)
from core.git_sync import GitSyncService


def handle_get_route(
    path: str,
    query: Dict[str, list],
    vault_index: Any
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """
    Handles GET /api/* routes.
    Returns (status_code, json_payload) or None if path is not a handled API endpoint.
    """
    if path == "/api/search":
        q = query.get("q", [""])[0]
        mode = query.get("mode", ["title"])[0]
        limit = int(query.get("limit", [50])[0])
        if not vault_index or not os.path.isdir(vault_index.vault_path):
            return 200, {"results": [], "mode": mode}
        results = vault_index.search(q, mode=mode, limit=limit)
        return 200, {"results": results, "mode": mode}

    if path == "/api/note":
        rel_path = query.get("path", [""])[0]
        if not rel_path:
            return 400, {"error": "Missing 'path' query parameter"}
        if not rel_path.lower().endswith(".md"):
            return 400, {"error": "Chỉ ghi chú markdown (.md) mới được mở trong view note"}
        note = vault_index.get_note_by_path(rel_path)
        if note:
            return 200, note
        return 404, {"error": f"Note not found: {rel_path}"}

    if path == "/api/context":
        rel_path = query.get("path", [""])[0]
        depth = query.get("depth", ["1"])[0]
        if not rel_path:
            return 400, {"error": "Missing 'path' query parameter"}
        try:
            depth_int = int(depth)
        except ValueError:
            depth_int = 1

        ctx = vault_index.get_note_context(rel_path, max_depth=depth_int)
        if ctx:
            return 200, ctx
        return 404, {"error": f"Note not found for context: {rel_path}"}

    if path == "/api/resolve":
        target = query.get("target", [""])[0]
        if not target:
            return 400, {"error": "Missing 'target' parameter"}
        resolved = vault_index.resolve_target(target)
        is_attachment = False
        file_url = None
        if resolved:
            is_attachment = not resolved.lower().endswith(".md")
            full_path = os.path.join(vault_index.vault_path, resolved)
            file_url = "file://" + urllib.parse.quote(full_path)
        return 200, {
            "target": target,
            "resolved_path": resolved,
            "is_attachment": is_attachment,
            "file_url": file_url
        }

    if path == "/api/open-file":
        rel_path = query.get("path", [""])[0]
        target = query.get("target", [""])[0]
        if not rel_path and not target:
            return 400, {"error": "Missing 'path' or 'target' parameter"}
        if not rel_path and target:
            rel_path = vault_index.resolve_target(target)
        elif rel_path:
            full_check = os.path.join(vault_index.vault_path, rel_path)
            if not os.path.isfile(full_check):
                resolved = vault_index.resolve_target(rel_path)
                if resolved:
                    rel_path = resolved

        if not rel_path:
            return 404, {"error": "File not found in vault"}

        full_path = os.path.join(vault_index.vault_path, rel_path)
        if not os.path.isfile(full_path):
            return 404, {"error": "File does not exist on disk"}

        file_url = "file://" + urllib.parse.quote(full_path)
        try:
            subprocess.Popen(
                ["firefox", "--new-tab", file_url],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            return 200, {"status": "ok", "url": file_url}
        except Exception as e:
            return 500, {"error": f"Error launching Firefox: {str(e)}"}

    if path == "/api/tree":
        if not vault_index or not os.path.isdir(vault_index.vault_path):
            return 200, {"name": "Vault", "type": "folder", "path": "", "children": {}}
        return 200, vault_index.get_tree()

    if path == "/api/tags":
        if not vault_index or not os.path.isdir(vault_index.vault_path):
            return 200, {"tags": []}
        return 200, {"tags": vault_index.get_tags()}

    if path == "/api/reindex":
        force = query.get("force", ["0"])[0] in ("1", "true")
        stats = vault_index.update_index(force=force)
        return 200, {"status": "ok", "stats": stats}

    if path == "/api/info":
        return 200, {
            "vault_path": vault_index.vault_path if vault_index else "",
            "db_path": vault_index.db_path if vault_index else "",
        }

    if path == "/api/vaults":
        active_vault = vault_index.vault_path if vault_index else ""
        cfg = load_vault_config()
        vaults = get_all_vaults(active_vault)
        is_first_run = not cfg.get("first_run_completed", False)
        current_exists = os.path.isdir(active_vault) if active_vault else False
        current_name = os.path.basename(active_vault) if active_vault else ""
        return 200, {
            "current_vault": active_vault,
            "current_vault_name": current_name,
            "current_vault_exists": current_exists,
            "is_first_run": is_first_run,
            "vaults": vaults
        }

    return None


def handle_post_route(
    path: str,
    body: Dict[str, Any],
    vault_index: Any,
    on_switch_vault: Optional[Callable[[str, bool], Dict[str, Any]]] = None
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """
    Handles POST /api/* routes.
    Returns (status_code, json_payload) or None if path is not a handled API endpoint.
    """
    if path == "/api/save":
        rel_path = body.get("path", "").strip()
        content = body.get("content", "")

        if not rel_path:
            return 400, {"error": "Missing note path"}

        vault_base = vault_index.vault_path
        safe_rel = os.path.normpath(rel_path).lstrip(os.sep)
        full_path = os.path.join(vault_base, safe_rel)

        if os.path.commonpath([vault_base, full_path]) != vault_base:
            return 403, {"error": "Access outside vault forbidden"}

        try:
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(content)

            # Re-index single note immediately
            mtime = os.path.getmtime(full_path)
            size = os.path.getsize(full_path)
            conn = vault_index._get_connection()
            with conn:
                vault_index._index_single_note(conn, safe_rel, full_path, mtime, size)
            conn.close()

            return 200, {"status": "saved", "path": safe_rel, "mtime": mtime}
        except Exception as e:
            return 500, {"error": f"Error saving note: {str(e)}"}

    if path == "/api/git-sync":
        if not vault_index or not vault_index.vault_path:
            return 400, {"error": "No active vault for git sync"}
        res = GitSyncService.sync_vault(vault_index.vault_path)
        return 200, res

    if path == "/api/vaults/switch":
        target_path = body.get("path", "").strip()
        set_default = body.get("set_default", True)

        if not target_path:
            return 400, {"error": "Thiếu đường dẫn vault"}

        target_path = os.path.normpath(os.path.expanduser(target_path))
        if not os.path.isdir(target_path):
            return 400, {"error": f"Thư mục vault không tồn tại hoặc đã bị xóa: {target_path}"}

        try:
            save_vault_config(
                default_vault=target_path if set_default else None,
                first_run_completed=True
            )

            if on_switch_vault:
                res = on_switch_vault(target_path, set_default)
                return 200, res

            return 200, {
                "status": "ok",
                "current_vault": target_path,
                "current_vault_name": os.path.basename(target_path) or target_path,
            }
        except Exception as e:
            return 500, {"error": f"Lỗi chuyển vault: {str(e)}"}

    if path == "/api/vaults/add":
        target_path = body.get("path", "").strip()
        if not target_path:
            return 400, {"error": "Thiếu đường dẫn vault"}

        target_path = os.path.normpath(os.path.expanduser(target_path))
        if not os.path.isdir(target_path):
            return 400, {"error": f"Thư mục không tồn tại: {target_path}"}

        try:
            cfg = load_vault_config()
            customs = cfg.get("custom_vaults", [])
            if target_path not in customs:
                customs.append(target_path)
                save_vault_config(custom_vaults=customs)

            cur = vault_index.vault_path if vault_index else target_path
            return 200, {
                "status": "ok",
                "vaults": get_all_vaults(cur)
            }
        except Exception as e:
            return 500, {"error": f"Lỗi thêm vault: {str(e)}"}

    return None
