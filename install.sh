#!/usr/bin/env bash
# Install script for Obsidian QuickView

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DEST="${HOME}/.local/bin"
DESKTOP_DEST="${HOME}/.local/share/applications"
ICON_PATH="${DIR}/static/icon.svg"

echo "📦 Đang cài đặt Obsidian QuickView..."

# 1. Chmod executable
chmod +x "${DIR}/bin/obs-view"

# 2. Symlink to ~/.local/bin
mkdir -p "${BIN_DEST}"
ln -sf "${DIR}/bin/obs-view" "${BIN_DEST}/obs-view"
echo "✅ Đã tạo lệnh 'obs-view' tại ${BIN_DEST}/obs-view"

# 3. Create .desktop file for Ubuntu app launcher
mkdir -p "${DESKTOP_DEST}"
cat <<EOF > "${DESKTOP_DEST}/obsidian-quickview.desktop"
[Desktop Entry]
Version=1.0
Type=Application
Name=Obsidian QuickView
GenericName=Markdown Note Viewer
Comment=Xem và tìm kiếm nhanh ghi chú Obsidian
Exec=${BIN_DEST}/obs-view
Icon=${ICON_PATH}
Terminal=false
Categories=Office;Utility;TextEditor;
Keywords=obsidian;markdown;notes;quick;viewer;
StartupWMClass=brave-127.0.0.1__8765-Default
EOF

chmod +x "${DESKTOP_DEST}/obsidian-quickview.desktop"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${DESKTOP_DEST}" 2>/dev/null || true
fi

echo "✅ Đã tạo shortcut ứng dụng Desktop tại: ${DESKTOP_DEST}/obsidian-quickview.desktop"
echo ""
echo "🎉 Hoàn tất cài đặt! Bạn có thể khởi động bằng các cách:"
echo "   1. Gõ lệnh: obs-view trong terminal"
echo "   2. Tìm 'Obsidian QuickView' trong menu ứng dụng của Ubuntu"
