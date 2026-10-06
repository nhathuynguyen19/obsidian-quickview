"""
Markdown parsing utilities for frontmatter, tags, and wikilinks.
Zero external dependencies.
"""

import re
import unicodedata
from typing import Dict, List, Tuple, Any

# Regex patterns
RE_FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
RE_WIKILINK = re.compile(r"(!?\[\[(.*?)\]\])")
RE_INLINE_TAG = re.compile(r"(?:^|\s)#([a-zA-Z0-9_\u0080-\uffff/-]+)")


def remove_diacritics(s: str) -> str:
    """Loại bỏ dấu tiếng Việt để tìm kiếm không dấu / có dấu linh hoạt."""
    s = s.replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


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
