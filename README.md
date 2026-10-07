# Obsidian QuickView

Ứng dụng mini siêu nhẹ, khởi động tức thì để xem và tra cứu nhanh ghi chú trong vault Obsidian mà **không cần mở Obsidian nặng**.

Được thiết kế tối ưu riêng cho máy có cấu hình tiết kiệm tài nguyên (như Intel Celeron, RAM 4GB):
- **Khởi động < 0.2s** (so với 5–15s của Obsidian).
- **RAM < 25MB** (so với 400MB – 1GB của Electron).
- **Zero External Dependencies**: 100% Python 3.12 Standard Library + SQLite FTS5 + CodeMirror 6.
- **Hoạt động hoàn toàn Offline**: Toàn bộ thư viện Markdown & Highlight được đóng gói sẵn cục bộ.

---

## Tính Năng Nổi Bật

### 1. Tìm kiếm toàn văn tức thì (Instant FTS5 Search)
- Hỗ trợ tiếng Việt có dấu và không dấu (gõ `12 thi` tìm ra ngay `12 Thì`).
- **Tách biệt tìm theo Tiêu đề / Nội dung / Tag** với tab chuyển đổi mượt mà.
- Ưu tiên kết quả khớp Tiêu đề trước, sau đó tới Nội dung với trích đoạn highlight.
- Hỗ trợ tìm kiếm theo tag: `#python`, `#api`, `tag:frontend`.
- Tìm chế độ `all` gộp kết quả title + content, không trùng lặp.

### 2. Hỗ trợ trọn vẹn cú pháp Obsidian
- **Công thức toán học LaTeX**: Hiển thị mượt mà các khối `$$...$$`, `$$\n{content}\n$$` và inline `$formula$` nhờ KaTeX offline siêu nhẹ.
- **Liên kết nội bộ `[[Wikilinks]]`**: Nhấp chuột vào bất kỳ liên kết nào để nhảy ngay đến ghi chú đó không cần tải lại trang.
- **Ảnh đính kèm `![[image.png]]`**: Tự động nhận diện và hiển thị ảnh từ thư mục đính kèm trong vault.
- **Obsidian Callouts**: Hiển thị đẹp mắt các hộp `[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!IMPORTANT]`, v.v.
- **Bảng & Danh sách việc cần làm (Task lists)**: Hiển thị chuẩn GFM.
- **Backlinks (Liên kết ngược)**: Thống kê và hiển thị các ghi chú khác đang dẫn liên kết tới ghi chú hiện tại.
- **Frontmatter**: Hiển thị metadata YAML, nhấp vào liên kết trong frontmatter để mở ghi chú liên quan.

### 3. Chỉnh sửa nhanh với CodeMirror 6 (Quick Edit)
- **4 chế độ**:
  - **Live**: Soạn thảo trực tiếp, preview tự động cập nhật.
  - **Source**: Chỉ hiển thị mã nguồn Markdown thuần.
  - **Split**: Chia đôi màn hình — source ↔ preview đồng thời.
  - **Preview**: Chỉ xem kết quả render (read-only).
- Chế độ cuối cùng lưu lựa chọn vào localStorage, mở lại vẫn nhớ.
- Lưu ngay `Ctrl + S`, tự động re-index ghi chú sau khi lưu.
- **TOC Navigation**: Bảng mục lục bên phải tự động sinh từ heading trong ghi chú, cuốn tới section khi nhấp.

### 4. Quản lý Vault linh hoạt
- **Vault Switcher Modal**: Chuyển vault ngay trong app, không cần khởi động lại.
- **Persistent Selection**: Lưu vault mặc định vào `~/.cache/obsidian-quickview/vaults_config.json`.
- **Auto-Discovery**: Tự động phát hiện vault từ Obsidian Desktop + custom path.
- **Fallback Detection**: Xử lý gracefully khi vault không tồn tại.

### 5. Đồng bộ Git (Push Vault)
- Nút **Sync Vault** tự động `git add . → git commit → git push origin`.
- Kiểm tra trước: git repo hợp lệ, user.name/email đã cấu hình, remote origin tồn tại.
- Báo cáo chi tiết từng stage: add, commit message, branch, remote URL.
- Báo lỗi rõ ràng nếu push thất bại (kèm remote URL để debug).

### 6. Context Export & Mermaid Diagram
- **Copy Context**: Xuất ngữ cảnh liên kết ra Markdown với depth 1–2.
- **ASCII Tree**: Cấu trúc thư mục notes trực quan.
- **Mermaid Diagram**: Sơ đồ đồ thị liên kết giữa các ghi chú (graph TD).
- Mỗi note kèm: path, relative time ("2 hours ago"), depth, raw content trong code block.

### 7. Giao diện Obsidian Dark / Light hiện đại
- Tone màu tối bảo vệ mắt, phông chữ tối ưu cho đọc tài liệu kỹ thuật.
- Sidebar collapsible, lưu trạng thái vào localStorage.
- Breadcrumb history navigation (nút Back/Forward).
- SVG icons chuyên nghiệp.
- Responsive Paper layout.

---

## Cách Khởi Động

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

# Khởi động lại server
obs-view --restart
```

### 2. Dùng Menu Ứng Dụng Ubuntu:
- Nhấn phím `Super` (Windows) trên bàn phím.
- Gõ **Obsidian QuickView**.
- Bấm vào biểu tượng để mở app dưới dạng cửa sổ độc lập (Standalone App Window). Bạn có thể chuột phải chọn **Add to Favorites** để ghim lên thanh Dock.

---

## Phím Tắt Tiện Dụng

| Phím tắt | Chức năng |
|---|---|
| `Ctrl + K` hoặc `Ctrl + O` | Mở thanh Quick Switcher tìm kiếm ghi chú |
| `↑` / `↓` | Di chuyển giữa các kết quả tìm kiếm |
| `Enter` | Mở ghi chú đang chọn |
| `Esc` | Đóng hộp tìm kiếm / Thoát chế độ sửa nhanh |
| `Ctrl + S` | Lưu nội dung trong chế độ Sửa nhanh |
| `Alt + O` | Mở ghi chú hiện tại trong Obsidian thật |

---

## Cấu Trúc Dự Án

```
obsidian-quickview/
├── bin/
│   └── obs-view              # Script khởi chạy CLI, manage server, mở browser
├── core/
│   ├── config.py             # Hằng số cấu hình (port, host, paths, ignore dirs)
│   ├── parser.py             # Parser: frontmatter, tags, wikilinks, diacritics
│   ├── search.py             # SearchEngine: FTS5 title/content/tag search
│   ├── index.py              # VaultIndex: SQLite schema, incremental scan, backlinks
│   ├── server.py             # HTTP Server (ThreadingHTTPServer + API endpoints)
│   └── vault_manager.py      # Vault discovery, config persistence, switching
├── static/
│   ├── index.html            # SPA interface
│   ├── app.css               # Theme Dark/Light, Callouts, responsive layout
│   ├── app.js                # Client: CM6 editor, search, render, vault mgmt
│   ├── icon.svg              # Logo ứng dụng
│   ├── marked.min.js         # Offline Markdown parser
│   ├── highlight.min.js      # Syntax highlighting
│   ├── github-dark.min.css   # Dark theme for code blocks
│   ├── katex.min.js          # LaTeX renderer (offline)
│   ├── katex.min.css         # KaTeX CSS
│   └── fonts/                # Web fonts WOFF2 cho KaTeX
├── scripts/
│   ├── cm6-entry.js          # CodeMirror 6 entry point
│   └── build-cm6.js          # Build script cho CM6 bundle
├── tests/
│   ├── test_indexer.py       # Unit tests FTS5 & indexer
│   ├── test_vault_manager.py # Unit tests vault manager
│   └── test_render_markdown.js  # Unit tests render Markdown & LaTeX
├── package.json              # pnpm workspace, CM6 devDependencies
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── indexer.py                # Legacy entry point (đã chuyển vào core/)
├── server.py                 # Legacy entry point (đã chuyển vào core/)
├── install.sh                # Script cài đặt symlink + shortcut .desktop
└── README.md
```

---

## API Endpoints

| Endpoint | Method | Mô tả |
|---|---|---|
| `/api/search?q=...&mode=title\|content\|all` | GET | Tìm kiếm ghi chú |
| `/api/note?path=...` | GET | Lấy nội dung + metadata 1 note |
| `/api/context?path=...&depth=1\|2` | GET | Xuất ngữ cảnh liên kết (Markdown + Mermaid) |
| `/api/resolve?target=...` | GET | Giải quyết wikilink/attachment path |
| `/api/open-file?path=...` | GET | Mở file bằng Firefox |
| `/api/tree` | GET | Cây thư mục vault |
| `/api/tags` | GET | Danh sách tag + thống kê |
| `/api/reindex?force=1` | GET | Đánh lại toàn bộ index |
| `/api/info` | GET | Thông tin vault đang hoạt động |
| `/api/vaults` | GET | Danh sách vault có sẵn |
| `/api/vaults/switch` | POST | Chuyển vault active |
| `/api/vaults/add` | POST | Thêm vault tuỳ chỉnh |
| `/api/save` | POST | Lưu nội dung ghi chú |
| `/api/git-sync` | POST | Push vault lên Git (add → commit → push) |

---

## Công Nghệ Sử Dụng

| Thành phần | Công nghệ |
|---|---|
| Backend | Python 3.12 Standard Library (http.server, sqlite3) |
| Search Engine | SQLite FTS5 với unicode61 + remove_diacritics |
| Markdown Parser | marked.min.js (offline) |
| Code Editor | CodeMirror 6 (@codemirror/commands, lang-markdown, state, view) |
| Math Rendering | KaTeX offline |
| Syntax Highlight | highlight.js (offline) |
| Launcher | Bash + Firefox/Chrome/Brave |
| Package Manager | pnpm |
