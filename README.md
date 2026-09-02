# 📻 Akashvani & Live Radio Hub

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Stations](https://img.shields.io/badge/Stations-290%2B-green.svg)](stations.json)
[![Deploy on Koyeb](https://img.shields.io/badge/Deploy%20on-Koyeb%20(Free)-12181b?logo=koyeb)](https://app.koyeb.com/)
[![Deploy to Render](https://img.shields.io/badge/Deploy%20to-Render%20(Free)-46E3B7?logo=render)](https://render.com/)

An ultra-optimized, high-concurrency **All India Radio (Akashvani)**, **Regional TV Audio**, and **Web Radio** streaming server & web player.

Built specifically to transcode upstream HLS (`.m3u8`) audio into direct HTTP MP3 chunks and **multicast to hundreds of parallel listeners simultaneously** on 100% free cloud tiers (Koyeb, Render, Fly.io) or embedded microcontrollers (ESP32, Raspberry Pi).

---

## ⚡ Key Highlights & Architecture

### 🚀 High-Concurrency Stream Multiplexer (Pub-Sub Hub)
* **Single Transcode per Active Station:** When 100 users listen to the same station (*e.g., Vividh Bharati*), only **1 background FFmpeg process** runs (~5% CPU, 40MB RAM).
* **Zero Overhead Fanout:** Audio chunks are broadcasted across all connected HTTP clients via Node.js stream buffers.
* **Instant Start (Rolling Ring Buffer):** When a new listener connects, the hub immediately flushes a 5-second rolling audio cache for instant playback with zero buffer lag.
* **Smart Auto-Sleep:** When all users leave a station, a 20-second idle timer gracefully kills the FFmpeg process to free 100% of the CPU and memory.

```
                    ┌────────────────────────┐
                    │ Akashvani / WavesPB    │ (Upstream HLS .m3u8)
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  1x FFmpeg Process     │ (Transcodes to 96k MP3)
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │ StreamHub Multiplexer  │ (Rolling 64KB Ring Buffer)
                    └───────┬───┬───┬────────┘
                            │   │   │
             ┌──────────────┘   │   └──────────────┐
             ▼                  ▼                  ▼
     ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
     │ Web Listener  │  │ ESP32 Radio   │  │  VLC / Kodi   │
     │  (Browser)    │  │  (Hardware)   │  │  (IPTV App)   │
     └───────────────┘  └───────────────┘  └───────────────┘
```

---

## 📻 Features

1. **290+ Live Radio Stations**:
   * **276 All India Radio (Akashvani)** stations covering all Indian states and Union Territories (*Vividh Bharati, FM Gold, FM Rainbow, Raagam, regional stations*).
   * **10 Regional Live TV Audio Feeds** (*24 News, Manorama News, Asianet News, MediaOne, DD News, NDTV, Sansad TV*).
   * **Independent Classical & Web Radios** (*Carnatic Classical, Retro Hindi Hits, BBC World, Quran Radio*).
2. **Universal Compatibility**:
   * Works on any HTML5 browser (Desktop, Mobile, Smart TVs, Feature Phones).
   * Direct MP3 streams for **ESP32, Arduino, Raspberry Pi, Volumio, Foobar2000, Home Assistant**.
3. **M3U / M3U8 Playlist Export**:
   * Import all 290+ stations into VLC, IPTV players, or Kodi via `/playlist.m3u`.
4. **Retro CRT & Modern UI**:
   * CRT neon-green terminal theme with Numpad navigation (`5` Play/Pause, `8` Next, `2` Prev, `0` Mute).
   * Modern glassmorphism dark theme toggle.
   * Real-time Web Audio API frequency visualizer.
   * Search by station name, state, or language.
   * Offline-persisted Favorites list.

---

## 🌐 API & Stream Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/stream/:id` | `GET` | **Continuous MP3 Audio Stream** (e.g. `/stream/vividh_bharati`) |
| `/api/stations` | `GET` | JSON list of all stations with filter queries (`?category=air`, `?state=KERALA`, `?search=tamil`) |
| `/api/stats` | `GET` | Real-time server diagnostics (active stations, connected listener count, uptime) |
| `/playlist.m3u` | `GET` | Full M3U playlist file for VLC / IPTV players |
| `/health` | `GET` | Health check endpoint |

---

## 🛠️ Hardware Integration (ESP32 / Arduino)

Connect your ESP32 internet radio directly to your deployed server using the popular `ESP32-audioI2S` library:

```cpp
#include <WiFi.h>
#include "Audio.h"

#define I2S_DOUT      25
#define I2S_BCLK      27
#define I2S_LRC       26

Audio audio;

void setup() {
  Serial.begin(115200);
  WiFi.begin("YOUR_WIFI_SSID", "YOUR_WIFI_PASSWORD");
  while (WiFi.status() != WL_CONNECTED) delay(500);

  audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
  audio.setVolume(15); // 0...21

  // Connect to your deployed Akashvani Radio Hub MP3 stream
  audio.connecttohost("http://YOUR_SERVER_URL/stream/vividh_bharati");
}

void loop() {
  audio.loop();
}
```

---

## 🚀 Free 1-Click Deployment

### Option 1: Deploy on Koyeb (Free Tier)
1. Fork or push this repository to your GitHub.
2. Log in to [Koyeb.com](https://www.koyeb.com/).
3. Click **Create App** ➔ Select **GitHub**.
4. Choose this repository.
5. Under **Builder**, choose **Dockerfile**.
6. Set the port to `8000`.
7. Click **Deploy**!

### Option 2: Deploy on Render (Free Tier)
1. Fork this repository.
2. Go to [Render Dashboard](https://dashboard.render.com/) ➔ **New Web Service**.
3. Select your repository.
4. Render will automatically detect [`render.yaml`](./render.yaml) or select **Docker**.
5. Click **Create Web Service**.

### Option 3: Run Locally / On Raspberry Pi via Docker
```bash
# Build the Docker image
docker build -t akashvani-radio .

# Run the container
docker run -d -p 8000:8000 --name radio akashvani-radio

# Open in your browser
http://localhost:8000
```

---

## 🔄 Automated Station Updates

This repository includes [`updater.py`](./updater.py) and a GitHub Actions workflow [`.github/workflows/update-stations.yml`](./.github/workflows/update-stations.yml) that automatically queries the official Prasar Bharati / Akashvani website on a weekly schedule to keep all stream URLs up to date.

To run manually:
```bash
python updater.py
```

---

## 📄 License
Licensed under the [Apache License, Version 2.0](LICENSE).
