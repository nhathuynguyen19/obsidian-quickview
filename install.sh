#!/usr/bin/env bash
# Install & Rebuild script for Obsidian QuickView
# Installs dependencies, builds/bundles assets, registers CLI/Desktop entries,
# and automatically restarts the background server with latest changes.

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DEST="${HOME}/.local/bin"
DESKTOP_DEST="${HOME}/.local/share/applications"
ICON_PATH="${DIR}/static/icon.svg"

echo "========================================================"
echo "⚡ Obsidian QuickView: Cài đặt, Build & Khởi động lại"
echo "========================================================"

# 1. Kiểm tra môi trường tiên quyết
if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ Lỗi: Cần cài đặt python3 (phiên bản >= 3.10) trước khi chạy."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Lỗi: Cần cài đặt Node.js trước khi build."
  exit 1
fi

# 2. Cài đặt các thư viện phụ thuộc (nếu chưa có hoặc có thay đổi)
echo "📦 [1/4] Kiểm tra và cài đặt dependencies..."
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --prefer-offline 2>&1 | grep -v "Update available" || true
elif command -v npm >/dev/null 2>&1; then
  npm install
else
  echo "⚠️ Không tìm thấy pnpm hoặc npm. Thử tiếp tục nếu dependencies đã có..."
fi

# 3. Build & đóng gói toàn bộ assets vào static/
echo "⚡ [2/4] Tự động build lại toàn bộ assets (CodeMirror 6, Marked, Highlight, KaTeX)..."
node "${DIR}/scripts/build.js"

# 4. Phân quyền và tạo symlink CLI / Desktop entry
echo "🔗 [3/4] Cấu hình symlink và phím tắt Desktop..."
chmod +x "${DIR}/bin/obs-view" "${DIR}/install.sh" "${DIR}/uninstall.sh"
mkdir -p "${BIN_DEST}"
ln -sf "${DIR}/bin/obs-view" "${BIN_DEST}/obs-view"

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
EOF
chmod +x "${DESKTOP_DEST}/obsidian-quickview.desktop"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${DESKTOP_DEST}" 2>/dev/null || true
fi

# 5. Khởi động lại toàn bộ server để áp dụng code mới
echo "🔄 [4/4] Khởi động lại toàn bộ server Obsidian QuickView..."
"${DIR}/bin/obs-view" --restart

echo ""
echo "========================================================"
echo "🎉 Hoàn tất cài đặt và khởi động lại toàn bộ hệ thống!"
echo "🌐 URL: http://127.0.0.1:8765"
echo ""
echo "💡 Các lệnh hữu ích:"
echo "   - obs-view              : Mở giao diện ứng dụng"
echo "   - ./install.sh          : Build lại mã nguồn & restart toàn bộ server"
echo "   - ./uninstall.sh        : Dừng server và gỡ bỏ toàn bộ khỏi máy"
echo "========================================================"
