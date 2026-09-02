// Akashvani & Web Radio Hub - Client Application with Hybrid HLS Engine
document.addEventListener('DOMContentLoaded', () => {
  // State
  let stations = [];
  let currentStationIndex = -1;
  let currentFilteredStations = [];
  let activeTab = 'air';
  let favorites = new Set(JSON.parse(localStorage.getItem('akashvani_favs') || '[]'));
  let isPlaying = false;
  let streamMode = localStorage.getItem('akashvani_mode') || 'direct'; // 'direct' (0% server load) or 'proxy' (MP3 server transcode)

  // HLS Engine Instance
  let hls = null;

  // DOM Elements
  const audio = document.getElementById('audioElement');
  const stationsGrid = document.getElementById('stationsGrid');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const stateFilter = document.getElementById('stateFilter');
  const langFilter = document.getElementById('langFilter');
  const tabBtns = document.querySelectorAll('.tab-btn');

  // Player Bar Elements
  const playPauseBtn = document.getElementById('playPauseBtn');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const playerStationName = document.getElementById('playerStationName');
  const playerStationSub = document.getElementById('playerStationSub');
  const liveDot = document.getElementById('liveDot');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeIcon = document.getElementById('volumeIcon');
  const favBtn = document.getElementById('favBtn');
  const copyStreamBtn = document.getElementById('copyStreamBtn');

  // HUD Elements
  const hudCategory = document.getElementById('hudCategory');
  const hudState = document.getElementById('hudState');
  const hudTitle = document.getElementById('hudTitle');
  const hudLanguage = document.getElementById('hudLanguage');
  const hudStatusText = document.getElementById('hudStatusText');
  const hudEngine = document.getElementById('hudEngine');

  // Counts
  const countAir = document.getElementById('countAir');
  const countTv = document.getElementById('countTv');
  const countOthers = document.getElementById('countOthers');
  const countFav = document.getElementById('countFav');

  // Modal & Theme & Mode
  const infoBtn = document.getElementById('infoBtn');
  const infoModal = document.getElementById('infoModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const modeToggleBtn = document.getElementById('modeToggleBtn');
  const modeIcon = document.getElementById('modeIcon');
  const modeText = document.getElementById('modeText');
  const toast = document.getElementById('toast');
  const activeStreamUrl = document.getElementById('activeStreamUrl');
  const sampleM3uUrl = document.getElementById('sampleM3uUrl');

  sampleM3uUrl.textContent = `${window.location.origin}/playlist.m3u`;

  // Visualizer Setup
  const canvas = document.getElementById('visualizerCanvas');
  const ctx = canvas.getContext('2d');
  let audioCtx, analyser, source, dataArray;
  let visualizerInitialized = false;

  function initVisualizer() {
    if (visualizerInitialized) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source = audioCtx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      visualizerInitialized = true;
      drawVisualizer();
    } catch (e) {
      console.warn('Web Audio visualizer running in fallback canvas mode');
    }
  }

  function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);
    if (!visualizerInitialized || !analyser) {
      drawFallbackVisualizer();
      return;
    }

    analyser.getByteFrequencyData(dataArray);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / analyser.frequencyBinCount) * 1.5;
    let x = 0;

    for (let i = 0; i < analyser.frequencyBinCount; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;
      const isCyber = document.body.classList.contains('theme-cyber');
      ctx.fillStyle = isCyber ? `rgb(0, ${Math.min(255, 150 + dataArray[i])}, 100)` : `rgb(124, 77, 255)`;
      ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
      x += barWidth;
    }
  }

  function drawFallbackVisualizer() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bars = 24;
    const barWidth = canvas.width / bars;
    const time = Date.now() / 150;

    for (let i = 0; i < bars; i++) {
      const height = isPlaying ? Math.abs(Math.sin(time + i * 0.4)) * (canvas.height * 0.7) + 5 : 3;
      const isCyber = document.body.classList.contains('theme-cyber');
      ctx.fillStyle = isCyber ? '#00ff66' : '#7c4dff';
      ctx.fillRect(i * barWidth, canvas.height - height, barWidth - 3, height);
    }
  }

  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Mode Toggle Handler
  function updateModeUI() {
    if (streamMode === 'direct') {
      modeIcon.textContent = '⚡';
      modeText.textContent = 'Direct Mode (0% Load)';
      hudEngine.textContent = 'DIRECT HLS';
      modeToggleBtn.classList.add('active-mode');
    } else {
      modeIcon.textContent = '📻';
      modeText.textContent = 'Server MP3 Hub';
      hudEngine.textContent = 'SERVER MP3';
      modeToggleBtn.classList.remove('active-mode');
    }
    localStorage.setItem('akashvani_mode', streamMode);
  }

  modeToggleBtn.addEventListener('click', () => {
    streamMode = streamMode === 'direct' ? 'proxy' : 'direct';
    updateModeUI();
    showToast(`Switched to: ${streamMode === 'direct' ? '⚡ Direct Client Mode (0% Server Load)' : '📻 Server MP3 Hub Mode'}`);
    if (currentStationIndex !== -1) {
      playStation(stations[currentStationIndex]);
    }
  });

  // 1. Fetch Stations
  async function loadStations() {
    try {
      hudStatusText.textContent = 'Loading stations...';
      let data;
      try {
        const res = await fetch('/api/stations');
        if (res.ok) data = await res.json();
      } catch (e) {}

      if (!data) {
        const res2 = await fetch('stations.json');
        data = await res2.json();
      }

      stations = Array.isArray(data) ? data : (data.stations || []);
      populateFilters();
      updateCounts();
      renderStations();
      updateModeUI();
      hudStatusText.textContent = 'Ready';
    } catch (err) {
      console.error('Error loading stations:', err);
      hudStatusText.textContent = 'Error loading stations';
    }
  }

  // Handle M3U download statically or dynamically
  const m3uDownloadLink = document.querySelector('a[href="/playlist.m3u"]');
  if (m3uDownloadLink) {
    m3uDownloadLink.addEventListener('click', (e) => {
      if (window.location.protocol.startsWith('http')) {
        let m3u = '#EXTM3U\n';
        stations.forEach(s => {
          const group = s.category === 'air' ? 'All India Radio' : (s.category === 'tv' ? 'Live TV Audio' : 'Web Radio');
          m3u += `#EXTINF:-1 tvg-id="${s.id}" tvg-name="${s.name}" group-title="${group}" radio="true",${s.name} [${s.language || s.state || ''}]\n`;
          m3u += `${s.stream_url}\n`;
        });
        const blob = new Blob([m3u], { type: 'audio/x-mpegurl' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'akashvani_radio.m3u';
        a.click();
        URL.revokeObjectURL(url);
        e.preventDefault();
      }
    });
  }

  // 2. Populate State & Language Dropdowns
  function populateFilters() {
    const states = new Set();
    const languages = new Set();

    stations.forEach(s => {
      if (s.state) states.add(s.state);
      if (s.language) {
        s.language.split(',').forEach(l => languages.add(l.trim()));
      }
    });

    Array.from(states).sort().forEach(st => {
      const opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      stateFilter.appendChild(opt);
    });

    Array.from(languages).sort().forEach(lang => {
      const opt = document.createElement('option');
      opt.value = lang;
      opt.textContent = lang;
      langFilter.appendChild(opt);
    });
  }

  // 3. Update Tab Counts
  function updateCounts() {
    countAir.textContent = stations.filter(s => s.category === 'air').length;
    countTv.textContent = stations.filter(s => s.category === 'tv').length;
    countOthers.textContent = stations.filter(s => s.category === 'others').length;
    countFav.textContent = favorites.size;
  }

  // 4. Render Station Cards
  function renderStations() {
    const query = searchInput.value.trim().toLowerCase();
    const selectedState = stateFilter.value;
    const selectedLang = langFilter.value;

    currentFilteredStations = stations.filter(s => {
      if (activeTab === 'fav') {
        if (!favorites.has(s.id)) return false;
      } else if (s.category !== activeTab) {
        return false;
      }

      if (selectedState && s.state !== selectedState) return false;
      if (selectedLang && (!s.language || !s.language.toLowerCase().includes(selectedLang.toLowerCase()))) return false;

      if (query) {
        const matchesName = s.name.toLowerCase().includes(query);
        const matchesLang = s.language && s.language.toLowerCase().includes(query);
        const matchesState = s.state && s.state.toLowerCase().includes(query);
        if (!matchesName && !matchesLang && !matchesState) return false;
      }

      return true;
    });

    stationsGrid.innerHTML = '';

    if (currentFilteredStations.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    currentFilteredStations.forEach((station) => {
      const isFav = favorites.has(station.id);
      const isCurrent = currentStationIndex !== -1 && stations[currentStationIndex]?.id === station.id;

      const card = document.createElement('div');
      card.className = `station-card ${isCurrent && isPlaying ? 'active-playing' : ''}`;
      card.innerHTML = `
        <div class="card-top">
          <div class="card-name">${station.name}</div>
          <button class="card-fav-btn ${isFav ? 'is-fav' : ''}" title="Favorite">★</button>
        </div>
        <div class="card-mid">
          <span class="tag tag-state">${station.state || 'NATIONAL'}</span>
          <span class="tag">${station.language || 'General'}</span>
        </div>
        <div class="card-bottom">
          <span class="card-play-trigger">${isCurrent && isPlaying ? '❚❚ Playing' : '▶ Play Now'}</span>
          <button class="card-copy-btn" title="Copy MP3 Stream URL">🔗 MP3</button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('card-fav-btn')) {
          toggleFavorite(station.id);
          return;
        }
        if (e.target.classList.contains('card-copy-btn')) {
          copyStreamUrl(station.id);
          return;
        }
        playStation(station);
      });

      stationsGrid.appendChild(card);
    });
  }

  // 5. Playback Engine (Smart Hybrid HLS & MP3)
  function playStation(station) {
    if (!station) return;
    initVisualizer();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    currentStationIndex = stations.findIndex(s => s.id === station.id);

    // Update HUD
    hudTitle.textContent = station.name;
    hudCategory.textContent = station.category.toUpperCase();
    hudState.textContent = station.state || 'NATIONAL';
    hudLanguage.textContent = station.language || 'Standard';
    hudStatusText.textContent = 'Connecting...';

    // Update Player Bar
    playerStationName.textContent = station.name;
    playerStationSub.textContent = `${station.state || 'NATIONAL'} • ${station.language || 'Standard'}`;
    activeStreamUrl.textContent = `${window.location.origin}/stream/${station.id}`;

    // Clean up existing HLS engine instance
    if (hls) {
      hls.destroy();
      hls = null;
    }

    const isDirectHls = streamMode === 'direct' && station.stream_url && (station.stream_url.includes('.m3u8') || station.stream_url.startsWith('http'));

    if (isDirectHls) {
      // ⚡ DIRECT CLIENT MODE (0% Server Load)
      if (window.Hls && Hls.isSupported() && station.stream_url.includes('.m3u8')) {
        hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(station.stream_url);
        hls.attachMedia(audio);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          audio.play().then(onPlaySuccess).catch(onPlayError);
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.warn('Direct HLS fatal error, seamlessly falling back to Server MP3 Hub:', data);
            fallbackToProxy(station);
          }
        });
      } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        // Native Safari / iOS HLS
        audio.src = station.stream_url;
        audio.play().then(onPlaySuccess).catch(() => fallbackToProxy(station));
      } else {
        fallbackToProxy(station);
      }
    } else {
      // 📻 SERVER MP3 HUB MODE
      fallbackToProxy(station);
    }
  }

  function fallbackToProxy(station) {
    audio.src = `/stream/${station.id}`;
    audio.play().then(onPlaySuccess).catch(onPlayError);
  }

  function onPlaySuccess() {
    isPlaying = true;
    playPauseBtn.textContent = '❚❚';
    liveDot.classList.add('playing');
    hudStatusText.textContent = 'LIVE NOW';
    updateFavButton();
    renderStations();
  }

  function onPlayError(err) {
    console.warn('Playback error:', err);
    hudStatusText.textContent = 'Connecting...';
  }

  function togglePlay() {
    if (!audio.src && !hls) {
      if (stations.length > 0) playStation(stations[0]);
      return;
    }

    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      playPauseBtn.textContent = '▶';
      liveDot.classList.remove('playing');
      hudStatusText.textContent = 'Paused';
    } else {
      audio.play().then(onPlaySuccess);
    }
    renderStations();
  }

  function playNext() {
    if (currentFilteredStations.length === 0) return;
    let nextIndex = 0;
    if (currentStationIndex !== -1) {
      const currentInFiltered = currentFilteredStations.findIndex(s => s.id === stations[currentStationIndex]?.id);
      nextIndex = (currentInFiltered + 1) % currentFilteredStations.length;
    }
    playStation(currentFilteredStations[nextIndex]);
  }

  function playPrev() {
    if (currentFilteredStations.length === 0) return;
    let prevIndex = 0;
    if (currentStationIndex !== -1) {
      const currentInFiltered = currentFilteredStations.findIndex(s => s.id === stations[currentStationIndex]?.id);
      prevIndex = (currentInFiltered - 1 + currentFilteredStations.length) % currentFilteredStations.length;
    }
    playStation(currentFilteredStations[prevIndex]);
  }

  // 6. Favorites System
  function toggleFavorite(stationId) {
    if (favorites.has(stationId)) {
      favorites.delete(stationId);
    } else {
      favorites.add(stationId);
    }
    localStorage.setItem('akashvani_favs', JSON.stringify(Array.from(favorites)));
    updateCounts();
    updateFavButton();
    renderStations();
  }

  function updateFavButton() {
    if (currentStationIndex !== -1) {
      const current = stations[currentStationIndex];
      favBtn.style.color = favorites.has(current?.id) ? '#ffd700' : 'inherit';
    }
  }

  // 7. Clipboard Copy
  function copyStreamUrl(stationId) {
    const url = `${window.location.origin}/stream/${stationId}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast(`🔗 Copied MP3 URL: ${url}`);
    });
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2800);
  }

  // 8. Event Listeners
  playPauseBtn.addEventListener('click', togglePlay);
  nextBtn.addEventListener('click', playNext);
  prevBtn.addEventListener('click', playPrev);

  favBtn.addEventListener('click', () => {
    if (currentStationIndex !== -1) {
      toggleFavorite(stations[currentStationIndex].id);
    }
  });

  copyStreamBtn.addEventListener('click', () => {
    if (currentStationIndex !== -1) {
      copyStreamUrl(stations[currentStationIndex].id);
    } else {
      showToast('Select a station first!');
    }
  });

  volumeSlider.addEventListener('input', (e) => {
    audio.volume = e.target.value;
    volumeIcon.textContent = audio.volume === 0 ? '🔇' : (audio.volume < 0.5 ? '🔉' : '🔊');
  });

  // Search & Filters
  searchInput.addEventListener('input', renderStations);
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    renderStations();
  });
  stateFilter.addEventListener('change', renderStations);
  langFilter.addEventListener('change', renderStations);

  // Tab Switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      renderStations();
    });
  });

  // Keypad & Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (document.activeElement === searchInput) {
      if (e.key === 'Escape') searchInput.blur();
      return;
    }

    if (e.key === '5' || e.code === 'Numpad5' || e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === '8' || e.code === 'Numpad8' || e.key === 'ArrowDown') {
      e.preventDefault();
      playNext();
    } else if (e.key === '2' || e.code === 'Numpad2' || e.key === 'ArrowUp') {
      e.preventDefault();
      playPrev();
    } else if (e.key === '0' || e.code === 'Numpad0' || e.key === 'm') {
      audio.muted = !audio.muted;
      volumeIcon.textContent = audio.muted ? '🔇' : '🔊';
    } else if (e.key === '/' || e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
    }
  });

  document.querySelectorAll('.key-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (key === '5') togglePlay();
      if (key === '8') playNext();
      if (key === '2') playPrev();
      if (key === '0') {
        audio.muted = !audio.muted;
        volumeIcon.textContent = audio.muted ? '🔇' : '🔊';
      }
    });
  });

  // Modal
  infoBtn.addEventListener('click', () => infoModal.classList.remove('hidden'));
  closeModalBtn.addEventListener('click', () => infoModal.classList.add('hidden'));
  infoModal.addEventListener('click', (e) => {
    if (e.target === infoModal) infoModal.classList.add('hidden');
  });

  // Theme Toggle
  themeToggleBtn.addEventListener('click', () => {
    if (document.body.classList.contains('theme-cyber')) {
      document.body.classList.remove('theme-cyber');
      document.body.classList.add('theme-modern');
    } else {
      document.body.classList.remove('theme-modern');
      document.body.classList.add('theme-cyber');
    }
  });

  drawFallbackVisualizer();
  loadStations();
});
