"""
Knowledge Graph Context Generator for Obsidian QuickView.
Traverses outgoing wikilinks up to specified depth, generates ASCII tree,
Mermaid diagram, and structured markdown context package.
"""

import os
import time
from typing import Dict, Any, List, Tuple, Optional


class ContextBuilder:
    """Constructs multi-depth note context for LLM reasoning and graph visualization."""

    @staticmethod
    def format_relative_time(mtime_val: float) -> str:
        """Format a timestamp into a human-readable relative time string."""
        diff = time.time() - mtime_val
        if diff < 60:
            return "just now"
        elif diff < 3600:
            mins = max(1, int(diff / 60))
            return f"{mins} minute{'s' if mins > 1 else ''} ago"
        elif diff < 86400:
            hours = max(1, int(diff / 3600))
            return f"{hours} hour{'s' if hours > 1 else ''} ago"
        elif diff < 86400 * 30:
            days = max(1, int(diff / 86400))
            return f"{days} day{'s' if days > 1 else ''} ago"
        elif diff < 86400 * 365:
            months = max(1, int(diff / (86400 * 30)))
            return f"{months} month{'s' if months > 1 else ''} ago"
        else:
            years = max(1, int(diff / (86400 * 365)))
            return f"{years} year{'s' if years > 1 else ''} ago"

    @staticmethod
    def build_tree_ascii(notes_dict: Dict[str, Dict[str, Any]]) -> str:
        """Build ASCII directory tree representation of the collected notes."""
        tree: Dict[str, Any] = {}
        for p, n in notes_dict.items():
            parts = p.split(os.sep)
            curr = tree
            for seg in parts[:-1]:
                curr = curr.setdefault(seg + "/", {})
            leaf_name = parts[-1] + (" (current)" if n.get("is_current") else "")
            curr[leaf_name] = None

        lines: List[str] = []

        def render(d: Dict[str, Any], prefix: str = ""):
            items = list(d.items())
            for idx, (name, subtree) in enumerate(items):
                is_last = (idx == len(items) - 1)
                connector = "└── " if is_last else "├── "
                lines.append(f"{prefix}{connector}{name}")
                if subtree is not None:
                    new_prefix = prefix + ("    " if is_last else "│   ")
                    render(subtree, new_prefix)

        render(tree)
        return "\n".join(lines)

    @classmethod
    def build_context(cls, vault_index: Any, root_path: str, max_depth: int = 1) -> Optional[Dict[str, Any]]:
        """
        Traverse outgoing wikilinks up to max_depth (1 or 2) and generate full context markdown
        with Mermaid diagram graph and note contents.
        """
        root_note = vault_index.get_note_by_path(root_path)
        if not root_note:
            return None

        max_depth = max(1, min(2, int(max_depth)))

        collected_notes: Dict[str, Dict[str, Any]] = {}
        edges: List[Tuple[str, str]] = []

        # BFS queue: (path, current_depth)
        queue = [(root_path, 0)]

        root_mtime = root_note.get("mtime", time.time())
        collected_notes[root_path] = {
            "depth": 0,
            "title": root_note["title"],
            "path": root_path,
            "folder": root_note.get("folder", ""),
            "mtime": root_mtime,
            "updated_str": cls.format_relative_time(root_mtime),
            "raw_content": root_note.get("raw_content", ""),
            "is_current": True,
        }

        conn = vault_index._get_connection()
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
                resolved_rel = vault_index.resolve_target(target_title)
                if resolved_rel and resolved_rel.endswith(".md"):
                    edges.append((curr_path, resolved_rel))
                    if resolved_rel not in collected_notes:
                        note_data = vault_index.get_note_by_path(resolved_rel)
                        if note_data:
                            note_mtime = note_data.get("mtime", time.time())
                            collected_notes[resolved_rel] = {
                                "depth": curr_depth + 1,
                                "title": note_data["title"],
                                "path": resolved_rel,
                                "folder": note_data.get("folder", ""),
                                "mtime": note_mtime,
                                "updated_str": cls.format_relative_time(note_mtime),
                                "raw_content": note_data.get("raw_content", ""),
                                "is_current": False,
                            }
                            if curr_depth + 1 < max_depth:
                                queue.append((resolved_rel, curr_depth + 1))

        conn.close()

        tree_str = cls.build_tree_ascii(collected_notes)

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

        # Assemble markdown in structured format
        sorted_notes = sorted(collected_notes.values(), key=lambda x: (x["depth"], x["path"]))

        md_sections: List[str] = []
        md_sections.append(tree_str)
        md_sections.append("")

        for sn in sorted_notes:
            is_cur_flag = " is-current" if sn.get("is_current") else ""
            md_sections.append(f"## {sn['path']}{is_cur_flag}")
            md_sections.append(f"Updated: {sn['updated_str']} | Depth: {sn['depth']}")
            md_sections.append("````md")
            md_sections.append(sn["raw_content"])
            md_sections.append("````")
            md_sections.append("")

        full_context_text = "\n".join(md_sections).strip()

        return {
            "root_path": root_path,
            "root_title": root_note["title"],
            "max_depth": max_depth,
            "total_notes": len(collected_notes),
            "mermaid": "\n".join(mermaid_lines),
            "tree_ascii": tree_str,
            "context_markdown": full_context_text,
            "notes": [
                {"path": n["path"], "title": n["title"], "depth": n["depth"]}
                for n in sorted_notes
            ]
        }
