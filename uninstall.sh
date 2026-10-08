#!/usr/bin/env bash
# Uninstall script for Obsidian QuickView
# Completely removes services, symlinks, desktop entries, and cached files.

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DEST="${HOME}/.local/bin"
DESKTOP_DEST="${HOME}/.local/share/applications"
CACHE_DIR="${HOME}/.cache/obsidian-quickview"

echo "🛑 Đang gỡ bỏ Obsidian QuickView khỏi máy..."

# 1. Dừng server nếu đang chạy
if [ -x "${DIR}/bin/obs-view" ]; then
  echo "⚡ Dừng server đang chạy..."
  "${DIR}/bin/obs-view" --stop 2>/dev/null || true
fi

# Fallback kill port 8765 if still running
if command -v fuser >/dev/null 2>&1; then
  fuser -k 8765/tcp 2>/dev/null || true
fi

# 2. Xóa symlink CLI
if [ -L "${BIN_DEST}/obs-view" ] || [ -f "${BIN_DEST}/obs-view" ]; then
  rm -f "${BIN_DEST}/obs-view"
  echo "✅ Đã gỡ lệnh 'obs-view' khỏi ${BIN_DEST}"
fi

# 3. Xóa desktop shortcut
if [ -f "${DESKTOP_DEST}/obsidian-quickview.desktop" ]; then
  rm -f "${DESKTOP_DEST}/obsidian-quickview.desktop"
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "${DESKTOP_DEST}" 2>/dev/null || true
  fi
  echo "✅ Đã xóa desktop shortcut tại ${DESKTOP_DEST}"
fi

# 4. Dọn dẹp cache và tiến trình lưu tạm
if [ -d "${CACHE_DIR}" ]; then
  rm -f "${CACHE_DIR}/server.pid" "${CACHE_DIR}/server.log"
  echo "✅ Đã dọn dẹp các tệp PID và log tạm tại ${CACHE_DIR}"
fi

echo ""
echo "🎉 Đã gỡ bỏ toàn bộ dịch vụ và phím tắt của Obsidian QuickView thành công!"
echo "   (Mã nguồn tại thư mục dự án vẫn được bảo lưu)."
