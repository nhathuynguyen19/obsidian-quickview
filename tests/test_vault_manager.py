import unittest
import os
import tempfile
import shutil
import json
from unittest.mock import patch

from core.vault_manager import (
    get_obsidian_vaults,
    load_vault_config,
    save_vault_config,
    get_all_vaults,
    get_active_vault_path,
    get_vault_db_path
)


class TestVaultManager(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.obsidian_config = os.path.join(self.test_dir, "obsidian.json")
        self.cache_dir = os.path.join(self.test_dir, "cache")
        self.quickview_config = os.path.join(self.cache_dir, "vaults_config.json")
        os.makedirs(self.cache_dir, exist_ok=True)

        # Create dummy vaults
        self.vault1 = os.path.join(self.test_dir, "vault_one")
        self.vault2 = os.path.join(self.test_dir, "vault_two")
        os.makedirs(self.vault1, exist_ok=True)
        os.makedirs(self.vault2, exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def test_get_obsidian_vaults(self):
        with open(self.obsidian_config, "w", encoding="utf-8") as f:
            json.dump({
                "vaults": {
                    "v1": {"path": self.vault1, "ts": 123},
                    "v2": {"path": "/non/existent/path/xyz", "ts": 456}
                }
            }, f)

        with patch("core.vault_manager.OBSIDIAN_CONFIG_PATH", self.obsidian_config):
            vaults = get_obsidian_vaults()
            self.assertEqual(len(vaults), 2)
            v1 = next(v for v in vaults if v["path"] == self.vault1)
            self.assertTrue(v1["exists"])
            self.assertEqual(v1["name"], "vault_one")

            v2 = next(v for v in vaults if "xyz" in v["path"])
            self.assertFalse(v2["exists"])

    def test_save_and_load_vault_config(self):
        with patch("core.vault_manager.QUICKVIEW_CONFIG_PATH", self.quickview_config), \
             patch("core.vault_manager.QUICKVIEW_CACHE_DIR", self.cache_dir):
            cfg = load_vault_config()
            self.assertIsNone(cfg["default_vault"])
            self.assertFalse(cfg["first_run_completed"])

            saved = save_vault_config(
                default_vault=self.vault1,
                custom_vaults=[self.vault2],
                first_run_completed=True
            )
            self.assertEqual(saved["default_vault"], self.vault1)
            self.assertTrue(saved["first_run_completed"])

            loaded = load_vault_config()
            self.assertEqual(loaded["default_vault"], self.vault1)
            self.assertEqual(loaded["custom_vaults"], [self.vault2])
            self.assertTrue(loaded["first_run_completed"])

    def test_get_active_vault_path_and_missing_vault(self):
        missing_path = os.path.join(self.test_dir, "deleted_vault")
        with patch("core.vault_manager.QUICKVIEW_CONFIG_PATH", self.quickview_config), \
             patch("core.vault_manager.QUICKVIEW_CACHE_DIR", self.cache_dir):
            save_vault_config(default_vault=missing_path, first_run_completed=True)

            path, exists, is_first_run = get_active_vault_path()
            self.assertEqual(path, missing_path)
            self.assertFalse(exists)  # Missing vault properly detected!
            self.assertFalse(is_first_run)

    def test_get_all_vaults(self):
        with open(self.obsidian_config, "w", encoding="utf-8") as f:
            json.dump({
                "vaults": {
                    "v1": {"path": self.vault1, "ts": 123}
                }
            }, f)

        with patch("core.vault_manager.OBSIDIAN_CONFIG_PATH", self.obsidian_config), \
             patch("core.vault_manager.QUICKVIEW_CONFIG_PATH", self.quickview_config), \
             patch("core.vault_manager.QUICKVIEW_CACHE_DIR", self.cache_dir):
            save_vault_config(default_vault=self.vault1, custom_vaults=[self.vault2])

            all_vaults = get_all_vaults(current_vault=self.vault1)
            self.assertEqual(len(all_vaults), 2)
            current = all_vaults[0]
            self.assertEqual(current["path"], self.vault1)
            self.assertTrue(current["is_current"])
            self.assertTrue(current["is_default"])
            self.assertTrue(current["exists"])

    def test_get_vault_db_path(self):
        p1 = "/path/to/vault_a"
        p2 = "/path/to/vault_b"
        db1 = get_vault_db_path(p1)
        db2 = get_vault_db_path(p2)
        self.assertNotEqual(db1, db2)
        self.assertTrue(db1.endswith(".db"))


if __name__ == "__main__":
    unittest.main()
