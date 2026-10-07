# Obsidian QuickView

Ứng dụng xem và chỉnh sửa ghi chú Obsidian **nhẹ nhất**, khởi động tức thì — dành cho máy cấu hình yếu (Intel Celeron, RAM 4GB).

## Hiệu năng thực tế

| Chỉ số | Obsidian (Electron) | Obsidian QuickView |
|---|---|---|
| RAM khi mở | 400MB – 1GB | **~25MB** (server) + ~70MB (tab browser) |
| CPU khi khởi động | Cao, tải liên tục | **Không đáng kể** |
| Index vault lần đầu | 10–30 giây | **~1–3 giây** (FTS5) |
| Khởi động app | 5–15 giây | **< 0.2 giây** |

> **Lưu ý**: Con số trên đo trên thực tế bằng `ps` — server Python độc lập, tab browser chỉ tải static HTML/JS, không đóng gói Electron nặng.

## Quan trọng: hiểu đúng vai trò của app

Obsidian QuickView **không thay thế Obsidian**. App chỉ dùng cho:

- ✅ Xem nhanh ghi chú Markdown
- ✅ Tìm kiếm tức thì toàn bộ vault
- ✅ Chỉnh sửa cơ bản (soạn Markdown, lưu `Ctrl+S`)
- ✅ Xem công thức LaTeX, wikilinks, backlinks, frontmatter

❌ **Vẫn cần Obsidian khi**:
- Cài plugin community (Templater, Dataview, Obsidian Charts…)
- Dùng Obsidian Canvas, Graph View, Daily Notes template
- Cần syncing qua Obsidian Sync/Remotely Save
- Chỉnh sửa frontmatter YAML phức tạp, use Obsidian core features

**Quy tắc**: Mở QuickView khi cần **đọc/viết nhanh**. Mở Obsidian khi cần **sản xuất nội dung chuyên sâu**.

## Tính năng chính

### Tìm kiếm toàn văn FTS5
- Tìm tiếng Việt có dấu/không dấu: gõ `12 thi` ra `12 Thì`
- Tách tab: **Title / Content / Tag** — chọn đúng nơi cần tìm
- Chế độ `all`: gộp kết quả title + content

### CodeMirror 6 — 4 chế độ edit
- **Live**: soạn + preview đồng thời
- **Source**: chỉ mã nguồn
- **Split**: chia đôi màn hình
- **Preview**: chỉ xem kết quả

### Quản lý vault
- Chuyển vault không restart (vault switcher)
- Lưu vault mặc định tự động
- Tự phát hiện vault từ Obsidian Desktop + custom path

### Git Sync
- Một nút: `git add → commit → push origin`
- Kiểm tra trước: repo hợp lệ, user.name/email, remote origin

### Context Export + Mermaid
- Xuất ngữ cảnh liên kết ra Markdown (depth 1–2)
- Sơ đồ đồ thị Mermaid tự sinh

## Cài đặt

```bash
# Cài lệnh obs-view
bash install.sh

# Mở ứng dụng
obs-view

# Mở thẳng ghi chú
obs-view "12 Thì"

# Đánh lại index
obs-view --reindex
```

## Công nghệ

Python 3.12 Standard Library + SQLite FTS5 + CodeMirror 6 + KaTeX — zero external dependencies, chạy offline hoàn toàn.

## Giấy phép

MIT License — xem [LICENSE](LICENSE).
