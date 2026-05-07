# DisCloud Landing UI (Poster + Preview) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the current single-page UI into a premium, monochrome landing page with a full-bleed poster hero + preview, while keeping upload/list functionality on the same page.

**Architecture:** Keep the existing static `static/index.html` (Bootstrap CDN + inline CSS + vanilla JS). Restructure the page into landing sections (hero/features/app/footer) and add subtle motion + smooth scroll without changing backend APIs.

**Tech Stack:** Static HTML, inline CSS, vanilla JS, Bootstrap 5 CDN, Prettier.

---

## File Map

**Modify**

- `/workspace/static/index.html` — restructure DOM into landing sections, update styles, add hero CTAs, add minimal motion, keep existing upload/list JS logic.

**(Optional) Add**

- `/workspace/static/assets/noise.png` (or inline SVG/noise via CSS) — only if you decide to add a texture layer; otherwise keep CSS-only.

## Task 1: Baseline Snapshot (before changes)

**Files:**

- Inspect: `/workspace/static/index.html`

- [ ] **Step 1: Start a minimal mock server for UI preview**

Run:

```bash
node -e "import http from 'node:http'; import { readFileSync } from 'node:fs'; import { extname, join } from 'node:path'; const root = join(process.cwd(), 'static'); const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' }; const server = http.createServer((req,res)=>{ const url = new URL(req.url ?? '/', 'http://localhost'); if (url.pathname === '/files') { const payload = JSON.stringify({ total: 0, offset: 0, limit: 50, items: [] }); res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); res.end(payload); return; } if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; } const path = url.pathname === '/' ? '/index.html' : url.pathname; try { const filePath = join(root, path); const data = readFileSync(filePath); res.writeHead(200, { 'Content-Type': mime[extname(filePath)] ?? 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); res.end('Not found'); } }); server.listen(8000, '0.0.0.0'); console.log('mock-ui-server http://localhost:8000');"
```

Expected: terminal prints `mock-ui-server http://localhost:8000`.

- [ ] **Step 2: Capture a baseline screenshot**
- Use the browser screenshot tool to save `discloud-ui-before.png`.
- Expected: a full-page PNG saved to the workspace for review.

## Task 2: Restructure Into Landing Sections (Poster + Preview)

**Files:**

- Modify: `/workspace/static/index.html`

- [ ] **Step 1: Convert header to overlay navigation**
- Make the header sit on top of the hero (no boxed container feel in first viewport).
- Keep a single brand mark + “GitHub” link.

- [ ] **Step 2: Implement full-bleed hero**
- Hero is edge-to-edge (full width), with a constrained inner content column.
- Content includes:
  - Brand name
  - 1 headline (2–3 lines max)
  - 1 sentence support copy
  - Primary CTA button: “Bắt đầu tải lên”
  - Secondary CTA button: “Xem file đã lưu”

- [ ] **Step 3: Add “Preview” visual anchor**
- Create a large preview block that looks like an app mockup.
- The preview should hint at upload/table UI but not replicate the entire real UI.

- [ ] **Step 4: Add features strip (3 bullets)**
- Place below hero (or inside hero lower area), with minimal icon + label.
- Keep to monochrome + one accent.

## Task 3: Preserve and Reframe the App Section (Upload + List)

**Files:**

- Modify: `/workspace/static/index.html`

- [ ] **Step 1: Wrap upload + files into an “App” section**
- Add anchors:
  - `#upload`
  - `#files`
- Ensure CTA buttons scroll to these sections.

- [ ] **Step 2: Keep functional JS as-is, only adjust markup hooks**
- Keep endpoints unchanged:
  - `POST /upload?fileName=...`
  - `GET /files`
  - `DELETE /files/:id`
- Preserve:
  - toast feedback
  - copy absolute link behavior
  - search filter behavior

## Task 4: Motion Pass (Subtle, Premium)

**Files:**

- Modify: `/workspace/static/index.html`

- [ ] **Step 1: Add hero entrance animation**
- Use CSS keyframes (no new libraries) for:
  - headline
  - CTA row
  - preview block

```css
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 2: Add hover presence**
- Gentle glow/outline on primary CTA and preview.

- [ ] **Step 3: Respect reduced motion**

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
```

## Task 5: Verification (Formatting + Visual)

**Files:**

- Test: `/workspace/static/index.html`

- [ ] **Step 1: Run formatting check**

Run:

```bash
npm run format:check
```

Expected: `All matched files use Prettier code style!`

- [ ] **Step 2: Run unit tests/typecheck (sanity)**

Run:

```bash
npm test
npm run typecheck
```

Expected: all pass.

- [ ] **Step 3: Preview with mock server and capture final screenshot**
- Start the mock server (Task 1 command).
- Capture `discloud-ui-after.png` full-page.

## Notes on Git Commits

This repo uses Husky + lint-staged. Only create commits if the user explicitly requests it.
