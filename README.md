# Obsidian QuickView ⚡

Ứng dụng mini siêu nhẹ, khởi động tức thì để xem và tra cứu nhanh ghi chú trong vault Obsidian mà **không cần mở Obsidian nặng**.

Được thiết kế tối ưu riêng cho máy có cấu hình tiết kiệm tài nguyên (như Intel Celeron, RAM 4GB):
- **Khởi động < 0.2s** (so với 5-15s của Obsidian).
- **RAM < 25MB** (so với 400MB - 1GB của Electron).
- **Zero External Dependencies**: 100% Python 3.12 Standard Library + SQLite FTS5.
- **Hoạt động hoàn toàn Offline**: Toàn bộ thư viện Markdown & Highlight được đóng gói sẵn cục bộ.

---

## 🌟 Tính Năng Nổi Bật

1. **Tìm kiếm toàn văn tức thì (Instant FTS5 Search)**:
   - Hỗ trợ tiếng Việt có dấu và không dấu (gõ `12 thi` tìm ra ngay `12 Thì`).
   - Ưu tiên kết quả khớp Tiêu đề trước, sau đó tới Nội dung với trích đoạn highlight.
   - Hỗ trợ tìm kiếm theo tag: `#python`, `#api`.
2. **Hỗ trợ trọn vẹn cú pháp Obsidian**:
   - **Công thức toán học LaTeX**: Hiển thị mượt mà các khối công thức `$$...$$`, `$$\n{content}\n$$` và inline `$formula$` nhờ KaTeX offline siêu nhẹ.
   - **Liên kết nội bộ `[[Wikilinks]]`**: Nhấp chuột vào bất kỳ liên kết nào để nhảy ngay đến ghi chú đó không cần tải lại trang.
   - **Ảnh đính kèm `![[image.png]]`**: Tự động nhận diện và hiển thị ảnh từ thư mục đính kèm trong vault (`images/`).
   - **Obsidian Callouts**: Hiển thị đẹp mắt các hộp ghi chú `[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!IMPORTANT]`, v.v.
   - **Bảng & Danh sách việc cần làm (Task lists)**: Hiển thị chuẩn GFM.
   - **Backlinks (Liên kết ngược)**: Thống kê và hiển thị các ghi chú khác đang dẫn liên kết tới ghi chú hiện tại.
3. **Chế độ Sửa nhanh (Quick Edit)**:
   - Cho phép chỉnh sửa nhanh nội dung ghi chú và lưu lại ngay lập tức (`Ctrl + S`) mà không cần mở app nặng.
4. **Mở trong Obsidian**:
   - Nút "💎 Mở trong Obsidian" sẵn sàng kích hoạt giao thức `obsidian://open` khi bạn cần dùng các plugin chuyên sâu.
5. **Giao diện Obsidian Dark / Light hiện đại**:
   - Tone màu tối bảo vệ mắt, phông chữ tối ưu cho việc đọc tài liệu kỹ thuật.

---

## 🚀 Cách Khởi Động

### 1. Dùng lệnh Terminal:
```bash
# Mở ứng dụng (tự động bật cửa sổ giao diện)
obs-view

# Mở thẳng một ghi chú cụ thể
obs-view "12 Thì"

# Kiểm tra trạng thái server
obs-view --status

# Đánh lại toàn bộ chỉ mục
obs-view --reindex

# Dừng server
obs-view --stop
```

### 2. Dùng Menu Ứng Dụng Ubuntu:
- Nhấn phím `Super` (Windows) trên bàn phím.
- Gõ **Obsidian QuickView**.
- Bấm vào biểu tượng để mở app dưới dạng cửa sổ độc lập (Standalone App Window). Bạn có thể chuột phải chọn **Add to Favorites** để ghim lên thanh Dock.

---

## ⌨️ Phím Tắt Tiện Dụng

| Phím tắt | Chức năng |
|---|---|
| `Ctrl + K` hoặc `Ctrl + O` | Mở thanh Quick Switcher tìm kiếm ghi chú |
| `↑` / `↓` | Di chuyển giữa các kết quả tìm kiếm |
| `Enter` | Mở ghi chú đang chọn |
| `Esc` | Đóng hộp tìm kiếm / Thoát chế độ sửa nhanh |
| `Ctrl + S` | Lưu nội dung trong chế độ Sửa nhanh |
| `Alt + O` | Mở ghi chú hiện tại trong Obsidian thật |

---

## 📁 Cấu Trúc Dự Án

```
obsidian-quickview/
├── bin/
│   └── obs-view          # Script khởi chạy CLI và desktop app
├── static/
│   ├── index.html        # Giao diện web SPA
│   ├── app.css           # Theme Obsidian Dark/Light và Callouts
│   ├── app.js            # Xử lý render Markdown, LaTeX, Wikilinks, Search
│   ├── icon.svg          # Logo ứng dụng
│   ├── marked.min.js     # Bộ biên dịch Markdown offline
│   ├── highlight.min.js  # Tô màu cú pháp code offline
│   ├── github-dark.min.css
│   ├── katex.min.js      # Bộ render LaTeX offline siêu nhẹ
│   ├── katex.min.css     # CSS định dạng công thức toán
│   └── fonts/            # Web fonts WOFF2 cho KaTeX
├── tests/
│   ├── test_indexer.py   # Unit tests kiểm thử FTS5 và bộ quét
│   └── test_render_markdown.js # Unit tests render Markdown & LaTeX
├── indexer.py            # SQLite FTS5 Indexer và vi phân mtime
├── server.py             # HTTP Server siêu nhẹ (<25MB RAM)
└── install.sh            # Script cài đặt symlink và shortcut .desktop
```
