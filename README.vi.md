# DisCloud

> Lưu trữ đám mây dùng Discord. Upload file dung lượng tuỳ ý — server cắt
> file thành các chunk 8 MB, lưu mỗi chunk dưới dạng attachment trong một
> channel Discord, rồi gộp lại khi tải về. Hỗ trợ HTTP Range để stream video.

[![CI](https://github.com/tranhoangmanh/discloud/actions/workflows/ci.yml/badge.svg)](https://github.com/tranhoangmanh/discloud/actions/workflows/ci.yml)
[![Docker image](https://github.com/tranhoangmanh/discloud/actions/workflows/docker-image.yml/badge.svg)](https://github.com/tranhoangmanh/discloud/actions/workflows/docker-image.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](.nvmrc)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

🇬🇧 **English:** [README.md](./README.md)

<p align="center">
  <img src="docs/images/ui-light.png" alt="DisCloud UI — light theme" width="48%" />
  <img src="docs/images/ui-dark.png" alt="DisCloud UI — dark theme" width="48%" />
</p>

## Mục lục

- [Tính năng](#tính-năng)
- [Kiến trúc](#kiến-trúc)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Hướng dẫn tạo Discord bot](#hướng-dẫn-tạo-discord-bot)
- [Cấu hình](#cấu-hình)
- [API](#api)
- [Ví dụ](#ví-dụ)
- [Lệnh npm](#lệnh-npm)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Phát triển](#phát-triển)
- [Khắc phục sự cố](#khắc-phục-sự-cố)
- [Giới hạn](#giới-hạn)
- [Lời cảm ơn](#lời-cảm-ơn)
- [Giấy phép](#giấy-phép)

## Tính năng

- ☁️ **Dung lượng không giới hạn** — file được cắt thành chunk 8 MB và lưu
  thành attachment Discord, rồi nối lại khi tải về.
- 🎬 **Stream video mượt** — hỗ trợ đầy đủ HTTP `Range:` để tua/seek.
- 🔁 **Resumable upload** qua session API + luồng SSE báo tiến độ.
- 🔐 **Toàn vẹn dữ liệu** — checksum SHA-256 + ETag cho conditional request.
- ♻️ **Tự refresh URL** — URL CDN của Discord hết hạn sau ~24 h; DisCloud
  lưu `messageId` và lấy lại URL đã ký mỗi khi cần.
- 🎨 **UI hiện đại** — kéo thả, upload nhiều file, light/dark theme.
- 📦 **Sẵn sàng Docker** — image multi-stage, chạy non-root, có healthcheck,
  multi-arch.

## Kiến trúc

```
                                 ┌────────────────┐
       upload (cắt chunk,        │   Discord API  │
       có backpressure)          │ (channel msgs) │
client ──────────►  Express  ───►│   attachments  │
                       │         └────────────────┘
                       ▼
                ┌──────────┐
                │  Redis   │  ← metadata: fileId → { fileName, size,
                └──────────┘                          chunkSize, parts: [{ messageId, … }] }
```

Mỗi part lưu `messageId` của Discord (không phải URL trực tiếp), nên khi tải
về server có thể **làm mới URL CDN đã hết hạn** (URL attachment của Discord
được ký và hết hạn sau ~24 giờ).

## Bắt đầu nhanh

```bash
git clone https://github.com/tranhoangmanh/discloud.git
cd discloud
cp .env.example .env
# Điền REDIS_URL, DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID

npm install
npm run dev          # tsx watcher
# hoặc
npm run build && npm start
```

Mở <http://localhost:5000>.

### Docker

```bash
docker run -p 5000:5000 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e DISCORD_BOT_TOKEN=... \
  -e DISCORD_CHANNEL_ID=... \
  ghcr.io/tranhoangmanh/discloud:latest
```

### Docker Compose

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data

  discloud:
    image: ghcr.io/tranhoangmanh/discloud:latest
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      REDIS_URL: redis://redis:6379
      DISCORD_BOT_TOKEN: ${DISCORD_BOT_TOKEN}
      DISCORD_CHANNEL_ID: ${DISCORD_CHANNEL_ID}
    depends_on:
      - redis

volumes:
  redis-data:
```

```bash
docker compose up -d
```

## Hướng dẫn tạo Discord bot

1. Tạo một instance [Redis](https://redis.com/) và copy URL → `REDIS_URL`.
2. Tạo một server Discord bạn quản lý.
3. Vào [Discord Developer Portal](https://discord.com/developers/applications),
   tạo application mới rồi thêm Bot.
   - Reset token, copy giá trị → `DISCORD_BOT_TOKEN`.
   - Copy **APPLICATION ID**.
4. Mời bot vào server:
   `https://discord.com/oauth2/authorize?client_id={CLIENT_ID}&scope=bot&permissions=2048`
   (thay `{CLIENT_ID}` bằng application ID).
5. Chọn 1 channel; chuột phải → "Copy Channel ID" → `DISCORD_CHANNEL_ID`.

> ⚠️ **Về điều khoản Discord:** Dùng bot để lưu file của người dùng có thể
> vi phạm Terms of Service của Discord. Chỉ dùng cho mục đích cá nhân và
> bạn tự chịu rủi ro.

## Cấu hình

| Biến môi trường              | Mặc định         | Mô tả                                                     |
| ---------------------------- | ---------------- | --------------------------------------------------------- |
| `REDIS_URL`                  | _bắt buộc_       | URL kết nối Redis                                         |
| `DISCORD_BOT_TOKEN`          | _bắt buộc_       | Token bot dùng để upload                                  |
| `DISCORD_CHANNEL_ID`         | _bắt buộc_       | Channel sẽ chứa các chunk                                 |
| `PORT`                       | `5000`           | Cổng HTTP                                                 |
| `LOG_LEVEL`                  | `info`           | Log level của pino                                        |
| `NODE_ENV`                   | `development`    | `development` / `production` / `test`                     |
| `CORS_ORIGINS`               | `*`              | Whitelist origin, ngăn cách bằng dấu phẩy                 |
| `DISCORD_UPLOAD_CONCURRENCY` | `2`              | Số request upload song song lên Discord                   |
| `FILE_TTL_SECONDS`           | `0`              | TTL cho metadata file (0 = không hết hạn)                 |
| `DEFAULT_RANGE_SIZE`         | `5242880` (5 MB) | Kích thước mặc định cho Range request không giới hạn cuối |

## API

### Upload trực tiếp

```
POST /upload?fileName=<tên>
Content-Type: <mime>

<bytes>
```

Trả về:

```json
{
  "fileId": "…",
  "fileSize": 12345,
  "sha256": "…",
  "url": "/file/<fileId>",
  "longURL": "/file/<fileId>/<fileName>",
  "downloadURL": "/file/<fileId>?download=1",
  "longDownloadURL": "/file/<fileId>/<fileName>?download=1",
  "parts": ["https://cdn.discordapp.com/…", …]
}
```

### Resumable upload

```
POST /upload/init                  → { uploadId, progressUrl }
POST /upload/:uploadId             → gửi tiếp byte (kích thước tuỳ ý)
POST /upload/:uploadId/complete    → { fileId, … }
GET  /upload/:uploadId             → trạng thái
GET  /upload/:uploadId/events      → SSE stream báo tiến độ
DELETE /upload/:uploadId           → huỷ upload
```

### Files

```
GET    /files                  → danh sách (có phân trang)
GET    /files/:id              → metadata
DELETE /files/:id              → xoá (đồng thời xoá tin nhắn Discord)
GET    /file/:id               → tải xuống (hỗ trợ Range)
GET    /file/:id/:fileName     → tải xuống kèm tên gốc
```

### Health

```
GET /health   → { status, redis, uptime }
```

## Ví dụ

### Upload một file

```bash
curl -X POST \
  --data-binary @video.mp4 \
  -H "Content-Type: video/mp4" \
  "http://localhost:5000/upload?fileName=video.mp4"
```

### Resumable upload

```bash
# 1. khởi tạo session
UPLOAD_ID=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"fileName":"big.iso","fileSize":4500000000}' \
  http://localhost:5000/upload/init | jq -r .uploadId)

# 2. upload bytes (có thể gọi lại nếu mất kết nối)
curl -X POST --data-binary @big.iso "http://localhost:5000/upload/$UPLOAD_ID"

# 3. theo dõi tiến độ ở terminal khác
curl -N "http://localhost:5000/upload/$UPLOAD_ID/events"

# 4. hoàn tất
curl -X POST "http://localhost:5000/upload/$UPLOAD_ID/complete"
```

### Lấy danh sách file

```bash
curl "http://localhost:5000/files?limit=20&offset=0" | jq
```

### Tải một range (tua video)

```bash
curl -H "Range: bytes=1048576-2097151" \
  -o chunk.bin \
  "http://localhost:5000/file/<fileId>"
```

### Xoá file

```bash
curl -X DELETE "http://localhost:5000/files/<fileId>"
```

## Lệnh npm

| Lệnh                | Mô tả                           |
| ------------------- | ------------------------------- |
| `npm run dev`       | Chạy dev server (tsx watch)     |
| `npm run build`     | Biên dịch TypeScript ra `dist/` |
| `npm start`         | Chạy server đã build            |
| `npm run lint`      | ESLint                          |
| `npm run format`    | Prettier (write)                |
| `npm run typecheck` | `tsc --noEmit`                  |
| `npm test`          | Chạy unit test (vitest)         |

## Cấu trúc thư mục

```
src/
  index.ts            # bootstrap, graceful shutdown
  app.ts              # cấu hình express
  config.ts           # validate env (zod)
  logger.ts           # pino
  routes/             # http handler (upload, download, files, health)
  services/           # discord, redis, sse broker
  middleware/         # cors, error handler
  utils/              # range parser, helper tên file, …
test/                 # unit test (vitest)
static/               # frontend (UI kéo thả, light/dark)
docs/images/          # ảnh chụp cho README
.github/workflows/    # CI + Docker image
```

## Phát triển

```bash
git clone https://github.com/tranhoangmanh/discloud.git
cd discloud
npm install
cp .env.example .env

npm run dev        # tsx watch (tự restart khi đổi code)
npm test           # unit test
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

Husky + lint-staged tự chạy ESLint và Prettier mỗi khi commit.

PR luôn được chào đón. Vui lòng đảm bảo `npm run lint`, `npm run typecheck`
và `npm test` đều pass trước khi submit.

## Khắc phục sự cố

<details>
<summary><b>File không tải được sau ~24 giờ</b></summary>

Phiên bản cũ của project lưu trực tiếp URL CDN của Discord. Các URL đó được
ký và hết hạn sau ~24 giờ. Phiên bản hiện tại lưu `messageId` của tin nhắn
Discord và lấy lại URL đã ký khi cần, nên vấn đề này không còn xảy ra. Nếu
bạn nâng cấp từ bản cũ, các file upload **trước khi** nâng cấp sẽ không có
`messageId` và phải upload lại.

</details>

<details>
<summary><b>Upload rất chậm</b></summary>

Discord giới hạn rate cho bot (5 attachment / 5 s với app free). Tăng
`DISCORD_UPLOAD_CONCURRENCY` cẩn thận — vượt quá ~3 sẽ thường xuyên gặp 429. `p-queue` bên trong đã có exponential backoff cho 429.

</details>

<details>
<summary><b>Lỗi <code>invalid Discord token</code> khi khởi động</b></summary>

Đảm bảo `DISCORD_BOT_TOKEN` là token **bot** (Developer Portal → Bot →
Reset Token), không phải client secret của application. Token bot thường
bắt đầu bằng `MT...` hoặc `OD...`.

</details>

<details>
<summary><b>Server trả <code>416 Range Not Satisfiable</code></b></summary>

Đây là hành vi đúng khi `Range:` header sai cú pháp (vd. `bytes=abc-`)
hoặc range vượt quá size file. Trình duyệt và player chuẩn không gửi
range không hợp lệ; lỗi này chỉ thường gặp với client tự viết.

</details>

<details>
<summary><b>Thanh tiến độ đứng ở 0% nhưng upload vẫn xong</b></summary>

`xhr.upload.onprogress` chỉ chạy trong lúc gửi request body. Discord nhận
xong rồi mới forward sang channel, có thể mất vài giây cho file lớn. Dùng
luồng SSE `/upload/:id/events` để theo dõi tiến độ ở mức chunk.

</details>

## Giới hạn

- Bất kỳ ai có `fileId` đều tải được file (chưa có authentication). Có thể
  bổ sung middleware auth dễ dàng — xem `src/middleware/`.
- Chunk được lưu trong channel Discord dưới dạng tin nhắn của bot; xoá đi
  qua Discord API và là best-effort.
- `chunkSize` cố định 8 MB (giới hạn attachment cho bot free của Discord).
- Discord có thể đổi điều khoản bất kỳ lúc nào, ảnh hưởng đến project này.

## Lời cảm ơn

- Ý tưởng và code gốc: [napthedev/discloud](https://github.com/napthedev/discloud).
- Helper backpressure cho stream: [forscht/ddrive](https://github.com/forscht/ddrive).

## Giấy phép

[MIT](LICENSE)
