const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class StreamHub extends EventEmitter {
  constructor(options = {}) {
    super();
    this.bitrate = options.bitrate || process.env.BITRATE || '96k'; // 96k default for maximum concurrency and low bandwidth
    this.idleTimeoutMs = options.idleTimeoutMs || 20000; // 20s idle timeout before killing ffmpeg
    this.bufferSize = options.bufferSize || 64 * 1024; // 64KB rolling buffer (~5s of MP3) for instant playback
    this.activeStreams = new Map(); // stationId -> streamObject
  }

  getStream(station) {
    if (!station || !station.id || !station.stream_url) {
      throw new Error('Invalid station definition');
    }

    let stream = this.activeStreams.get(station.id);
    if (!stream) {
      stream = this._createStream(station);
      this.activeStreams.set(station.id, stream);
    }

    if (stream.idleTimer) {
      clearTimeout(stream.idleTimer);
      stream.idleTimer = null;
    }

    return stream;
  }

  _createStream(station) {
    const stream = {
      station,
      ffmpeg: null,
      listeners: new Set(),
      ringBuffer: [],
      ringBufferLength: 0,
      idleTimer: null,
      startTime: Date.now(),
      bytesStreamed: 0,
      isStarting: false,
      reconnectAttempts: 0
    };

    this._startFFmpeg(stream);
    return stream;
  }

  _startFFmpeg(stream) {
    if (stream.ffmpeg) {
      try {
        stream.ffmpeg.kill('SIGKILL');
      } catch (e) {}
    }

    stream.isStarting = true;
    const url = stream.station.stream_url;
    console.log(`[STREAM HUB] ⚡ Starting single FFmpeg instance for: ${stream.station.name} (${stream.station.id})`);

    const ffmpegArgs = [
      '-loglevel', 'warning',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', url,
      '-vn',                    // Strip any video tracks
      '-c:a', 'libmp3lame',     // Pure MP3 audio codec
      '-b:a', this.bitrate,     // Configurable bitrate (e.g. 96k / 128k)
      '-ar', '44100',          // Standard sample rate
      '-ac', '2',              // Stereo
      '-f', 'mp3',             // Output format MP3
      'pipe:1'
    ];

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    stream.ffmpeg = ffmpeg;
    stream.isStarting = false;

    ffmpeg.stdout.on('data', (chunk) => {
      stream.bytesStreamed += chunk.length;
      
      // Maintain rolling buffer for instant zero-latency start for new clients
      stream.ringBuffer.push(chunk);
      stream.ringBufferLength += chunk.length;

      while (stream.ringBufferLength > this.bufferSize && stream.ringBuffer.length > 1) {
        const removed = stream.ringBuffer.shift();
        stream.ringBufferLength -= removed.length;
      }

      // Fan out / multicast chunk to all connected clients
      for (const res of stream.listeners) {
        if (!res.writableEnded && !res.destroyed) {
          try {
            res.write(chunk);
          } catch (err) {
            this.removeListener(stream.station.id, res);
          }
        }
      }
    });

    ffmpeg.stderr.on('data', (data) => {
      // Log errors or warnings if needed
      // console.warn(`[FFmpeg ${stream.station.id}] ${data.toString().trim()}`);
    });

    ffmpeg.on('close', (code) => {
      console.log(`[STREAM HUB] FFmpeg exited (code: ${code}) for station: ${stream.station.id}`);
      
      // Auto-restart if listeners are still waiting
      if (stream.listeners.size > 0) {
        console.log(`[STREAM HUB] 🔄 Re-launching FFmpeg for ${stream.station.id} (${stream.listeners.size} active listeners)`);
        setTimeout(() => {
          if (stream.listeners.size > 0 && this.activeStreams.has(stream.station.id)) {
            this._startFFmpeg(stream);
          }
        }, 2000);
      } else {
        this.activeStreams.delete(stream.station.id);
      }
    });

    ffmpeg.on('error', (err) => {
      console.error(`[STREAM HUB ERROR] FFmpeg spawn error on ${stream.station.id}:`, err.message);
    });
  }

  addListener(station, res) {
    const stream = this.getStream(station);
    stream.listeners.add(res);

    console.log(`[STREAM HUB] 👤 Client connected to "${station.name}". Total listeners on this station: ${stream.listeners.size}`);

    // Immediately flush the rolling buffer to new client so audio starts instantly without buffering lag
    if (stream.ringBuffer.length > 0) {
      for (const chunk of stream.ringBuffer) {
        try {
          res.write(chunk);
        } catch (e) {
          break;
        }
      }
    }

    // Clean up when client disconnects
    res.on('close', () => {
      this.removeListener(station.id, res);
    });
  }

  removeListener(stationId, res) {
    const stream = this.activeStreams.get(stationId);
    if (!stream) return;

    stream.listeners.delete(res);
    console.log(`[STREAM HUB] 👋 Client disconnected from "${stream.station.name}". Remaining listeners: ${stream.listeners.size}`);

    // If no listeners left on this station, schedule graceful shutdown to free CPU/RAM
    if (stream.listeners.size === 0) {
      if (stream.idleTimer) clearTimeout(stream.idleTimer);
      
      stream.idleTimer = setTimeout(() => {
        if (stream.listeners.size === 0) {
          console.log(`[STREAM HUB] 💤 Station idle (${this.idleTimeoutMs / 1000}s), stopping FFmpeg for: ${stream.station.name}`);
          if (stream.ffmpeg) {
            try {
              stream.ffmpeg.kill('SIGTERM');
            } catch (e) {}
          }
          this.activeStreams.delete(stationId);
        }
      }, this.idleTimeoutMs);
    }
  }

  getStats() {
    let totalListeners = 0;
    const activeStations = [];

    for (const [id, stream] of this.activeStreams.entries()) {
      totalListeners += stream.listeners.size;
      activeStations.push({
        id,
        name: stream.station.name,
        listeners: stream.listeners.size,
        uptimeSeconds: Math.floor((Date.now() - stream.startTime) / 1000),
        bytesStreamed: stream.bytesStreamed
      });
    }

    return {
      activeStationsCount: this.activeStreams.size,
      totalListeners,
      activeStations,
      memoryUsage: process.memoryUsage(),
      serverUptime: Math.floor(process.uptime())
    };
  }
}

module.exports = StreamHub;
