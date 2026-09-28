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

        # Search by title without diacritics
        res = idx.search("ghi chu so 2")
        self.assertTrue(len(res) > 0)
        self.assertEqual(res[0]["title"], "Ghi chú số 2")

        # Search by tag
        res_tag = idx.search("#python")
        self.assertEqual(len(res_tag), 1)
        self.assertEqual(res_tag[0]["title"], "Note 1")

        # Search content FTS
        res_content = idx.search("FTS5")
        self.assertTrue(len(res_content) > 0)
        self.assertEqual(res_content[0]["title"], "Ghi chú số 2")

    def test_backlinks(self):
        idx = VaultIndex(vault_path=self.vault_dir, db_path=self.db_path)
        idx.update_index()

        note2 = idx.get_note_by_path("Ghi chú số 2.md")
        self.assertIsNotNone(note2)
        # Note 1 links to "Ghi chú số 2"
        backlink_titles = [b["title"] for b in note2["backlinks"]]
        self.assertIn("Note 1", backlink_titles)

if __name__ == "__main__":
    unittest.main()
