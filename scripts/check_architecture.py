#!/usr/bin/env python3
"""
Architecture & Documentation Linter for Obsidian QuickView.
Ensures:
1. Every source file in core/, static/js/, static/css/ is documented in ARCHITECTURE.md.
2. File sizes remain reasonable (< 450 lines, with explicit exceptions list).
3. ARCHITECTURE.md contains Mermaid diagram and Feature-to-File Matrix.
"""

import os
import sys
import glob

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARCH_DOC_PATH = os.path.join(PROJECT_DIR, "ARCHITECTURE.md")

# Thresholds
MAX_LINES_DEFAULT = 450
EXCEPTIONS_MAX_LINES = {
    # Modals & settings contain multiple UI tabs & form dialogs
    "static/css/modals.css": 900,
    "static/js/settings.js": 600,
}


def check_architecture():
    errors = []
    warnings = []

    print("🔍 Checking Obsidian QuickView Architecture & Documentation...")

    if not os.path.isfile(ARCH_DOC_PATH):
        print("❌ ERROR: ARCHITECTURE.md is missing at project root!")
        sys.exit(1)

    with open(ARCH_DOC_PATH, "r", encoding="utf-8") as f:
        arch_content = f.read()

    # 1. Verify Mermaid Diagram and Matrix Table presence
    if "```mermaid" not in arch_content:
        errors.append("ARCHITECTURE.md is missing a Mermaid architecture diagram ('```mermaid').")
    if "Feature-to-File Matrix" not in arch_content and "Bảng Tra Cứu Tính Năng" not in arch_content:
        errors.append("ARCHITECTURE.md is missing the Feature-to-File Matrix table.")

    # 2. Gather source files
    source_patterns = [
        "core/*.py",
        "static/js/*.js",
        "static/css/*.css",
    ]

    source_files = []
    for pat in source_patterns:
        full_pat = os.path.join(PROJECT_DIR, pat)
        for filepath in glob.glob(full_pat):
            rel_path = os.path.relpath(filepath, PROJECT_DIR)
            source_files.append(rel_path)

    # 3. Check documentation coverage & file length
    for rel_path in sorted(source_files):
        basename = os.path.basename(rel_path)
        full_path = os.path.join(PROJECT_DIR, rel_path)

        # Check documentation
        if basename not in arch_content and rel_path not in arch_content:
            errors.append(
                f"Tệp mã nguồn '{rel_path}' CHƯA ĐƯỢC GHI CHÉP trong ARCHITECTURE.md! "
                f"Vui lòng cập nhật sơ đồ hoặc bảng Feature-to-File Matrix."
            )

        # Check line length
        with open(full_path, "r", encoding="utf-8") as sf:
            line_count = len(sf.readlines())

        max_allowed = EXCEPTIONS_MAX_LINES.get(rel_path, MAX_LINES_DEFAULT)
        if line_count > max_allowed:
            errors.append(
                f"Tệp '{rel_path}' có {line_count} dòng (vượt quá giới hạn cho phép {max_allowed} dòng). "
                f"Vui lòng chia nhỏ thành sub-module để đảm bảo tính module hóa."
            )

    # Output results
    if errors:
        print("\n❌ ARCHITECTURE VIOLATIONS FOUND:")
        for err in errors:
            print(f"  • {err}")
        print("\n👉 Definition of Done: Bạn phải cập nhật ARCHITECTURE.md trước khi kết thúc task!\n")
        sys.exit(1)
    else:
        print(f"✅ Architecture check PASSED! ({len(source_files)} source files verified)")
        if warnings:
            for w in warnings:
                print(f"  ⚠️ {w}")
        sys.exit(0)


if __name__ == "__main__":
    check_architecture()
