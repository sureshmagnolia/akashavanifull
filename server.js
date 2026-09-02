const express = require('express');
const path = require('path');
const fs = require('fs');
const StreamHub = require('./stream_hub');

const app = express();
const PORT = process.env.PORT || 8000;
const BITRATE = process.env.BITRATE || '96k'; // Optimized for low bandwidth & high concurrency

// Load stations database
let stations = [];
const stationsPath = path.join(__dirname, 'stations.json');
try {
  stations = JSON.parse(fs.readFileSync(stationsPath, 'utf8'));
  console.log(`[INIT] Loaded ${stations.length} stations from stations.json`);
} catch (err) {
  console.error('[INIT ERROR] Failed to load stations.json:', err.message);
  stations = [];
}

// Index stations by ID for O(1) fast lookup
const stationsMap = new Map(stations.map(s => [s.id, s]));

// Initialize StreamHub Multiplexer
const hub = new StreamHub({ bitrate: BITRATE, idleTimeoutMs: 20000 });

// Enable CORS for web players & IoT microcontrollers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. Stations List API
app.get('/api/stations', (req, res) => {
  const { category, language, state, search } = req.query;
  let results = stations;

  if (category) {
    results = results.filter(s => s.category === category);
  }
  if (language) {
    results = results.filter(s => s.language && s.language.toLowerCase().includes(language.toLowerCase()));
  }
  if (state) {
    results = results.filter(s => s.state && s.state.toLowerCase() === state.toLowerCase());
  }
  if (search) {
    const q = search.toLowerCase();
    results = results.filter(s => 
      s.name.toLowerCase().includes(q) || 
      (s.language && s.language.toLowerCase().includes(q)) || 
      (s.state && s.state.toLowerCase().includes(q))
    );
  }

  res.json({
    total: results.length,
    stations: results
  });
});

// 2. Real-time Server Stats API
app.get('/api/stats', (req, res) => {
  res.json(hub.getStats());
});

// 3. Audio Streaming Endpoint: /stream/:id
app.get('/stream/:id', (req, res) => {
  const stationId = req.params.id;
  const station = stationsMap.get(stationId);

  if (!station) {
    return res.status(404).json({ error: 'Station not found' });
  }

  // Set streaming HTTP headers
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'Pragma': 'no-cache',
    'X-Audio-Bitrate': BITRATE,
    'X-Station-Name': encodeURIComponent(station.name)
  });

  // Attach client to shared station multiplexer
  hub.addListener(station, res);
});

// 4. Dynamic M3U Playlist Generation for Media Players (VLC, IPTV, Kodi, ESP32)
app.get(['/playlist.m3u', '/playlist.m3u8'], (req, res) => {
  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const baseUrl = `${protocol}://${host}`;

  let m3u = '#EXTM3U\n';
  for (const s of stations) {
    const streamUrl = `${baseUrl}/stream/${s.id}`;
    const group = s.category === 'air' ? 'All India Radio' : (s.category === 'tv' ? 'Live TV Audio' : 'Web Radio');
    m3u += `#EXTINF:-1 tvg-id="${s.id}" tvg-name="${s.name}" group-title="${group}" radio="true",${s.name} [${s.language || s.state}]\n`;
    m3u += `${streamUrl}\n`;
  }

  res.header('Content-Type', 'audio/x-mpegurl');
  res.header('Content-Disposition', 'attachment; filename="akashvani_radio.m3u"');
  res.send(m3u);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Start Server
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`📻 Akashvani Radio Hub Server running on port ${PORT}`);
  console.log(`🔊 Bitrate: ${BITRATE} | Stations: ${stations.length}`);
  console.log(`🌐 Web UI: http://localhost:${PORT}`);
  console.log(`📋 M3U Playlist: http://localhost:${PORT}/playlist.m3u`);
  console.log(`===================================================`);
});
