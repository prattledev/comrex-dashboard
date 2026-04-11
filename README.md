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

The Docker Compose stack includes the dashboard app and a Cloudflare Tunnel. Traffic flows `cloudflared → dashboard` with no inbound ports open on the host.

**1. Configure environment**

```bash
cp .env.example .env
```

Edit `.env` and set both tokens:

```
COMREX_API_TOKEN=your_token_here
CLOUDFLARE_TUNNEL_TOKEN=your_tunnel_token_here
```

Get the tunnel token from the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com) under **Networks → Tunnels → Create a tunnel**. Set the public hostname to your domain with service `http://dashboard:3000`.

**2. Build and start**

```bash
docker compose up -d
```

The dashboard is accessible at your Cloudflare tunnel domain. Cloudflare handles HTTPS at the edge.

**4. View logs / stop**

```bash
docker compose logs -f dashboard   # app logs
docker compose logs -f cloudflared # tunnel logs
docker compose down                # stop and remove
```

**Updating to a new version**

```bash
git pull
docker compose build dashboard
docker compose up -d
```

## Changing the Port

The server listens on port `3000` by default. To use a different port, set `PORT` in your `.env` file:

```
PORT=8080
```

**Running locally:** restart the server after changing the value. The app will be at `http://localhost:8080`.

**Running with Docker:** if you need to expose the port directly to the host (i.e. without Cloudflare Tunnel), update `compose.yml` to publish the new port:

```yaml
ports:
  - "8080:8080"
```

If using Cloudflare Tunnel, update the tunnel's public hostname service in the Zero Trust dashboard to match the new port (e.g. `http://dashboard:8080`). No changes to `compose.yml` are needed.

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
