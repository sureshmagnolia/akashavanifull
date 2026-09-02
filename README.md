---
title: Akashvani Radio Hub
emoji: 📻
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# 📻 Akashvani & Live Radio Hub

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Stations](https://img.shields.io/badge/Stations-290%2B-green.svg)](stations.json)
[![Deploy on Koyeb](https://img.shields.io/badge/Deploy%20on-Koyeb%20(Free)-12181b?logo=koyeb)](https://app.koyeb.com/)
[![Deploy to Render](https://img.shields.io/badge/Deploy%20to-Render%20(Free)-46E3B7?logo=render)](https://render.com/)

An ultra-optimized, high-concurrency **All India Radio (Akashvani)**, **Regional TV Audio**, and **Web Radio** streaming server & web player.

Built with a **Smart Hybrid Architecture** that allows **thousands of parallel web listeners** to listen to any of the 290+ distinct stations with **0% server load**, while providing a high-performance **StreamHub MP3 multiplexer** for hardware devices (ESP32, Arduino, Raspberry Pi, VLC).

---

## ⚡ Smart Hybrid Architecture

```
                                  ┌──────────────────────────────┐
                                  │       Incoming Listener      │
                                  └──────────────┬───────────────┘
                                                 │
                        ┌────────────────────────┴────────────────────────┐
                        ▼                                                 ▼
        ┌───────────────────────────────┐                 ┌───────────────────────────────┐
        │  Web Browser (Desktop/Mobile) │                 │  Hardware / VLC / IoT (ESP32) │
        └───────────────┬───────────────┘                 └───────────────┬───────────────┘
                        │                                                 │
                        ▼                                                 ▼
        ┌───────────────────────────────┐                 ┌───────────────────────────────┐
        │   Client-Side Direct HLS      │                 │  StreamHub MP3 Multiplexer    │
        │   (Hls.js / Native Safari)    │                 │   (/stream/:station_id)       │
        └───────────────┬───────────────┘                 └───────────────┬───────────────┘
                        │                                                 │
                        ▼                                                 ▼
        ┌───────────────────────────────┐                 ┌───────────────────────────────┐
        │  ⚡ 0% Server CPU / 0 MB RAM   │                 │ 📻 1 Transcode per Station    │
        │  Unlimited Parallel Stations  │                 │    Multicasted to All Users   │
        └───────────────────────────────┘                 └───────────────────────────────┘
```

1. **⚡ Web Listeners (0% Server Load)**:
   * Web users stream directly from upstream Prasar Bharati CDNs using client-side Hls.js or native iOS/Safari HLS.
   * Thousands of users can listen to **290+ different stations** at the exact same time without consuming any server CPU or RAM.
   * If a direct stream encounters CORS on a specific network, it seamlessly and automatically falls back to the server MP3 proxy.
2. **📻 Hardware & Media Players (StreamHub Multiplexer)**:
   * Microcontrollers like ESP32 and media players that cannot parse HLS `.m3u8` connect to `/stream/:station_id`.
   * **Single Transcode Fanout:** If 100 people listen to the same station, only **1 background FFmpeg process** runs.
   * **Max Active Guard & LRU Eviction:** Protects 512MB free tier containers from Out-of-Memory (OOM) by capping active background transcoding tasks.
   * **Auto-Sleep:** Idle station processes are killed after 20 seconds of inactivity.

---

## 📻 Features

* **290+ Live Radio Stations ([`stations.json`](./stations.json))**:
  * **276 All India Radio (Akashvani)** stations covering all Indian states and Union Territories (*Vividh Bharati, FM Gold, FM Rainbow, Raagam, regional stations*).
  * **10 Regional Live TV Audio Feeds** (*24 News, Manorama News, Asianet News, MediaOne, DD News, NDTV, Sansad TV*).
  * **Independent Classical & Web Radios** (*Carnatic Classical, Retro Hindi Hits, BBC World, Quran Radio*).
* **Dual Theme Retro/Modern Web Player**:
  * CRT Neon-Green Keypad Mode (Numpad `5` Play/Pause, `8` Next, `2` Prev, `0` Mute) & Modern Glassmorphism Dark Mode.
  * Real-time Web Audio API frequency visualizer.
  * Instant search by station name, state, or language.
  * Offline-persisted Favorites list.
* **Universal Hardware & Software Support**:
  * Direct MP3 streams (`/stream/:id`) for **ESP32, Arduino, Raspberry Pi, Volumio, Home Assistant**.
  * Dynamic **M3U Playlist export** (`/playlist.m3u`) for 1-click import into **VLC, Kodi, and IPTV players**.
* **Automated Weekly Sync Pipeline**:
  * GitHub Actions cron job running [`updater.py`](./updater.py) to keep stream URLs automatically up to date.

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
4. Render will automatically detect [`render.yaml`](./render.yaml).
5. Click **Create Web Service**.

---

## 📄 License
Licensed under the [Apache License, Version 2.0](LICENSE).
