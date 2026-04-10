# Comrex Fleet Dashboard

A real-time monitoring dashboard for Comrex broadcast codec devices (ACCESS MultiRack, BRIC-Link II/III, ACCESS Portable NX, etc.). It polls the Comrex Switchboard API and displays live status for every unit in your fleet.

![Dark theme dashboard with device cards grouped by product type]

## Features

- Live device status grouped by product type (ACCESS MultiRack, BRIC-LINK, ACCESS Portable NX)
- Per-device cards showing registration status, connection status, IP address, firmware version, NAT type, and last registration time
- Summary stats bar: total units, online, offline, connected
- Search/filter by device name
- Filter by status — Online, Offline, or Connected toggle (mutually exclusive)
- Sort cards within each group by Name, IP, Firmware, NAT Type, Last Reg, or MAC — click the active sort to toggle ascending/descending
- Status change alerts — cards that flip online/offline between polls get a colored glow animation and a "↑ Came online" / "↓ Went offline" badge for the poll cycle
- Collapsed group state is preserved across API refreshes and filter changes
- Reset View button clears active filters, resets sort, and expands all groups
- NAT Types reference modal explaining each NAT type and its impact on codec connectivity
- Export current view to CSV (respects active search and status filter)
- Auto-refreshes every 30 seconds with a countdown timer
- Collapsible device group sections
- Server-side caching coalesces requests from multiple browser tabs into a single upstream API call

## Requirements

- Node.js >= 18.0.0
- A Comrex Switchboard API token

## Running Locally

**1. Install dependencies**

```bash
npm install
```

**2. Configure environment**

Copy the example env file and add your API token:

```bash
cp .env.example .env
```

Edit `.env`:

```
COMREX_API_TOKEN=your_token_here
PORT=3000
```

The server will exit immediately on startup if `COMREX_API_TOKEN` is not set.

**3. Start the server**

```bash
# Production
npm start

# Development (auto-restarts on file changes)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**4. Stop the server**

```bash
npm run stop
```

## Running with Docker

**1. Configure environment**

```bash
cp .env.example .env
# edit .env and set COMREX_API_TOKEN
```

**2. Build and start**

```bash
docker compose up -d
```

The dashboard is available at [http://localhost:3000](http://localhost:3000).

**3. View logs / stop**

```bash
docker compose logs -f   # follow logs
docker compose down      # stop and remove
```

## Project Structure

```
.
├── server.js          # Express server — proxies /api/units to Comrex Switchboard API
├── public/
│   ├── index.html     # Page structure
│   ├── app.js         # All client logic (polling, rendering, filtering)
│   └── styles.css     # Dark theme styles
├── .env.example       # Environment variable template
└── package.json
```

## How It Works

The browser polls `/api/units` every 30 seconds. The Express server forwards that request to the Comrex Switchboard API using your token, caches the response for 29 seconds, and returns it. The 29-second cache means all browser tabs share a single upstream request per poll cycle, keeping API usage within rate limits.

```
Browser → GET /api/units (every 30s)
        → server.js (29s cache)
        → https://switchboard.comrex.com/switchboard/api/v1/units/access
```
