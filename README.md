# DisCloud

> Cloud storage backed by Discord. Upload files of any size; the server splits
> them into 8 MB chunks, stores each chunk as a Discord channel attachment,
> and serves them back as one stream — with HTTP range support for video.

[![CI](https://github.com/tranhoangmanh/discloud/actions/workflows/ci.yml/badge.svg)](https://github.com/tranhoangmanh/discloud/actions/workflows/ci.yml)

## Architecture

```
                                 ┌────────────────┐
       upload (chunked,          │   Discord API  │
       backpressure)             │ (channel msgs) │
client ──────────►  Express  ───►│   attachments  │
                       │         └────────────────┘
                       ▼
                ┌──────────┐
                │  Redis   │  ← metadata: fileId → { fileName, size,
                └──────────┘                          chunkSize, parts: [{messageId,…}] }
```

Each "part" stores the Discord `messageId` (not just the URL), so when a
client downloads, the server can **refresh expired CDN URLs** (Discord
attachment URLs are signed and expire after ~24 hours).

## Quick start

```bash
cp .env.example .env
# fill in REDIS_URL, DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID

npm install
npm run dev          # tsx watcher
# or
npm run build && npm start
```

### With Docker

```bash
docker run -p 5000:5000 \
  -e REDIS_URL=... \
  -e DISCORD_BOT_TOKEN=... \
  -e DISCORD_CHANNEL_ID=... \
  ghcr.io/tranhoangmanh/discloud:latest
```

## Setup guide (Discord bot)

1. Create a [Redis](https://redis.com/) instance and copy the connection URL → `REDIS_URL`.
2. Create a Discord server you control.
3. Go to the [Discord Developer Portal](https://discord.com/developers/applications), create a new application, then add a Bot.
   - Reset the token, copy it → `DISCORD_BOT_TOKEN`.
   - Copy the **APPLICATION ID**.
4. Invite the bot:
   `https://discord.com/oauth2/authorize?client_id={CLIENT_ID}&scope=bot&permissions=2048`
   (replace `{CLIENT_ID}` with the application ID).
5. Pick a channel; right-click → "Copy Channel ID" → `DISCORD_CHANNEL_ID`.

> ⚠️ **About Discord ToS:** Using a bot to store arbitrary files for end
> users can violate Discord's Terms of Service. Use this only for personal
> projects and at your own risk.

## Configuration

| Variable                     | Default          | Description                                     |
| ---------------------------- | ---------------- | ----------------------------------------------- |
| `REDIS_URL`                  | _required_       | Redis connection URL                            |
| `DISCORD_BOT_TOKEN`          | _required_       | Bot token used to upload                        |
| `DISCORD_CHANNEL_ID`         | _required_       | Channel where chunks are posted                 |
| `PORT`                       | `5000`           | HTTP port                                       |
| `LOG_LEVEL`                  | `info`           | Pino log level                                  |
| `NODE_ENV`                   | `development`    | `development`/`production`/`test`               |
| `CORS_ORIGINS`               | `*`              | Comma-separated allowed origins                 |
| `DISCORD_UPLOAD_CONCURRENCY` | `2`              | Parallel uploads to Discord                     |
| `FILE_TTL_SECONDS`           | `0`              | TTL for stored file metadata (0 = no expiry)    |
| `DEFAULT_RANGE_SIZE`         | `5242880` (5 MB) | Default size for an open-ended `Range:` request |

## API

### Direct upload

```
POST /upload?fileName=<name>
Content-Type: <mime>
<bytes>
```

Returns:

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
POST /upload/:uploadId             → append more bytes (any size)
POST /upload/:uploadId/complete    → { fileId, … }
GET  /upload/:uploadId             → status
GET  /upload/:uploadId/events      → SSE stream of progress events
DELETE /upload/:uploadId           → cancel
```

### Files

```
GET    /files                  → paginated list
GET    /files/:id              → metadata
DELETE /files/:id              → remove (also deletes Discord messages)
GET    /file/:id               → download (supports Range)
GET    /file/:id/:fileName     → download with original name
```

### Health

```
GET /health   → { status, redis, uptime }
```

## Scripts

| Command             | Description                      |
| ------------------- | -------------------------------- |
| `npm run dev`       | Start the dev server (tsx watch) |
| `npm run build`     | Compile TypeScript to `dist/`    |
| `npm start`         | Start the compiled server        |
| `npm run lint`      | ESLint                           |
| `npm run format`    | Prettier (write)                 |
| `npm run typecheck` | `tsc --noEmit`                   |
| `npm test`          | Run the unit test suite (vitest) |

## Project layout

```
src/
  index.ts            # bootstrap
  app.ts              # express setup
  config.ts           # env validation (zod)
  logger.ts           # pino
  routes/             # http handlers
  services/           # discord, redis, sse broker
  middleware/         # cors, error handler
  utils/              # range parser, filename helpers, …
test/                 # vitest unit tests
static/               # frontend
.github/workflows/    # CI + Docker image
```

## Limitations

- Anyone with a `fileId` can download the file (no authentication).
- File chunks are stored in your Discord channel as bot messages; deletion
  goes through the Discord API and is best-effort.
- `chunkSize` is fixed at 8 MB (Discord's free attachment cap).

## Acknowledgements

- Original idea/code: [napthedev/discloud](https://github.com/napthedev/discloud)
- Stream backpressure helper: [forscht/ddrive](https://github.com/forscht/ddrive)

## License

MIT
