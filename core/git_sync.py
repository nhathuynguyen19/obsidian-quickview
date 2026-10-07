"""
Git synchronization service for Obsidian QuickView.
Encapsulates git status checking, committing, pulling, and pushing for vaults.
"""

import os
import subprocess
import datetime
from typing import Dict, Any, Optional


class GitSyncService:
    """Handles Git status and synchronization workflow for an Obsidian vault."""

    @staticmethod
    def is_git_repo(vault_path: str) -> bool:
        """Check if vault_path is inside a valid Git working tree."""
        if not vault_path or not os.path.isdir(vault_path):
            return False
        res = subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            cwd=vault_path,
            capture_output=True,
            text=True
        )
        return res.returncode == 0 and res.stdout.strip() == "true"

    @classmethod
    def sync_vault(cls, vault_path: str) -> Dict[str, Any]:
        """
        Executes a safe git sync routine:
        1. Validate git repository
        2. Validate git user.name and user.email
        3. Validate remote origin
        4. Detect modified / untracked files and unpushed commits
        5. Stage, commit with timestamp message
        6. Push to remote origin
        """
        if not vault_path or not os.path.isdir(vault_path):
            return {
                "status": "error",
                "stage": "git_init",
                "message": f"Đường dẫn vault không hợp lệ: {vault_path}"
            }

        # 1. Check if git repo
        if not cls.is_git_repo(vault_path):
            return {
                "status": "error",
                "stage": "git_init",
                "message": f"Thư mục Vault ({vault_path}) không phải là một Git repository hợp lệ."
            }

        # 2. Check git user.name and user.email
        name_check = subprocess.run(["git", "config", "user.name"], cwd=vault_path, capture_output=True, text=True)
        email_check = subprocess.run(["git", "config", "user.email"], cwd=vault_path, capture_output=True, text=True)
        user_name = name_check.stdout.strip()
        user_email = email_check.stdout.strip()

        if not user_name or not user_email:
            return {
                "status": "error",
                "stage": "git_config",
                "message": "Chưa cấu hình Git user.name hoặc user.email (cần chạy: git config --global user.name '...' và git config --global user.email '...')."
            }

        # 3. Check git remote
        remote_check = subprocess.run(["git", "remote", "get-url", "origin"], cwd=vault_path, capture_output=True, text=True)
        if remote_check.returncode != 0 or not remote_check.stdout.strip():
            return {
                "status": "error",
                "stage": "git_remote",
                "message": "Repository chưa được cấu hình remote 'origin' để push."
            }
        remote_url = remote_check.stdout.strip()

        # 4. Check status changes
        status_proc = subprocess.run(["git", "status", "--porcelain"], cwd=vault_path, capture_output=True, text=True)
        changed_lines = [l for l in status_proc.stdout.splitlines() if l.strip()]
        num_changed = len(changed_lines)

        # Check unpushed commits
        unpushed_proc = subprocess.run(["git", "log", "@{u}..HEAD", "--oneline"], cwd=vault_path, capture_output=True, text=True)
        has_unpushed = unpushed_proc.returncode == 0 and len(unpushed_proc.stdout.strip()) > 0

        if num_changed == 0 and not has_unpushed:
            return {
                "status": "noop",
                "message": "Vault đã đồng bộ hoàn toàn (không có file thay đổi và không có commit chưa push)."
            }

        commit_message = ""
        if num_changed > 0:
            # 5. git add .
            add_proc = subprocess.run(["git", "add", "."], cwd=vault_path, capture_output=True, text=True)
            if add_proc.returncode != 0:
                return {
                    "status": "error",
                    "stage": "git_add",
                    "message": f"Lỗi khi thực hiện 'git add .': {add_proc.stderr.strip()}"
                }

            # 6. git commit
            now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            commit_message = f"sync: | {num_changed} files changed at {now_str}"

            commit_proc = subprocess.run(
                ["git", "commit", "-m", commit_message],
                cwd=vault_path,
                capture_output=True,
                text=True
            )
            if commit_proc.returncode != 0:
                return {
                    "status": "error",
                    "stage": "git_commit",
                    "message": f"Lỗi khi tạo commit: {commit_proc.stderr.strip()}"
                }

        # 7. git push
        branch_proc = subprocess.run(["git", "branch", "--show-current"], cwd=vault_path, capture_output=True, text=True)
        branch = branch_proc.stdout.strip() or "master"

        try:
            push_proc = subprocess.run(
                ["git", "push", "origin", branch],
                cwd=vault_path,
                capture_output=True,
                text=True,
                timeout=60
            )
        except subprocess.TimeoutExpired:
            return {
                "status": "error",
                "stage": "git_push",
                "message": "Quá thời gian kết nối (timeout 60s) khi push lên remote origin."
            }

        if push_proc.returncode != 0:
            err_msg = push_proc.stderr.strip() or push_proc.stdout.strip()
            return {
                "status": "error",
                "stage": "git_push",
                "message": f"Đã add và commit thành công ({commit_message or 'trước đó'}) nhưng KHÔNG thể push lên GitHub ({remote_url}). Chi tiết: {err_msg}"
            }

        return {
            "status": "ok",
            "stage": "success",
            "files_changed": num_changed,
            "commit_message": commit_message,
            "branch": branch,
            "remote_url": remote_url,
            "message": f"Đã add, commit và push thành công lên {remote_url} ({branch})!"
        }
