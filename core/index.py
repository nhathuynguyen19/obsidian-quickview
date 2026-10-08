"""
Vault Index Manager: handles SQLite schema, incremental file scanning, note resolution, and backlinks.
"""

import os
import time
import json
import sqlite3
from typing import Dict, List, Any, Optional

from core.config import DEFAULT_VAULT_PATH, DEFAULT_DB_PATH, IGNORE_DIRS
from core.parser import (
    extract_frontmatter_and_content,
    extract_tags,
    extract_wikilinks,
    remove_diacritics,
)
from core.search import SearchEngine


class VaultIndex:
    """Manages SQLite database for vault notes, attachments, and links."""

    def __init__(self, vault_path: str = DEFAULT_VAULT_PATH, db_path: str = DEFAULT_DB_PATH):
        self.vault_path = os.path.abspath(vault_path)
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()
        self.search_engine = SearchEngine(self._get_connection)

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _safe_note_path(self, rel_path: str) -> Optional[str]:
        """Resolve a vault-relative path without allowing path traversal."""
        try:
            full_path = os.path.abspath(os.path.join(self.vault_path, rel_path))
            if os.path.commonpath([self.vault_path, full_path]) != self.vault_path:
                return None
            return full_path
        except (ValueError, TypeError):
            return None

    def _init_db(self):
        with self._get_connection() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("PRAGMA synchronous = NORMAL")
            conn.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
            conn.execute("""CREATE TABLE IF NOT EXISTS notes (
                path TEXT PRIMARY KEY, title TEXT, title_norm TEXT, folder TEXT,
                mtime REAL, size INTEGER, tags TEXT, aliases TEXT, frontmatter TEXT
            )""")
            try:
                conn.execute("ALTER TABLE notes ADD COLUMN title_norm TEXT")
            except sqlite3.OperationalError:
                pass
            conn.execute("CREATE INDEX IF NOT EXISTS idx_notes_title_norm ON notes (title_norm)")
            conn.execute("CREATE TABLE IF NOT EXISTS links (source_path TEXT, target_title TEXT, anchor TEXT, is_embed INTEGER)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_links_target ON links (target_title)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_links_source ON links (source_path)")
            conn.execute("CREATE TABLE IF NOT EXISTS attachments (filename TEXT PRIMARY KEY, path TEXT, mtime REAL)")
            conn.execute('CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(path UNINDEXED, title, tags, content, tokenize = "unicode61 remove_diacritics 2")')

    def update_index(self, force: bool = False) -> Dict[str, int]:
        """Incremental update: scans vault and updates modified/new files."""
        t0 = time.time()
        conn = self._get_connection()

        if not os.path.isdir(self.vault_path):
            conn.close()
            return {
                "total_notes": 0,
                "added_or_updated": 0,
                "deleted": 0,
                "duration_ms": int((time.time() - t0) * 1000),
                "error": "Vault path does not exist"
            }

        if force:
            with conn:
                for tbl in ("notes", "links", "attachments", "notes_fts"):
                    conn.execute(f"DELETE FROM {tbl}")

        cursor = conn.cursor()
        cursor.execute("SELECT path, mtime FROM notes")
        existing_notes = {row["path"]: row["mtime"] for row in cursor.fetchall()}

        cursor.execute("SELECT filename, mtime FROM attachments")
        existing_attachments = {row["filename"]: row["mtime"] for row in cursor.fetchall()}

        current_notes, current_attachments = set(), set()
        added_or_updated, deleted_notes, batch_counter = 0, 0, 0
        conn.execute("BEGIN TRANSACTION")

        for root, dirs, files in os.walk(self.vault_path):
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith(".")]
            for file_name in files:
                if file_name.startswith("."):
                    continue
                full_path = os.path.join(root, file_name)
                rel_path = os.path.relpath(full_path, self.vault_path)
                try:
                    mtime, size = os.path.getmtime(full_path), os.path.getsize(full_path)
                except OSError:
                    continue

                if file_name.endswith(".md"):
                    current_notes.add(rel_path)
                    prev_mtime = existing_notes.get(rel_path)
                    if prev_mtime is None or abs(prev_mtime - mtime) > 0.001:
                        self._index_single_note(conn, rel_path, full_path, mtime, size)
                        added_or_updated += 1
                        batch_counter += 1
                        if batch_counter % 300 == 0:
                            conn.commit()
                            conn.execute("BEGIN TRANSACTION")
                else:
                    current_attachments.add(file_name)
                    prev_mtime = existing_attachments.get(file_name)
                    if prev_mtime is None or abs(prev_mtime - mtime) > 0.001:
                        conn.execute("INSERT OR REPLACE INTO attachments VALUES (?, ?, ?)", (file_name, rel_path, mtime))

        for removed_path in set(existing_notes.keys()) - current_notes:
            conn.execute("DELETE FROM notes WHERE path = ?", (removed_path,))
            conn.execute("DELETE FROM links WHERE source_path = ?", (removed_path,))
            conn.execute("DELETE FROM notes_fts WHERE path = ?", (removed_path,))
            deleted_notes += 1

        for removed_att in set(existing_attachments.keys()) - current_attachments:
            conn.execute("DELETE FROM attachments WHERE filename = ?", (removed_att,))

        conn.commit()
        conn.close()
        return {"total_notes": len(current_notes), "updated": added_or_updated, "deleted": deleted_notes, "duration_ms": round((time.time() - t0) * 1000, 2)}

    def _index_single_note(self, conn: sqlite3.Connection, rel_path: str, full_path: str, mtime: float, size: int):
        """Parse frontmatter, tags, links, and insert into SQLite & FTS5."""
        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                raw_text = f.read()
        except Exception:
            raw_text = ""

        title = os.path.splitext(os.path.basename(rel_path))[0]
        title_norm = remove_diacritics(title).lower()
        folder = os.path.dirname(rel_path) or "/"

        frontmatter, content = extract_frontmatter_and_content(raw_text)
        tags_str = " ".join(extract_tags(frontmatter, content))
        aliases = frontmatter.get("aliases", [])
        aliases_str = " ".join([str(a) for a in (aliases if isinstance(aliases, list) else [aliases])])

        conn.execute("DELETE FROM notes WHERE path = ?", (rel_path,))
        conn.execute("DELETE FROM links WHERE source_path = ?", (rel_path,))
        conn.execute("DELETE FROM notes_fts WHERE path = ?", (rel_path,))
        conn.execute("INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (rel_path, title, title_norm, folder, mtime, size, tags_str, aliases_str, json.dumps(frontmatter, ensure_ascii=False)))
        for link in extract_wikilinks(raw_text):
            conn.execute("INSERT INTO links VALUES (?, ?, ?, ?)", (rel_path, link["target"], link["anchor"], 1 if link["is_embed"] else 0))
        conn.execute("INSERT INTO notes_fts VALUES (?, ?, ?, ?)", (rel_path, title, tags_str, content))

    def search(self, query: str, mode: str = "title", limit: int = 50) -> List[Dict[str, Any]]:
        """Delegates search to the SearchEngine module."""
        return self.search_engine.search(query, mode=mode, limit=limit)

    def get_note_by_path(self, rel_path: str, include_raw: bool = True) -> Optional[Dict[str, Any]]:
        """Get full note content, metadata, and backlinks."""
        full_path = self._safe_note_path(rel_path)
        if not full_path or not os.path.exists(full_path):
            resolved = self.resolve_target(rel_path)
            if resolved:
                full_path = self._safe_note_path(resolved)
                rel_path = resolved
            if not full_path or not os.path.exists(full_path):
                return None

        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                raw_content = f.read()
            mtime, size = os.path.getmtime(full_path), os.path.getsize(full_path)
        except Exception:
            return None

        title = os.path.splitext(os.path.basename(rel_path))[0]
        frontmatter, content = extract_frontmatter_and_content(raw_content)
        tags = extract_tags(frontmatter, content)

        try:
            with self._get_connection() as conn_check:
                cur = conn_check.cursor()
                cur.execute("SELECT mtime FROM notes WHERE path = ?", (rel_path,))
                r = cur.fetchone()
                if not r or abs(r["mtime"] - mtime) > 0.001:
                    self._index_single_note(conn_check, rel_path, full_path, mtime, size)
                    conn_check.commit()
        except Exception:
            pass

        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT n.path, n.title, n.folder
            FROM links l
            JOIN notes n ON l.source_path = n.path
            WHERE (l.target_title = ? OR l.target_title = ?)
            ORDER BY n.title ASC
        """, (title, rel_path))
        backlinks = [dict(r) for r in cursor.fetchall()]
        conn.close()

        res = {
            "path": rel_path,
            "title": title,
            "folder": os.path.dirname(rel_path) or "/",
            "mtime": mtime,
            "size": size,
            "frontmatter": frontmatter,
            "tags": tags,
            "content": content,
            "backlinks": backlinks,
        }
        if include_raw:
            res["raw_content"] = raw_content
        return res

    def get_note_raw(self, rel_path: str) -> Optional[Dict[str, Any]]:
        """Get raw note content without metadata overhead."""
        full_path = self._safe_note_path(rel_path)
        if not full_path or not os.path.isfile(full_path):
            return None
        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                raw_content = f.read()
            return {"path": rel_path, "raw_content": raw_content}
        except Exception:
            return None

    def resolve_target(self, target_title: str) -> Optional[str]:
        """Resolve a wikilink target (by note title, path, or attachment filename) to its relative path."""
        conn = self._get_connection()
        cursor = conn.cursor()

        clean_target = target_title.strip()
        if "#" in clean_target:
            clean_target = clean_target.split("#", 1)[0].strip()

        target_norm = clean_target
        base_filename = os.path.basename(target_norm)
        _, ext = os.path.splitext(base_filename)

        if ext and ext.lower() != ".md":
            cursor.execute("SELECT path FROM attachments WHERE lower(filename) = lower(?) OR lower(filename) = lower(?) OR lower(path) = lower(?) LIMIT 1", (target_norm, base_filename, target_norm))
            row = cursor.fetchone()
            if row:
                conn.close()
                return row["path"]

        target_norm_md = target_norm if target_norm.endswith(".md") else (target_norm + ".md")
        cursor.execute("SELECT path FROM notes WHERE path = ? OR path = ? LIMIT 1", (target_norm, target_norm_md))
        row = cursor.fetchone()
        if row:
            conn.close()
            return row["path"]

        base_title = os.path.splitext(base_filename)[0]
        cursor.execute("SELECT path FROM notes WHERE lower(title) = lower(?) LIMIT 1", (base_title,))
        row = cursor.fetchone()
        if row:
            conn.close()
            return row["path"]

        cursor.execute("SELECT path FROM attachments WHERE lower(filename) = lower(?) OR lower(filename) = lower(?) OR lower(path) = lower(?) OR lower(filename) = lower(? || '.pdf') LIMIT 1", (target_norm, base_filename, target_norm, base_title))
        row = cursor.fetchone()
        conn.close()
        if row:
            return row["path"]

        # 5. On-disk fallback for files created manually in folders before reindexing
        for cand in (target_norm, target_norm_md):
            cand_full = self._safe_note_path(cand)
            if cand_full and os.path.isfile(cand_full):
                return self._index_and_return_rel(cand_full, base_filename)

        if "/" not in target_norm and "\\" not in target_norm:
            cand_names = {base_filename.lower(), (base_title + ".md").lower()}
            for root, dirs, files in os.walk(self.vault_path):
                dirs[:] = [d for d in dirs if not d.startswith(".") and d not in IGNORE_DIRS]
                for f in files:
                    if f.lower() in cand_names:
                        return self._index_and_return_rel(os.path.join(root, f), f)
        else:
            for root, dirs, files in os.walk(self.vault_path):
                dirs[:] = [d for d in dirs if not d.startswith(".") and d not in IGNORE_DIRS]
                for f in files:
                    rel_f = os.path.relpath(os.path.join(root, f), self.vault_path).replace("\\", "/").lower()
                    if rel_f == target_norm.lower() or rel_f == target_norm_md.lower():
                        return self._index_and_return_rel(os.path.join(root, f), f)

        return None

    def _index_and_return_rel(self, full_p: str, filename: str) -> str:
        rel = os.path.relpath(full_p, self.vault_path).replace("\\", "/")
        try:
            mtime, size = os.path.getmtime(full_p), os.path.getsize(full_p)
            with self._get_connection() as c:
                if rel.lower().endswith(".md"):
                    self._index_single_note(c, rel, full_p, mtime, size)
                else:
                    c.execute("INSERT OR REPLACE INTO attachments VALUES (?, ?, ?)", (filename, rel, mtime))
                c.commit()
        except Exception:
            pass
        return rel

    def get_tree_level(self, folder: str = "") -> Dict[str, Any]:
        """Return one folder level for lazy file-tree rendering."""
        folder = (folder or "").replace("\\", "/").strip("/")
        db_folder = folder.replace("/", os.sep) if folder else "/"
        prefix = (db_folder + os.sep) if folder else ""

        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT path, title FROM notes WHERE folder = ? ORDER BY title COLLATE NOCASE ASC",
            (db_folder,),
        )
        files = [{"name": row["title"], "type": "file", "path": row["path"]} for row in cursor.fetchall()]

        if folder:
            cursor.execute("SELECT DISTINCT folder FROM notes WHERE folder LIKE ? AND folder != ?", (prefix + "%", db_folder))
        else:
            cursor.execute("SELECT DISTINCT folder FROM notes WHERE folder != '/'")

        child_names = set()
        for row in cursor.fetchall():
            descendant = (row["folder"] or "").replace("\\", "/").strip("/")
            if folder:
                if not descendant.startswith(folder + "/"):
                    continue
                remainder = descendant[len(folder) + 1:]
            else:
                remainder = descendant
            if remainder:
                child_names.add(remainder.split("/", 1)[0])
        conn.close()

        folders = [
            {"name": name, "type": "folder", "path": f"{folder}/{name}" if folder else name, "has_children": True}
            for name in sorted(child_names, key=str.casefold)
        ]
        return {
            "name": os.path.basename(folder) if folder else "Vault",
            "type": "folder",
            "path": folder,
            "children": folders + files,
        }

    def get_tree(self) -> Dict[str, Any]:
        """Build folder tree with file counts."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT path, title, folder FROM notes ORDER BY path ASC")
        rows = cursor.fetchall()
        conn.close()

        root = {"name": "Vault", "type": "folder", "path": "", "children": {}}

        for row in rows:
            path_parts = row["path"].split(os.sep)
            curr = root
            for part in path_parts[:-1]:
                if part not in curr["children"]:
                    curr["children"][part] = {
                        "name": part,
                        "type": "folder",
                        "children": {}
                    }
                curr = curr["children"][part]

            file_name = path_parts[-1]
            curr["children"][file_name] = {
                "name": row["title"],
                "type": "file",
                "path": row["path"]
            }

        return root

    def get_tags(self) -> List[Dict[str, Any]]:
        """Get tag statistics."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT tags FROM notes WHERE tags != ''")
        rows = cursor.fetchall()
        conn.close()

        tag_counts: Dict[str, int] = {}
        for r in rows:
            for t in r["tags"].split():
                tag_counts[t] = tag_counts.get(t, 0) + 1

        return sorted([{"tag": k, "count": v} for k, v in tag_counts.items()], key=lambda x: (-x["count"], x["tag"]))

    def get_note_context(self, root_path: str, max_depth: int = 1) -> Optional[Dict[str, Any]]:
        """
        Traverse outgoing wikilinks up to max_depth (1 or 2) and generate full context markdown
        with Mermaid diagram graph and note contents.
        Delegates to ContextBuilder.
        """
        from core.context import ContextBuilder
        return ContextBuilder.build_context(self, root_path, max_depth=max_depth)


