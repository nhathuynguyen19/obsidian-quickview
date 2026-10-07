"""
Vault Manager for Obsidian QuickView.
Handles discovery, selection, persistence, and status of Obsidian vaults.
"""

import os
import json
import hashlib
from typing import Dict, List, Any, Optional, Tuple

from core.config import DEFAULT_VAULT_PATH, DEFAULT_DB_PATH

OBSIDIAN_CONFIG_PATH = os.path.expanduser("~/.config/obsidian/obsidian.json")
QUICKVIEW_CACHE_DIR = os.path.expanduser("~/.cache/obsidian-quickview")
QUICKVIEW_CONFIG_PATH = os.path.join(QUICKVIEW_CACHE_DIR, "vaults_config.json")


def get_obsidian_vaults() -> List[Dict[str, Any]]:
    """Discover vaults registered in the official Obsidian Desktop client."""
    vaults = []
    if not os.path.exists(OBSIDIAN_CONFIG_PATH):
        return vaults

    try:
        with open(OBSIDIAN_CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            raw_vaults = data.get("vaults", {})
            for key, val in raw_vaults.items():
                vpath = val.get("path")
                if vpath:
                    norm_path = os.path.normpath(os.path.expanduser(vpath))
                    name = os.path.basename(norm_path) or norm_path
                    vaults.append({
                        "id": key,
                        "name": name,
                        "path": norm_path,
                        "source": "obsidian",
                        "exists": os.path.isdir(norm_path)
                    })
    except Exception:
        pass
    return vaults


def load_vault_config() -> Dict[str, Any]:
    """Load user's persistent QuickView vault configuration."""
    default_config = {
        "default_vault": None,
        "custom_vaults": [],
        "first_run_completed": False
    }
    if not os.path.exists(QUICKVIEW_CONFIG_PATH):
        return default_config

    try:
        with open(QUICKVIEW_CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return {
                "default_vault": data.get("default_vault"),
                "custom_vaults": data.get("custom_vaults", []),
                "first_run_completed": data.get("first_run_completed", False)
            }
    except Exception:
        return default_config


def save_vault_config(
    default_vault: Optional[str] = None,
    custom_vaults: Optional[List[str]] = None,
    first_run_completed: Optional[bool] = None
) -> Dict[str, Any]:
    """Save user vault configuration to disk."""
    os.makedirs(QUICKVIEW_CACHE_DIR, exist_ok=True)
    current = load_vault_config()

    if default_vault is not None:
        current["default_vault"] = os.path.normpath(os.path.expanduser(default_vault))
    if custom_vaults is not None:
        current["custom_vaults"] = [os.path.normpath(os.path.expanduser(p)) for p in custom_vaults]
    if first_run_completed is not None:
        current["first_run_completed"] = first_run_completed

    try:
        with open(QUICKVIEW_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving vaults_config: {e}")

    return current


def get_vault_db_path(vault_path: str) -> str:
    """Return dedicated SQLite DB file path for a given vault."""
    norm = os.path.normpath(os.path.expanduser(vault_path))
    # Preserve the existing primary index.db for default vault to prevent re-indexing
    if os.path.normpath(DEFAULT_VAULT_PATH) == norm:
        return DEFAULT_DB_PATH

    v_hash = hashlib.md5(norm.encode("utf-8")).hexdigest()[:12]
    return os.path.join(QUICKVIEW_CACHE_DIR, f"index_{v_hash}.db")


def get_active_vault_path() -> Tuple[str, bool, bool]:
    """
    Determine the initial active vault path.
    Returns: (path: str, exists: bool, is_first_run: bool)
    """
    cfg = load_vault_config()
    default_vault = cfg.get("default_vault")
    first_run_completed = cfg.get("first_run_completed", False)

    if default_vault:
        norm = os.path.normpath(os.path.expanduser(default_vault))
        return (norm, os.path.isdir(norm), not first_run_completed)

    # First run without saved default vault:
    # Look for Obsidian vaults
    obs_vaults = get_obsidian_vaults()
    for v in obs_vaults:
        if v["exists"]:
            return (v["path"], True, True)

    # Fallback to DEFAULT_VAULT_PATH
    norm_def = os.path.normpath(os.path.expanduser(DEFAULT_VAULT_PATH))
    return (norm_def, os.path.isdir(norm_def), True)


def get_all_vaults(current_vault: str) -> List[Dict[str, Any]]:
    """
    Get a list of all known vaults (Obsidian desktop + custom), with existence and selection info.
    """
    cfg = load_vault_config()
    obs_vaults = get_obsidian_vaults()
    custom_vault_paths = cfg.get("custom_vaults", [])

    norm_current = os.path.normpath(os.path.expanduser(current_vault)) if current_vault else ""
    seen_paths = set()
    result = []

    # 1. Add Obsidian vaults
    for v in obs_vaults:
        p = os.path.normpath(v["path"])
        if p in seen_paths:
            continue
        seen_paths.add(p)
        exists = os.path.isdir(p)
        result.append({
            "name": v["name"],
            "path": p,
            "source": "obsidian",
            "exists": exists,
            "is_current": (p == norm_current),
            "is_default": (cfg.get("default_vault") and os.path.normpath(cfg["default_vault"]) == p)
        })

    # 2. Add custom vaults
    for p in custom_vault_paths:
        norm_p = os.path.normpath(p)
        if norm_p in seen_paths:
            continue
        seen_paths.add(norm_p)
        exists = os.path.isdir(norm_p)
        result.append({
            "name": os.path.basename(norm_p) or norm_p,
            "path": norm_p,
            "source": "custom",
            "exists": exists,
            "is_current": (norm_p == norm_current),
            "is_default": (cfg.get("default_vault") and os.path.normpath(cfg["default_vault"]) == norm_p)
        })

    # 3. If current_vault isn't in the list yet, add it
    if norm_current and norm_current not in seen_paths:
        exists = os.path.isdir(norm_current)
        result.append({
            "name": os.path.basename(norm_current) or norm_current,
            "path": norm_current,
            "source": "custom",
            "exists": exists,
            "is_current": True,
            "is_default": (cfg.get("default_vault") and os.path.normpath(cfg["default_vault"]) == norm_current)
        })

    # Sort: Current first, then existing, then missing
    result.sort(key=lambda x: (not x["is_current"], not x["exists"], x["name"].lower()))
    return result
