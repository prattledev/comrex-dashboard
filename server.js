import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';

const TOKEN = process.env.COMREX_API_TOKEN;
const PORT = process.env.PORT || 3000;
const UPSTREAM_URL = 'https://switchboard.comrex.com/switchboard/api/v1/units/access';
const CACHE_TTL_MS = 29_000;

if (!TOKEN) {
  console.error('ERROR: COMREX_API_TOKEN is not set. Add it to your .env file.');
  process.exit(1);
}

const app = express();
app.use(express.static('public'));

// Server-side response cache to coalesce multi-tab polls
let cache = { data: null, fetchedAt: 0 };

app.get('/api/units', async (req, res) => {
  const now = Date.now();

  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return res.json(cache.data);
  }

  let upstreamRes;
  try {
    upstreamRes = await fetch(UPSTREAM_URL, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
  } catch (err) {
    console.error('Network error reaching Comrex API:', err.message);
    return res.status(503).json({ error: 'Unable to reach Comrex API', status: 503 });
  }

  if (!upstreamRes.ok) {
    console.error(`Comrex API returned ${upstreamRes.status} ${upstreamRes.statusText}`);
    return res.status(502).json({
      error: `Upstream API error (${upstreamRes.status})`,
      status: 502,
    });
  }

  let body;
  try {
    body = await upstreamRes.json();
  } catch (err) {
    console.error('Failed to parse Comrex API response:', err.message);
    return res.status(502).json({ error: 'Invalid response from upstream API', status: 502 });
  }

  cache = { data: body, fetchedAt: now };
  res.json(body);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Comrex Dashboard running at http://localhost:${PORT}`);
});
