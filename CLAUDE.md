# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # Install dependencies
npm start         # Start production server (node server.js)
npm run dev       # Start with auto-reload on file changes (node --watch server.js)
npm run stop      # Kill the server process on port 3000
```

Copy `.env.example` to `.env` and set `COMREX_API_TOKEN` before running. The server exits immediately if this variable is missing.

## Architecture

**Comrex Fleet Dashboard** is a real-time monitoring app for Comrex broadcast codec devices (ACCESS, BRIC-Link, etc.). It's a thin proxy + UI — no database, no auth layer.

### Request flow

```
Browser → GET /api/units (every 30s)
        → server.js (Express, port 3000, localhost only)
        → 29s in-memory cache (coalesces concurrent tab polls)
        → https://switchboard.comrex.com/switchboard/api/v1/units/access
        → returns array of unit objects to frontend
```

### Files

- **`server.js`** — Express app. Proxies one endpoint (`/api/units`) to the Comrex Switchboard API with a 29-second TTL cache. Serves `./public` as static files.
- **`public/app.js`** — All client logic: polls `/api/units` every 30s, groups devices by `product_type` (with BRIC-Link II/III merged → BRIC-LINK), filters by search, renders cards and summary stats, shows a countdown timer.
- **`public/index.html`** — Page structure: summary stats bar, search input, error banner, device grid.
- **`public/styles.css`** — Dark theme. Status colors: green (online/secure), red (offline), blue (connected), gray (idle). Responsive grid.

### Key details

- Project uses **ES modules** (`"type": "module"` in package.json); use `import`/`export` syntax throughout.
- Node.js >= 18.0.0 required.
- The frontend handles API responses in multiple formats: direct array, or wrapped in a `units` or `data` property.
- Device group display order is hardcoded: ACCESS MultiRack → BRIC-LINK → ACCESS Portable NX → others alphabetically.
- The cache TTL (29s) is intentionally just under the frontend poll interval (30s) so cached data is nearly always fresh.
