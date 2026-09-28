"""
Indexer and Search Engine for Obsidian QuickView.
Powered by Python standard library sqlite3 + FTS5 with unicode61 diacritic removal.
"""

import os
import re
import time
import sqlite3
import json
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional

DEFAULT_VAULT_PATH = "/home/huy/mygit/obsidian"
DEFAULT_DB_PATH = os.path.expanduser("~/.cache/obsidian-quickview/index.db")

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

# Regex patterns
RE_FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
RE_WIKILINK = re.compile(r"(!?\[\[(.*?)\]\])")
RE_INLINE_TAG = re.compile(r"(?:^|\s)#([a-zA-Z0-9_\u0080-\uffff/-]+)")


def extract_frontmatter_and_content(raw_text: str) -> Tuple[Dict[str, Any], str]:
    """Extract YAML frontmatter properties and remaining markdown content."""
    match = RE_FRONTMATTER.match(raw_text)
    if not match:
        return {}, raw_text

    yaml_block = match.group(1)
    content = raw_text[match.end():]
    props: Dict[str, Any] = {}

    current_list_key = None
    for line in yaml_block.splitlines():
        line_clean = line.strip()
        if not line_clean or line_clean.startswith("#"):
            continue

        # Check for list items under previous key
        if line.startswith("  - ") or line.startswith("- "):
            val = line.split("-", 1)[1].strip().strip('"\'')
            if current_list_key:
                props.setdefault(current_list_key, []).append(val)
            continue

        if ":" in line:
            key, val = line.split(":", 1)
            key = key.strip()
            val = val.strip().strip('"\'')
            current_list_key = None

            if val == "":
                current_list_key = key
                props[key] = []
            elif val.startswith("[") and val.endswith("]"):
                items = [x.strip().strip('"\'') for x in val[1:-1].split(",") if x.strip()]
                props[key] = items
            else:
                props[key] = val

    return props, content


def extract_tags(frontmatter: Dict[str, Any], content: str) -> List[str]:
    """Extract tags from frontmatter and inline content."""
    tags_set = set()

    # From frontmatter
    for tag_key in ("tags", "tag"):
        if tag_key in frontmatter:
            raw_tags = frontmatter[tag_key]
            if isinstance(raw_tags, list):
                for t in raw_tags:
                    clean = str(t).strip().lstrip("#")
                    if clean:
                        tags_set.add(clean.lower())
            elif isinstance(raw_tags, str):
                for t in raw_tags.replace(",", " ").split():
                    clean = t.strip().lstrip("#")
                    if clean:
                        tags_set.add(clean.lower())

    # From inline content
    for match in RE_INLINE_TAG.finditer(content):
        tag = match.group(1).strip()
        if tag and not tag.isdigit():
            tags_set.add(tag.lower())

    return sorted(list(tags_set))


def extract_wikilinks(content: str) -> List[Dict[str, str]]:
    """Extract wikilinks: [[target]], [[target|alias]], and attachments ![[img.png]]."""
    links = []
    for full_match, inner in RE_WIKILINK.findall(content):
        is_embed = full_match.startswith("!")
        pipe_split = inner.split("|", 1)
        target = pipe_split[0].strip()
        alias = pipe_split[1].strip() if len(pipe_split) > 1 else ""

        anchor = ""
        if "#" in target:
            target, anchor = target.split("#", 1)
            target = target.strip()
            anchor = anchor.strip()

        if target:
            links.append({
                "target": target,
                "alias": alias,
                "anchor": anchor,
                "is_embed": is_embed,
            })
    return links


class VaultIndex:
    def __init__(self, vault_path: str = DEFAULT_VAULT_PATH, db_path: str = DEFAULT_DB_PATH):
        self.vault_path = os.path.abspath(vault_path)
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()

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

    def search(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Search notes with title match priority followed by full-text match."""
        query = query.strip()
        conn = self._get_connection()
        cursor = conn.cursor()

        if not query:
            cursor.execute("""
                SELECT path, title, folder, mtime, size, tags, '' as snippet_content
                FROM notes
                ORDER BY mtime DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            conn.close()
            return [dict(r) for r in rows]

        if query.startswith("#") or query.startswith("tag:"):
            tag_name = query.split(":", 1)[1] if query.startswith("tag:") else query[1:]
            tag_name = tag_name.lower().strip()
            cursor.execute("""
                SELECT path, title, folder, mtime, size, tags, '' as snippet_content
                FROM notes
                WHERE (' ' || tags || ' ') LIKE ?
                ORDER BY mtime DESC
                LIMIT ?
            """, (f"% {tag_name} %", limit))
            rows = cursor.fetchall()
            conn.close()
            return [dict(r) for r in rows]

        clean_words = re.findall(r"[\w\u0080-\uffff]+", query)
        if not clean_words:
            conn.close()
            return []

        fts_tokens = []
        for i, word in enumerate(clean_words):
            if i == len(clean_words) - 1 and len(word) >= 2:
                fts_tokens.append(f'"{word}"*')
            else:
                fts_tokens.append(f'"{word}"')
        fts_tokens_str = " ".join(fts_tokens)

        title_fts = f'title: ( {fts_tokens_str} )'
        all_fts = fts_tokens_str

        results = []
        seen_paths = set()

        # Step 1: Query title matches first
        try:
            cursor.execute("""
                SELECT 
                    n.path, 
                    n.title, 
                    n.folder, 
                    n.mtime, 
                    n.size, 
                    n.tags,
                    snippet(notes_fts, 3, '<mark>', '</mark>', '...', 15) as snippet_content,
                    1 as is_title_match
                FROM notes_fts fts
                JOIN notes n ON fts.path = n.path
                WHERE notes_fts MATCH ?
                ORDER BY rank
                LIMIT ?
            """, (title_fts, limit))
            for r in cursor.fetchall():
                d = dict(r)
                seen_paths.add(d["path"])
                results.append(d)
        except Exception:
            pass

        # Step 2: Query content matches to fill remaining limit
        remaining = limit - len(results)
        if remaining > 0:
            try:
                cursor.execute("""
                    SELECT 
                        n.path, 
                        n.title, 
                        n.folder, 
                        n.mtime, 
                        n.size, 
                        n.tags,
                        snippet(notes_fts, 3, '<mark>', '</mark>', '...', 15) as snippet_content,
                        0 as is_title_match
                    FROM notes_fts fts
                    JOIN notes n ON fts.path = n.path
                    WHERE notes_fts MATCH ?
                    ORDER BY rank
                    LIMIT ?
                """, (all_fts, limit * 2))
                for r in cursor.fetchall():
                    d = dict(r)
                    if d["path"] not in seen_paths:
                        seen_paths.add(d["path"])
                        results.append(d)
                        if len(results) >= limit:
                            break
            except Exception:
                pass

        conn.close()
        return results

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
        """Resolve a wikilink target (by note title or path) to its relative path."""
        conn = self._get_connection()
        cursor = conn.cursor()

        # 1. Exact path match
        target_norm = target_title.strip()
        if not target_norm.endswith(".md"):
            target_norm_md = target_norm + ".md"
        else:
            target_norm_md = target_norm

        cursor.execute("SELECT path FROM notes WHERE path = ? OR path = ? LIMIT 1", (target_norm, target_norm_md))
        row = cursor.fetchone()
        if row:
            conn.close()
            return row["path"]

        # 2. Title match (case-insensitive)
        base_title = os.path.splitext(os.path.basename(target_norm))[0]
        cursor.execute("SELECT path FROM notes WHERE lower(title) = lower(?) LIMIT 1", (base_title,))
        row = cursor.fetchone()
        if row:
            conn.close()
            return row["path"]

        # 3. Check attachment
        cursor.execute("SELECT path FROM attachments WHERE lower(filename) = lower(?) LIMIT 1", (target_norm,))
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
