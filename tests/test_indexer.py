import unittest
import os
import tempfile
import shutil
import sqlite3
from indexer import (
    VaultIndex,
    extract_frontmatter_and_content,
    extract_tags,
    extract_wikilinks
)

class TestObsidianIndexer(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.vault_dir = os.path.join(self.test_dir, "vault")
        os.makedirs(self.vault_dir)
        self.db_path = os.path.join(self.test_dir, "test_index.db")

        # Create sample markdown notes
        self.note1_path = os.path.join(self.vault_dir, "Note 1.md")
        with open(self.note1_path, "w", encoding="utf-8") as f:
            f.write("""---
tags:
  - python
  - coding
alias: First Note
---
# Tiêu đề ghi chú 1
Đây là nội dung hướng dẫn về SQLite và Python.
Liên kết tới [[Ghi chú số 2|Note 2]] và hình ảnh ![[diagram.png]].
Thêm một thẻ inline #tips và #quick.
""")

        self.note2_path = os.path.join(self.vault_dir, "Ghi chú số 2.md")
        with open(self.note2_path, "w", encoding="utf-8") as f:
            f.write("""---
tag: database
---
# Ghi chú số 2
Nội dung về cơ sở dữ liệu FTS5.
Liên kết ngược tới [[Note 1]].
> [!NOTE]
> Đây là một callout quan trọng.
""")

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def test_frontmatter_extraction(self):
        raw = """---
title: Test
tags:
  - web
  - api
count: 42
---
# Main Content
Hello world
"""
        props, content = extract_frontmatter_and_content(raw)
        self.assertEqual(props["title"], "Test")
        self.assertEqual(props["tags"], ["web", "api"])
        self.assertEqual(props["count"], "42")
        self.assertTrue("Hello world" in content)

    def test_tag_extraction(self):
        props = {"tags": ["api", "cloud"]}
        content = "Học lập trình #python và #api cùng #tips"
        tags = extract_tags(props, content)
        self.assertIn("api", tags)
        self.assertIn("cloud", tags)
        self.assertIn("python", tags)
        self.assertIn("tips", tags)

    def test_wikilinks_extraction(self):
        content = "Xem thêm [[Note 1]] hoặc [[Note 2|Chi tiết]] và ảnh ![[banner.jpg]]"
        links = extract_wikilinks(content)
        self.assertEqual(len(links), 3)
        self.assertEqual(links[0]["target"], "Note 1")
        self.assertFalse(links[0]["is_embed"])
        self.assertEqual(links[1]["target"], "Note 2")
        self.assertEqual(links[1]["alias"], "Chi tiết")
        self.assertEqual(links[2]["target"], "banner.jpg")
        self.assertTrue(links[2]["is_embed"])

    def test_indexing_and_search(self):
        idx = VaultIndex(vault_path=self.vault_dir, db_path=self.db_path)
        stats = idx.update_index()
        self.assertEqual(stats["total_notes"], 2)
        self.assertEqual(stats["updated"], 2)

        # Search by title without diacritics (mode="title")
        res = idx.search("ghi chu so 2", mode="title")
        self.assertTrue(len(res) > 0)
        self.assertEqual(res[0]["title"], "Ghi chú số 2")

        # Title search with multiple tokens separated: "note 1" -> matches "Note 1"
        res_tokens = idx.search("note 1", mode="title")
        self.assertTrue(len(res_tokens) > 0)
        self.assertEqual(res_tokens[0]["title"], "Note 1")

        # Content keyword should NOT match in mode="title"
        res_title_exclusive = idx.search("FTS5", mode="title")
        self.assertEqual(len(res_title_exclusive), 0)

        # Search by tag
        res_tag = idx.search("#python")
        self.assertEqual(len(res_tag), 1)
        self.assertEqual(res_tag[0]["title"], "Note 1")

        # Search content FTS (mode="content") with exact and prefix
        res_content = idx.search("FTS5", mode="content")
        self.assertTrue(len(res_content) > 0)
        self.assertEqual(res_content[0]["title"], "Ghi chú số 2")

        # Prefix search in content: "FTS" matches "FTS5", but only highlights "FTS"
        res_prefix = idx.search("FTS", mode="content")
        self.assertTrue(len(res_prefix) > 0)
        self.assertEqual(res_prefix[0]["title"], "Ghi chú số 2")
        self.assertIn("<mark>FTS</mark>5", res_prefix[0]["snippet_content"])


    def test_note_path_traversal_is_rejected(self):
        outside = os.path.join(self.test_dir, "outside.md")
        with open(outside, "w", encoding="utf-8") as f:
            f.write("secret")
        idx = VaultIndex(vault_path=self.vault_dir, db_path=self.db_path)
        idx.update_index()
        self.assertIsNone(idx.get_note_by_path("../outside.md"))
        self.assertIsNone(idx.get_note_raw("../outside.md"))

    def test_read_payload_can_omit_raw_markdown(self):
        idx = VaultIndex(vault_path=self.vault_dir, db_path=self.db_path)
        idx.update_index()

        reading = idx.get_note_by_path("Note 1.md", include_raw=False)
        self.assertIsNotNone(reading)
        self.assertIn("content", reading)
        self.assertNotIn("raw_content", reading)

        raw = idx.get_note_raw("Note 1.md")
        self.assertIsNotNone(raw)
        self.assertIn("# Tiêu đề ghi chú 1", raw["raw_content"])

    def test_lazy_tree_level(self):
        nested_dir = os.path.join(self.vault_dir, "Courses", "CS")
        os.makedirs(nested_dir, exist_ok=True)
        with open(os.path.join(nested_dir, "Algorithms.md"), "w", encoding="utf-8") as f:
            f.write("# Algorithms\n")
        with open(os.path.join(self.vault_dir, "Courses", "Overview.md"), "w", encoding="utf-8") as f:
            f.write("# Overview\n")

        idx = VaultIndex(vault_path=self.vault_dir, db_path=self.db_path)
        idx.update_index()

        root = idx.get_tree_level("")
        root_names = {(item["type"], item["name"]) for item in root["children"]}
        self.assertIn(("folder", "Courses"), root_names)
        self.assertIn(("file", "Note 1"), root_names)

        courses = idx.get_tree_level("Courses")
        course_names = {(item["type"], item["name"]) for item in courses["children"]}
        self.assertIn(("folder", "CS"), course_names)
        self.assertIn(("file", "Overview"), course_names)

    def test_title_norm_is_indexed(self):
        idx = VaultIndex(vault_path=self.vault_dir, db_path=self.db_path)
        idx.update_index()
        with idx._get_connection() as conn:
            row = conn.execute("SELECT title_norm FROM notes WHERE path = ?", ("Ghi chú số 2.md",)).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["title_norm"], "ghi chu so 2")

    def test_backlinks(self):
        idx = VaultIndex(vault_path=self.vault_dir, db_path=self.db_path)
        idx.update_index()

        note2 = idx.get_note_by_path("Ghi chú số 2.md")
        self.assertIsNotNone(note2)
        # Note 1 links to "Ghi chú số 2"
        backlink_titles = [b["title"] for b in note2["backlinks"]]
        self.assertIn("Note 1", backlink_titles)

    def test_resolve_target_attachments(self):
        # Create subfolders with attachments
        img_dir = os.path.join(self.vault_dir, "images", "nested")
        docs_dir = os.path.join(self.vault_dir, "docs")
        os.makedirs(img_dir, exist_ok=True)
        os.makedirs(docs_dir, exist_ok=True)

        with open(os.path.join(img_dir, "diagram.png"), "wb") as f:
            f.write(b"fake png")
        with open(os.path.join(docs_dir, "report.pdf"), "wb") as f:
            f.write(b"fake pdf")

        idx = VaultIndex(vault_path=self.vault_dir, db_path=self.db_path)
        idx.update_index()

        # Resolve by bare filename
        res_img = idx.resolve_target("diagram.png")
        self.assertEqual(res_img, os.path.join("images", "nested", "diagram.png"))

        # Resolve by relative path
        res_pdf = idx.resolve_target(os.path.join("docs", "report.pdf"))
        self.assertEqual(res_pdf, os.path.join("docs", "report.pdf"))

        # Resolve with anchor (e.g. #page=2)
        res_pdf_anchor = idx.resolve_target("report.pdf#page=2")
        self.assertEqual(res_pdf_anchor, os.path.join("docs", "report.pdf"))

        # Case-insensitivity check
        res_case = idx.resolve_target("REPORT.PDF")
        self.assertEqual(res_case, os.path.join("docs", "report.pdf"))

    def test_get_note_context(self):
        idx = VaultIndex(vault_path=self.vault_dir, db_path=self.db_path)
        idx.update_index()

        # Note 1 links to "Ghi chú số 2"
        ctx1 = idx.get_note_context("Note 1.md", max_depth=1)
        self.assertIsNotNone(ctx1)
        self.assertEqual(ctx1["root_title"], "Note 1")
        self.assertEqual(ctx1["max_depth"], 1)
        self.assertEqual(ctx1["total_notes"], 2)  # Note 1 + Ghi chú số 2
        self.assertIn("Note 1.md (current)", ctx1["context_markdown"])
        self.assertIn("## Note 1.md is-current", ctx1["context_markdown"])
        self.assertIn("Depth: 0", ctx1["context_markdown"])
        self.assertIn("## Ghi chú số 2.md", ctx1["context_markdown"])
        self.assertIn("Depth: 1", ctx1["context_markdown"])
        self.assertIn("````md", ctx1["context_markdown"])

if __name__ == "__main__":
    unittest.main()
