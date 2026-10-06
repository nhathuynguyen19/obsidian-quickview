"""
High-performance search engine for Obsidian QuickView using SQLite FTS5.
Supports title search (multi-token, diacritic-insensitive) and content search (prefix phrases, snippet refinement).
"""

import re
import sqlite3
from typing import List, Dict, Any, Callable
from core.parser import remove_diacritics


class SearchEngine:
    """Encapsulates title, content, and tag searching against SQLite and FTS5."""

    def __init__(self, get_connection: Callable[[], sqlite3.Connection]):
        self._get_connection = get_connection

    def search(self, query: str, mode: str = "title", limit: int = 50) -> List[Dict[str, Any]]:
        """Search notes by title or content based on mode."""
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

        conn.close()

        if mode == "content":
            return self.search_content(query, limit=limit)
        elif mode == "all":
            title_res = self.search_title(query, limit=limit)
            seen = {r["path"] for r in title_res}
            if len(title_res) < limit:
                content_res = self.search_content(query, limit=limit)
                for cr in content_res:
                    if cr["path"] not in seen:
                        title_res.append(cr)
                        if len(title_res) >= limit:
                            break
            return title_res
        else:
            return self.search_title(query, limit=limit)

    def search_title(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Search strictly by note title, matching all query words/tokens (case & diacritic insensitive)."""
        tokens = [t.lower() for t in re.findall(r"[\w\u0080-\uffff]+", query)]
        if not tokens:
            return []

        q_clean = query.strip()
        q_norm = remove_diacritics(q_clean).lower()
        tokens_norm = [remove_diacritics(t).lower() for t in tokens]

        conn = self._get_connection()
        cursor = conn.cursor()

        candidates = []
        seen = set()

        # Step 1: Fast FTS5 candidate lookup for title matches
        fts_tokens = [f'"{t}"*' for t in tokens]
        fts_query = 'title: ( ' + ' AND '.join(fts_tokens) + ' )'
        try:
            cursor.execute("""
                SELECT n.path, n.title, n.folder, n.mtime, n.size, n.tags, '' as snippet_content
                FROM notes_fts fts
                JOIN notes n ON fts.path = n.path
                WHERE notes_fts MATCH ?
                LIMIT ?
            """, (fts_query, limit * 3))
            for r in cursor.fetchall():
                d = dict(r)
                seen.add(d["path"])
                candidates.append(d)
        except Exception:
            pass

        # Step 2: Fallback / substring check (e.g. for sub-words or accent-free match)
        if len(candidates) < limit * 2:
            cursor.execute("SELECT path, title, folder, mtime, size, tags, '' as snippet_content FROM notes")
            for r in cursor.fetchall():
                p = r["path"]
                if p not in seen:
                    d = dict(r)
                    t_norm = remove_diacritics(d["title"]).lower()
                    if all(tok in t_norm for tok in tokens_norm):
                        seen.add(p)
                        candidates.append(d)
                        if len(candidates) >= limit * 3:
                            break

        conn.close()

        # Step 3: Relevance scoring
        def score(item):
            t = item["title"]
            t_norm = remove_diacritics(t).lower()
            s = 0

            # Exact match
            if t_norm == q_norm:
                s += 1000
            # Starts with full query
            elif t_norm.startswith(q_norm):
                s += 500
            # Contains full contiguous query string
            elif q_norm in t_norm:
                s += 300
            # All individual query tokens match
            elif all(tok in t_norm for tok in tokens_norm):
                s += 100

            # Density bonus: shorter titles score higher
            s += max(0, 40 - len(t_norm))
            return (s, item["mtime"])

        candidates.sort(key=score, reverse=True)
        return candidates[:limit]

    def search_content(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Search inside note markdown content, matching phrases or prefix words with snippets."""
        clean_words = re.findall(r"[\w\u0080-\uffff]+", query)
        if not clean_words:
            return []

        conn = self._get_connection()
        cursor = conn.cursor()

        results = []
        seen = set()

        def run_fts_query(match_expr: str, max_take: int):
            try:
                cursor.execute("""
                    SELECT 
                        n.path, 
                        n.title, 
                        n.folder, 
                        n.mtime, 
                        n.size, 
                        n.tags,
                        snippet(notes_fts, 3, '<mark>', '</mark>', '...', 25) as snippet_content
                    FROM notes_fts fts
                    JOIN notes n ON fts.path = n.path
                    WHERE notes_fts MATCH ?
                    ORDER BY rank
                    LIMIT ?
                """, (match_expr, max_take))
                for r in cursor.fetchall():
                    d = dict(r)
                    if d["path"] not in seen:
                        seen.add(d["path"])
                        results.append(d)
                        if len(results) >= limit:
                            break
            except Exception:
                pass

        # Step 1: Phrase with prefix on the words (e.g. "Marugot"* or "nihongo"* + "minato"*)
        prefix_phrase_fts = 'content: ' + ' + '.join(f'"{w}"*' for w in clean_words)
        run_fts_query(prefix_phrase_fts, limit)

        # Step 2: Fallback to all-words AND prefix match if fewer results and multiple words
        if len(results) < limit and len(clean_words) > 1:
            and_tokens = [f'"{w}"*' for w in clean_words]
            and_fts = 'content: ( ' + ' AND '.join(and_tokens) + ' )'
            run_fts_query(and_fts, (limit - len(results)) * 2)

        # Step 3: Refine snippets so that only the typed prefix characters are highlighted in <mark>
        # (e.g. typing "marugot" highlights "<mark>marugot</mark>o" instead of "<mark>marugoto</mark>")
        def refine_snippet(html_snippet: str) -> str:
            if not html_snippet or not clean_words:
                return html_snippet
            escaped_tokens = [re.escape(w) for w in sorted(clean_words, key=len, reverse=True)]
            pattern = re.compile(r'(' + '|'.join(escaped_tokens) + r')', re.IGNORECASE)

            def process_mark(m):
                inner = m.group(1)
                if pattern.search(inner):
                    return pattern.sub(r'<mark>\1</mark>', inner)
                inner_norm = remove_diacritics(inner).lower()
                for w in sorted(clean_words, key=len, reverse=True):
                    w_norm = remove_diacritics(w).lower()
                    idx = inner_norm.find(w_norm)
                    if idx != -1 and len(inner) == len(inner_norm):
                        return inner[:idx] + f'<mark>{inner[idx:idx+len(w)]}</mark>' + inner[idx+len(w):]
                return f'<mark>{inner}</mark>'

            return re.sub(r'<mark>(.*?)</mark>', process_mark, html_snippet, flags=re.DOTALL)

        for item in results:
            if item.get("snippet_content"):
                item["snippet_content"] = refine_snippet(item["snippet_content"])

        conn.close()
        return results
