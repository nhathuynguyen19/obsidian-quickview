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

    def _init_db(self):
        with self._get_connection() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("PRAGMA synchronous = NORMAL")
            conn.execute("""
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT
            )""")

            conn.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                path TEXT PRIMARY KEY,
                title TEXT,
                folder TEXT,
                mtime REAL,
                size INTEGER,
                tags TEXT,
                aliases TEXT,
                frontmatter TEXT
            )""")

            conn.execute("""
            CREATE TABLE IF NOT EXISTS links (
                source_path TEXT,
                target_title TEXT,
                anchor TEXT,
                is_embed INTEGER
            )""")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_links_target ON links (target_title)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_links_source ON links (source_path)")

            conn.execute("""
            CREATE TABLE IF NOT EXISTS attachments (
                filename TEXT PRIMARY KEY,
                path TEXT,
                mtime REAL
            )""")

            # FTS5 Virtual Table for Instant Search
            conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
                path UNINDEXED,
                title,
                tags,
                content,
                tokenize = "unicode61 remove_diacritics 2"
            )""")

    def update_index(self, force: bool = False) -> Dict[str, int]:
        """Incremental update: scans vault and updates modified/new files."""
        t0 = time.time()
        conn = self._get_connection()

        if force:
            with conn:
                conn.execute("DELETE FROM notes")
                conn.execute("DELETE FROM links")
                conn.execute("DELETE FROM attachments")
                conn.execute("DELETE FROM notes_fts")

        cursor = conn.cursor()
        cursor.execute("SELECT path, mtime FROM notes")
        existing_notes = {row["path"]: row["mtime"] for row in cursor.fetchall()}

        cursor.execute("SELECT filename, mtime FROM attachments")
        existing_attachments = {row["filename"]: row["mtime"] for row in cursor.fetchall()}

        current_notes = set()
        current_attachments = set()

        added_or_updated = 0
        deleted_notes = 0

        # Scan vault files
        batch_counter = 0
        conn.execute("BEGIN TRANSACTION")

        for root, dirs, files in os.walk(self.vault_path):
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith(".")]

            for file_name in files:
                if file_name.startswith("."):
                    continue

                full_path = os.path.join(root, file_name)
                rel_path = os.path.relpath(full_path, self.vault_path)

                try:
                    mtime = os.path.getmtime(full_path)
                    size = os.path.getsize(full_path)
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
                        conn.execute(
                            "INSERT OR REPLACE INTO attachments VALUES (?, ?, ?)",
                            (file_name, rel_path, mtime)
                        )

        # Remove deleted notes
        for removed_path in set(existing_notes.keys()) - current_notes:
            conn.execute("DELETE FROM notes WHERE path = ?", (removed_path,))
            conn.execute("DELETE FROM links WHERE source_path = ?", (removed_path,))
            conn.execute("DELETE FROM notes_fts WHERE path = ?", (removed_path,))
            deleted_notes += 1

        # Remove deleted attachments
        for removed_att in set(existing_attachments.keys()) - current_attachments:
            conn.execute("DELETE FROM attachments WHERE filename = ?", (removed_att,))

        conn.commit()
        conn.close()

        dur = time.time() - t0
        return {
            "total_notes": len(current_notes),
            "updated": added_or_updated,
            "deleted": deleted_notes,
            "duration_ms": round(dur * 1000, 2),
        }

    def _index_single_note(self, conn: sqlite3.Connection, rel_path: str, full_path: str, mtime: float, size: int):
        """Parse frontmatter, tags, links, and insert into SQLite & FTS5."""
        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                raw_text = f.read()
        except Exception:
            raw_text = ""

        title = os.path.splitext(os.path.basename(rel_path))[0]
        folder = os.path.dirname(rel_path) or "/"

        frontmatter, content = extract_frontmatter_and_content(raw_text)
        tags_list = extract_tags(frontmatter, content)
        tags_str = " ".join(tags_list)

        aliases = frontmatter.get("aliases", [])
        if isinstance(aliases, str):
            aliases = [aliases]
        aliases_str = " ".join([str(a) for a in aliases])

        conn.execute("DELETE FROM notes WHERE path = ?", (rel_path,))
        conn.execute("DELETE FROM links WHERE source_path = ?", (rel_path,))
        conn.execute("DELETE FROM notes_fts WHERE path = ?", (rel_path,))

        conn.execute(
            """INSERT INTO notes (path, title, folder, mtime, size, tags, aliases, frontmatter)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (rel_path, title, folder, mtime, size, tags_str, aliases_str, json.dumps(frontmatter, ensure_ascii=False))
        )

        wikilinks = extract_wikilinks(raw_text)
        for link in wikilinks:
            conn.execute(
                "INSERT INTO links (source_path, target_title, anchor, is_embed) VALUES (?, ?, ?, ?)",
                (rel_path, link["target"], link["anchor"], 1 if link["is_embed"] else 0)
            )

        conn.execute(
            "INSERT INTO notes_fts (path, title, tags, content) VALUES (?, ?, ?, ?)",
            (rel_path, title, tags_str, content)
        )

    def search(self, query: str, mode: str = "title", limit: int = 50) -> List[Dict[str, Any]]:
        """Delegates search to the SearchEngine module."""
        return self.search_engine.search(query, mode=mode, limit=limit)

    def get_note_by_path(self, rel_path: str) -> Optional[Dict[str, Any]]:
        """Get full note content, metadata, and backlinks."""
        full_path = os.path.join(self.vault_path, rel_path)
        if not os.path.exists(full_path):
            return None

        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                raw_content = f.read()
            mtime = os.path.getmtime(full_path)
            size = os.path.getsize(full_path)
        except Exception:
            return None

        title = os.path.splitext(os.path.basename(rel_path))[0]
        frontmatter, content = extract_frontmatter_and_content(raw_content)
        tags = extract_tags(frontmatter, content)

        # Get backlinks
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

        return {
            "path": rel_path,
            "title": title,
            "folder": os.path.dirname(rel_path) or "/",
            "mtime": mtime,
            "size": size,
            "frontmatter": frontmatter,
            "tags": tags,
            "raw_content": raw_content,
            "content": content,
            "backlinks": backlinks,
        }

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

        # 1. If target explicitly has a non-markdown extension (e.g. .pdf, .png, etc.), prioritize attachments!
        if ext and ext.lower() != ".md":
            cursor.execute(
                "SELECT path FROM attachments WHERE lower(filename) = lower(?) OR lower(filename) = lower(?) OR lower(path) = lower(?) LIMIT 1",
                (target_norm, base_filename, target_norm)
            )
            row = cursor.fetchone()
            if row:
                conn.close()
                return row["path"]

        # 2. Exact path match in notes
        if not target_norm.endswith(".md"):
            target_norm_md = target_norm + ".md"
        else:
            target_norm_md = target_norm

        cursor.execute("SELECT path FROM notes WHERE path = ? OR path = ? LIMIT 1", (target_norm, target_norm_md))
        row = cursor.fetchone()
        if row:
            conn.close()
            return row["path"]

        # 3. Title match (case-insensitive) in notes
        base_title = os.path.splitext(base_filename)[0]
        cursor.execute("SELECT path FROM notes WHERE lower(title) = lower(?) LIMIT 1", (base_title,))
        row = cursor.fetchone()
        if row:
            conn.close()
            return row["path"]

        # 4. Fallback check attachment (kể cả trường hợp chỉ ghi title không có đuôi .pdf)
        cursor.execute(
            "SELECT path FROM attachments WHERE lower(filename) = lower(?) OR lower(filename) = lower(?) OR lower(path) = lower(?) OR lower(filename) = lower(? || '.pdf') LIMIT 1",
            (target_norm, base_filename, target_norm, base_title)
        )
        row = cursor.fetchone()
        conn.close()
        if row:
            return row["path"]

        return None

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
        """
        root_note = self.get_note_by_path(root_path)
        if not root_note:
            return None

        max_depth = max(1, min(2, int(max_depth)))

        collected_notes: Dict[str, Dict[str, Any]] = {}
        edges: List[Tuple[str, str]] = []

        # BFS queue: (path, current_depth)
        queue = [(root_path, 0)]
        collected_notes[root_path] = {
            "depth": 0,
            "title": root_note["title"],
            "path": root_path,
            "folder": root_note.get("folder", ""),
            "raw_content": root_note.get("raw_content", ""),
        }

        conn = self._get_connection()
        cursor = conn.cursor()

        while queue:
            curr_path, curr_depth = queue.pop(0)
            if curr_depth >= max_depth:
                continue

            cursor.execute(
                "SELECT target_title FROM links WHERE source_path = ? AND is_embed = 0",
                (curr_path,)
            )
            for lr in cursor.fetchall():
                target_title = lr["target_title"]
                resolved_rel = self.resolve_target(target_title)
                if resolved_rel and resolved_rel.endswith(".md"):
                    edges.append((curr_path, resolved_rel))
                    if resolved_rel not in collected_notes:
                        note_data = self.get_note_by_path(resolved_rel)
                        if note_data:
                            collected_notes[resolved_rel] = {
                                "depth": curr_depth + 1,
                                "title": note_data["title"],
                                "path": resolved_rel,
                                "folder": note_data.get("folder", ""),
                                "raw_content": note_data.get("raw_content", ""),
                            }
                            if curr_depth + 1 < max_depth:
                                queue.append((resolved_rel, curr_depth + 1))

        conn.close()

        # Build Mermaid diagram
        mermaid_lines = ["graph TD"]
        id_map: Dict[str, str] = {}
        for i, p in enumerate(collected_notes.keys()):
            node_id = f"N{i}"
            id_map[p] = node_id
            safe_title = collected_notes[p]["title"].replace('"', "'")
            if collected_notes[p]["depth"] == 0:
                mermaid_lines.append(f'  {node_id}["★ {safe_title} (Root)"]')
            else:
                mermaid_lines.append(f'  {node_id}["{safe_title}"]')

        unique_edges = set(edges)
        for src, dst in unique_edges:
            if src in id_map and dst in id_map:
                mermaid_lines.append(f"  {id_map[src]} --> {id_map[dst]}")

        # Mermaid block
        mermaid_block = "```mermaid\n" + "\n".join(mermaid_lines) + "\n```"

        # Build text outline / tree
        text_tree = [f"• [Root] {root_note['title']} (`{root_path}`)"]
        for d in range(1, max_depth + 1):
            depth_notes = [n for n in collected_notes.values() if n["depth"] == d]
            if depth_notes:
                text_tree.append(f"  ├─ Cấp {d} ({len(depth_notes)} ghi chú liên kết):")
                for dn in depth_notes:
                    text_tree.append(f"  │  • {dn['title']} (`{dn['path']}`)")

        # Assemble comprehensive Markdown Context
        md_sections = []
        md_sections.append(f"# BỐI CẢNH GHI CHÚ (NOTE CONTEXT)")
        md_sections.append(f"- **Ghi chú chính**: {root_note['title']} (`{root_path}`)")
        md_sections.append(f"- **Độ sâu liên kết outgoing**: Cấp {max_depth}")
        md_sections.append(f"- **Tổng số ghi chú**: {len(collected_notes)}")
        md_sections.append("")
        md_sections.append("## 🗺️ Sơ đồ quan hệ ghi chú (Graph Diagram)")
        md_sections.append(mermaid_block)
        md_sections.append("")
        md_sections.append("### Danh sách liên kết:")
        md_sections.extend(text_tree)
        md_sections.append("\n---\n")

        # Include note contents
        sorted_notes = sorted(collected_notes.values(), key=lambda x: (x["depth"], x["title"]))
        for sn in sorted_notes:
            header_prefix = "★ GHI CHÚ GỐC (ROOT)" if sn["depth"] == 0 else f"LIÊN KẾT CẤP {sn['depth']}"
            md_sections.append(f"## [{header_prefix}] {sn['title']}")
            md_sections.append(f"> Tệp: `{sn['path']}`\n")
            md_sections.append("```markdown")
            md_sections.append(sn["raw_content"])
            md_sections.append("```\n")

        full_context_text = "\n".join(md_sections)

        return {
            "root_path": root_path,
            "root_title": root_note["title"],
            "max_depth": max_depth,
            "total_notes": len(collected_notes),
            "mermaid": "\n".join(mermaid_lines),
            "context_markdown": full_context_text,
            "notes": [
                {"path": n["path"], "title": n["title"], "depth": n["depth"]}
                for n in sorted_notes
            ]
        }

