# DisCloud Landing UI (Poster + Preview)

## Visual Thesis

Monochrome premium: nền tối sâu, vật liệu glass tinh tế, 1 accent tím, cảm giác “product-grade” và tập trung vào brand + hành động.

## Goals

- Tạo ấn tượng landing page mạnh ngay first viewport (brand rõ, 1 headline gọn, 1 CTA chính).
- Vẫn giữ trải nghiệm “app” trên cùng trang: upload + danh sách file dễ thao tác.
- Tăng cảm giác hoàn thiện: spacing, typography, motion có chủ đích, trạng thái rõ ràng.

## Non-Goals

- Không tách sang trang `/app`.
- Không thêm auth, không thay đổi API backend.
- Không thêm framework frontend; giữ static HTML + CSS (có thể tiếp tục dùng Bootstrap CDN hiện có).

## Content Plan

### 1) Hero (full-bleed poster)

- Header overlay gọn: logo + link GitHub.
- Headline 2–3 dòng tối đa, copy 1 câu.
- CTA chính: “Bắt đầu tải lên” (scroll đến khu vực upload).
- Secondary CTA: “Xem file đã lưu” (scroll đến bảng).
- Visual anchor: nền full-bleed (gradient + noise nhẹ) và khối “Preview” dạng mockup (khung app) đặt ở vùng yên tĩnh, không cạnh tranh headline.

### 2) Proof / Features (ngắn, dễ quét)

- 3 feature bullets với icon tối giản:
  - Chunk 8MB + upload song song
  - Download hỗ trợ Range
  - Copy link + quản lý file

### 3) App Section (workspace)

- Upload module (dropzone, chọn file, progress list).
- Stored files table + search.
- Empty/error states rõ ràng.

### 4) Footer (trust + caveat)

- Note ngắn về giới hạn/ToS, link README.

## Interaction Thesis (Motion)

- Hero entrance: stagger nhẹ cho headline, CTA, preview (opacity + translate, 180–240ms).
- Preview hover: subtle parallax/tilt rất nhẹ hoặc glow khi hover CTA (không gây nhiễu).
- Upload progress: bar easing + trạng thái “xong/lỗi” đổi tone; toast slide-in thống nhất.

## Layout & Styling Rules

- Hero phải edge-to-edge; chỉ constrain nội dung bằng container nội bộ (text column ~56–64ch).
- Giữ 1 accent color (tím). Không thêm accent thứ hai.
- Giảm “chip soup”: tối đa 2–3 chips hoặc chuyển thành 1 dòng meta.
- Cards chỉ dùng khi là interaction surface (upload, preview, table wrapper).

## Implementation Notes (static/index.html)

- Restructure DOM thành: `header` (overlay) → `hero` (full bleed) → `features` → `app` → `footer`.
- Add anchor links + smooth scroll (CSS `scroll-behavior: smooth` hoặc JS).
- Keep existing JS data flow:
  - `POST /upload?fileName=...`
  - `GET /files`
  - `DELETE /files/:id`
- Ensure URLs copied are absolute; prefer `longURL` when available.

## Acceptance Criteria

- First viewport giống landing page: brand + headline + 1 CTA chính + preview (không cảm giác “admin tool”).
- App section vẫn thao tác được như trước (upload, copy, search, delete).
- Motion tinh tế, không lag; có `prefers-reduced-motion`.
- Prettier check pass cho `static/index.html`.
