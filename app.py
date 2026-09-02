#!/usr/bin/env python3
"""
Akashvani & Live Radio Hub - Python / FastAPI / Gradio Backend for Hugging Face Spaces
Runs on 100% Free 2 vCPU / 16 GB RAM Gradio Space.
"""

import os
import json
import asyncio
from typing import Dict
from fastapi import Request, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import gradio as gr

# Load stations database
STATIONS_FILE = os.path.join(os.path.dirname(__file__), "stations.json")
stations = []
try:
    with open(STATIONS_FILE, "r", encoding="utf-8") as f:
        stations = json.load(f)
    print(f"[INIT] Loaded {len(stations)} stations successfully.")
except Exception as e:
    print(f"[INIT ERROR] Could not load stations.json: {e}")

stations_map = {s["id"]: s for s in stations}


# StreamHub Python Multiplexer
class StreamHub:
    def __init__(self, bitrate="96k", max_streams=16):
        self.bitrate = bitrate
        self.max_streams = max_streams
        self.active_streams: Dict[str, dict] = {}

    def get_or_create_stream(self, station_id: str):
        if station_id not in self.active_streams:
            if len(self.active_streams) >= self.max_streams:
                self._evict_idle()

            station = stations_map.get(station_id)
            if not station:
                return None

            listeners = set()

            stream_obj = {
                "station": station,
                "process": None,
                "listeners": listeners,
                "ring_buffer": bytearray(),
                "task": None,
                "is_running": True
            }

            self.active_streams[station_id] = stream_obj
            stream_obj["task"] = asyncio.create_task(self._run_ffmpeg(station_id, stream_obj))

        return self.active_streams.get(station_id)

    def _evict_idle(self):
        for sid, st in list(self.active_streams.items()):
            if len(st["listeners"]) == 0:
                self._stop_stream(sid)
                return

    def _stop_stream(self, station_id: str):
        st = self.active_streams.pop(station_id, None)
        if st:
            st["is_running"] = False
            if st["process"]:
                try:
                    st["process"].kill()
                except Exception:
                    pass
            if st["task"]:
                st["task"].cancel()

    async def _run_ffmpeg(self, station_id: str, stream_obj: dict):
        url = stream_obj["station"]["stream_url"]
        cmd = [
            "ffmpeg",
            "-loglevel", "warning",
            "-reconnect", "1",
            "-reconnect_at_eof", "1",
            "-reconnect_streamed", "1",
            "-reconnect_delay_max", "5",
            "-i", url,
            "-vn",
            "-c:a", "libmp3lame",
            "-b:a", self.bitrate,
            "-ar", "44100",
            "-ac", "2",
            "-f", "mp3",
            "pipe:1"
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL
            )
            stream_obj["process"] = process

            while stream_obj["is_running"]:
                chunk = await process.stdout.read(4096)
                if not chunk:
                    break

                # Maintain rolling ring buffer
                stream_obj["ring_buffer"].extend(chunk)
                if len(stream_obj["ring_buffer"]) > 64 * 1024:
                    stream_obj["ring_buffer"] = stream_obj["ring_buffer"][-64 * 1024:]

                # Fan out to listeners
                for q in list(stream_obj["listeners"]):
                    try:
                        q.put_nowait(chunk)
                    except asyncio.QueueFull:
                        pass
        except Exception as e:
            print(f"[STREAM HUB ERROR] {station_id}: {e}")
        finally:
            self._stop_stream(station_id)


hub = StreamHub()

# Create Gradio interface and get underlying FastAPI app
with gr.Blocks(title="Akashvani Radio Hub") as demo:
    gr.HTML('<iframe src="/web" style="width:100%; height:94vh; border:none; border-radius:8px;"></iframe>')

app = demo.app

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 1. API: List Stations
@app.get("/api/stations")
async def get_stations(category: str = None, language: str = None, state: str = None, search: str = None):
    results = stations
    if category:
        results = [s for s in results if s.get("category") == category]
    if language:
        results = [s for s in results if language.lower() in s.get("language", "").lower()]
    if state:
        results = [s for s in results if state.lower() == s.get("state", "").lower()]
    if search:
        q = search.lower()
        results = [s for s in results if q in s.get("name", "").lower() or q in s.get("language", "").lower() or q in s.get("state", "").lower()]
    return {"total": len(results), "stations": results}


# 2. Audio Stream: /stream/{station_id}
@app.get("/stream/{station_id}")
async def stream_audio(station_id: str, request: Request):
    station = stations_map.get(station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    stream_obj = hub.get_or_create_stream(station_id)
    if not stream_obj:
        raise HTTPException(status_code=500, detail="Could not initialize stream")

    client_queue = asyncio.Queue(maxsize=50)
    stream_obj["listeners"].add(client_queue)

    async def audio_generator():
        # Flush initial ring buffer for instant zero-lag start
        if stream_obj["ring_buffer"]:
            yield bytes(stream_obj["ring_buffer"])

        try:
            while True:
                if await request.is_disconnected():
                    break
                chunk = await client_queue.get()
                yield chunk
        finally:
            stream_obj["listeners"].discard(client_queue)
            if len(stream_obj["listeners"]) == 0:
                await asyncio.sleep(20)
                if len(stream_obj["listeners"]) == 0:
                    hub._stop_stream(station_id)

    return StreamingResponse(
        audio_generator(),
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Connection": "keep-alive"
        }
    )


# 3. M3U Playlist Export
@app.get("/playlist.m3u")
async def get_m3u(request: Request):
    base_url = str(request.base_url).rstrip("/")
    m3u_lines = ["#EXTM3U"]
    for s in stations:
        group = "All India Radio" if s.get("category") == "air" else ("Live TV Audio" if s.get("category") == "tv" else "Web Radio")
        m3u_lines.append(f'#EXTINF:-1 tvg-id="{s["id"]}" tvg-name="{s["name"]}" group-title="{group}" radio="true",{s["name"]} [{s.get("language", s.get("state", ""))}]')
        m3u_lines.append(f'{base_url}/stream/{s["id"]}')
    return Response(content="\n".join(m3u_lines), media_type="audio/x-mpegurl")


# 4. Mount Static Web Player
public_dir = os.path.join(os.path.dirname(__file__), "public")
if os.path.exists(public_dir):
    @app.get("/web", response_class=HTMLResponse)
    async def serve_index():
        with open(os.path.join(public_dir, "index.html"), "r", encoding="utf-8") as f:
            return f.read()

    @app.get("/styles.css")
    async def serve_css():
        with open(os.path.join(public_dir, "styles.css"), "r", encoding="utf-8") as f:
            return Response(content=f.read(), media_type="text/css")

    @app.get("/app.js")
    async def serve_js():
        with open(os.path.join(public_dir, "app.js"), "r", encoding="utf-8") as f:
            return Response(content=f.read(), media_type="application/javascript")

# Launch Gradio Demo
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    demo.launch(server_name="0.0.0.0", server_port=port)
