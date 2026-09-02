// Akashvani Radio - Clean, Simple & Search-First Client
document.addEventListener('DOMContentLoaded', () => {
  // State
  let stations = [];
  let currentStation = null;
  let currentFilter = 'all';
  let favorites = new Set(JSON.parse(localStorage.getItem('akashvani_favs') || '[]'));
  let isPlaying = false;
  let hls = null;

  // Featured station IDs to show on initial clean view
  const FEATURED_IDS = [
    'vividh_bharati',
    'live_news_24x7',
    'fm_gold_delhi',
    'raagam',
    'fm_rainbow_delhi',
    'radio_mirchi_top20',
    'tv_24_news',
    'tv_manorama_news',
    'tv_asianet_news',
    'radio_carnatic',
    'radio_retro_hindi',
    'tv_dd_news'
  ];

  // DOM Elements
  const audio = document.getElementById('audioElement');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const quickTags = document.getElementById('quickTags');
  const stateFilter = document.getElementById('stateFilter');
  const stationsList = document.getElementById('stationsList');
  const emptyState = document.getElementById('emptyState');
  const resetSearchBtn = document.getElementById('resetSearchBtn');
  const resultsTitle = document.getElementById('resultsTitle');
  const resultsCount = document.getElementById('resultsCount');
  const countFav = document.getElementById('countFav');

  // Hero Card
  const nowPlayingCard = document.querySelector('.now-playing-card');
  const heroTitle = document.getElementById('heroTitle');
  const heroDesc = document.getElementById('heroDesc');
  const heroCategory = document.getElementById('heroCategory');
  const heroState = document.getElementById('heroState');

  // Bottom Player
  const playPauseBtn = document.getElementById('playPauseBtn');
  const playIcon = playPauseBtn.querySelector('.play-icon');
  const pauseIcon = playPauseBtn.querySelector('.pause-icon');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const playerStationName = document.getElementById('playerStationName');
  const playerStationSub = document.getElementById('playerStationSub');
  const playerStatusText = document.getElementById('playerStatusText');
  const volumeSlider = document.getElementById('volumeSlider');
  const muteBtn = document.getElementById('muteBtn');
  const favBtn = document.getElementById('favBtn');
  const copyStreamBtn = document.getElementById('copyStreamBtn');

  // Modal
  const infoBtn = document.getElementById('infoBtn');
  const infoModal = document.getElementById('infoModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const downloadM3uBtn = document.getElementById('downloadM3uBtn');
  const m3uFullUrl = document.getElementById('m3uFullUrl');
  const activeStationDirectUrl = document.getElementById('activeStationDirectUrl');
  const esp32Url = document.getElementById('esp32Url');
  const toast = document.getElementById('toast');

  // Visualizer Setup
  const canvas = document.getElementById('visualizerCanvas');
  const ctx = canvas.getContext('2d');
  let audioCtx, analyser, source, dataArray;
  let visualizerInit = false;

  function initVisualizer() {
    if (visualizerInit) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source = audioCtx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      visualizerInit = true;
      drawVisualizer();
    } catch (e) {
      // Fallback animation
    }
  }

  function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);
    if (!visualizerInit || !analyser) {
      drawFallback();
      return;
    }

    analyser.getByteFrequencyData(dataArray);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / analyser.frequencyBinCount) * 1.6;
    let x = 0;

    for (let i = 0; i < analyser.frequencyBinCount; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;
      const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
      gradient.addColorStop(0, '#6366f1');
      gradient.addColorStop(1, '#06b6d4');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
      x += barWidth;
    }
  }

  function drawFallback() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bars = 16;
    const barWidth = canvas.width / bars;
    const time = Date.now() / 180;

    for (let i = 0; i < bars; i++) {
      const height = isPlaying ? Math.abs(Math.sin(time + i * 0.45)) * (canvas.height * 0.75) + 4 : 3;
      const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
      gradient.addColorStop(0, '#6366f1');
      gradient.addColorStop(1, '#06b6d4');
      ctx.fillStyle = gradient;
      ctx.fillRect(i * barWidth, canvas.height - height, barWidth - 3, height);
    }
  }

  function resizeCanvas() {
    if (canvas && canvas.parentElement) {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    }
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // 1. Fetch Station List
  async function loadStations() {
    try {
      playerStatusText.textContent = 'Loading...';
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
      populateStateDropdown();
      updateFavoritesCount();
      renderStations();
      playerStatusText.textContent = 'Ready';
    } catch (err) {
      console.error('Error loading stations:', err);
      playerStatusText.textContent = 'Offline';
    }
  }

  // 2. Populate State Dropdown
  function populateStateDropdown() {
    const states = new Set();
    stations.forEach(s => {
      if (s.state) states.add(s.state);
    });
    Array.from(states).sort().forEach(st => {
      const opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      stateFilter.appendChild(opt);
    });
  }

  function updateFavoritesCount() {
    countFav.textContent = favorites.size;
  }

  // 3. Search & Filter Logic
  function getFilteredStations() {
    const query = searchInput.value.trim().toLowerCase();
    const selectedState = stateFilter.value;

    // If no search query and default "all" pill selected -> return curated featured stations
    if (!query && currentFilter === 'all' && !selectedState) {
      const featured = stations.filter(s => FEATURED_IDS.includes(s.id));
      return featured.length > 0 ? featured : stations.slice(0, 12);
    }

    return stations.filter(s => {
      // Filter pills
      if (currentFilter === 'fav') {
        if (!favorites.has(s.id)) return false;
      } else if (currentFilter === 'tv') {
        if (s.category !== 'tv') return false;
      } else if (currentFilter !== 'all') {
        // Language match
        if (!s.language || !s.language.toLowerCase().includes(currentFilter.toLowerCase())) return false;
      }

      // State dropdown
      if (selectedState && s.state !== selectedState) return false;

      // Query search
      if (query) {
        const matchesName = s.name.toLowerCase().includes(query);
        const matchesLang = s.language && s.language.toLowerCase().includes(query);
        const matchesState = s.state && s.state.toLowerCase().includes(query);
        if (!matchesName && !matchesLang && !matchesState) return false;
      }

      return true;
    });
  }

  // 4. Render Station List (Compact & Clean)
  function renderStations() {
    const query = searchInput.value.trim();
    const isDefault = !query && currentFilter === 'all' && !stateFilter.value;
    const list = getFilteredStations();

    // Section title
    if (isDefault) {
      resultsTitle.textContent = '⭐ Featured Stations';
      resultsCount.textContent = `${list.length} stations`;
    } else if (query) {
      resultsTitle.textContent = `Search Results for "${query}"`;
      resultsCount.textContent = `${list.length} ${list.length === 1 ? 'station' : 'stations'} found`;
    } else if (currentFilter === 'fav') {
      resultsTitle.textContent = '⭐ Saved Favorites';
      resultsCount.textContent = `${list.length} saved`;
    } else {
      resultsTitle.textContent = `${currentFilter.toUpperCase()} Stations`;
      resultsCount.textContent = `${list.length} stations`;
    }

    stationsList.innerHTML = '';

    if (list.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    list.forEach(station => {
      const isFav = favorites.has(station.id);
      const isCurrent = currentStation && currentStation.id === station.id;

      const item = document.createElement('div');
      item.className = `station-item ${isCurrent && isPlaying ? 'active' : ''}`;
      
      const avatarLetter = station.name.charAt(0).toUpperCase();

      item.innerHTML = `
        <div class="item-left">
          <div class="item-badge">${avatarLetter}</div>
          <div class="item-text">
            <div class="item-title">${station.name}</div>
            <div class="item-sub">${station.state || 'National'} • ${station.language || 'Standard'}</div>
          </div>
        </div>
        <div class="item-actions">
          <button class="item-fav-btn ${isFav ? 'is-fav' : ''}" title="${isFav ? 'Remove Favorite' : 'Save Favorite'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.item-fav-btn')) {
          toggleFavorite(station.id);
          return;
        }
        playStation(station);
      });

      stationsList.appendChild(item);
    });
  }

  // 5. Audio Playback
  function playStation(station) {
    if (!station) return;
    initVisualizer();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    currentStation = station;

    // Update Hero UI
    heroTitle.textContent = station.name;
    heroDesc.textContent = `${station.state || 'India'} • ${station.language || 'Broadcast'}`;
    heroCategory.textContent = station.category.toUpperCase();
    heroState.textContent = station.state || 'NATIONAL';
    nowPlayingCard.classList.add('playing');

    // Update Bottom Player UI
    playerStationName.textContent = station.name;
    playerStationSub.textContent = `${station.state || 'National'} • ${station.language || 'Standard'}`;
    playerStatusText.textContent = 'Buffering...';

    // Direct stream link for copy/modal
    activeStationDirectUrl.textContent = station.stream_url;
    esp32Url.textContent = station.stream_url;

    // Cleanup previous HLS
    if (hls) {
      hls.destroy();
      hls = null;
    }

    // Direct playback
    if (window.Hls && Hls.isSupported() && station.stream_url && station.stream_url.includes('.m3u8')) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(station.stream_url);
      hls.attachMedia(audio);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        audio.play().then(onPlaySuccess).catch(onPlayError);
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          audio.src = station.stream_url;
          audio.play().then(onPlaySuccess).catch(onPlayError);
        }
      });
    } else {
      audio.src = station.stream_url;
      audio.play().then(onPlaySuccess).catch(onPlayError);
    }

    updateFavButton();
    renderStations();
  }

  function onPlaySuccess() {
    isPlaying = true;
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
    playerStatusText.textContent = 'Live Broadcast';
    nowPlayingCard.classList.add('playing');
    renderStations();
  }

  function onPlayError(err) {
    console.warn('Playback notice:', err);
    playerStatusText.textContent = 'Connecting...';
  }

  function togglePlay() {
    if (!currentStation) {
      const list = getFilteredStations();
      if (list.length > 0) playStation(list[0]);
      return;
    }

    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      playIcon.classList.remove('hidden');
      pauseIcon.classList.add('hidden');
      playerStatusText.textContent = 'Paused';
      nowPlayingCard.classList.remove('playing');
    } else {
      audio.play().then(onPlaySuccess);
    }
    renderStations();
  }

  function playNext() {
    const list = getFilteredStations();
    if (list.length === 0) return;
    let nextIdx = 0;
    if (currentStation) {
      const idx = list.findIndex(s => s.id === currentStation.id);
      nextIdx = (idx + 1) % list.length;
    }
    playStation(list[nextIdx]);
  }

  function playPrev() {
    const list = getFilteredStations();
    if (list.length === 0) return;
    let prevIdx = 0;
    if (currentStation) {
      const idx = list.findIndex(s => s.id === currentStation.id);
      prevIdx = (idx - 1 + list.length) % list.length;
    }
    playStation(list[prevIdx]);
  }

  // 6. Favorites
  function toggleFavorite(stationId) {
    if (favorites.has(stationId)) {
      favorites.delete(stationId);
    } else {
      favorites.add(stationId);
    }
    localStorage.setItem('akashvani_favs', JSON.stringify(Array.from(favorites)));
    updateFavoritesCount();
    updateFavButton();
    renderStations();
  }

  function updateFavButton() {
    if (currentStation) {
      const isFav = favorites.has(currentStation.id);
      favBtn.classList.toggle('is-fav', isFav);
      favBtn.querySelector('svg').setAttribute('fill', isFav ? 'currentColor' : 'none');
    }
  }

  // 7. Clipboard & M3U Export
  function copyStreamUrl() {
    if (!currentStation) {
      showToast('Select a station first');
      return;
    }
    const url = currentStation.stream_url;
    navigator.clipboard.writeText(url).then(() => {
      showToast(`Copied stream link: ${currentStation.name}`);
    });
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
  }

  function exportM3u() {
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
    a.download = 'akashvani_all_india_radio.m3u';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded M3U Playlist');
  }

  // 8. Event Listeners
  playPauseBtn.addEventListener('click', togglePlay);
  nextBtn.addEventListener('click', playNext);
  prevBtn.addEventListener('click', playPrev);
  downloadM3uBtn.addEventListener('click', exportM3u);
  favBtn.addEventListener('click', () => {
    if (currentStation) toggleFavorite(currentStation.id);
  });
  copyStreamBtn.addEventListener('click', copyStreamUrl);

  // Volume
  volumeSlider.addEventListener('input', (e) => {
    audio.volume = e.target.value;
    audio.muted = (audio.volume === 0);
  });

  muteBtn.addEventListener('click', () => {
    audio.muted = !audio.muted;
    volumeSlider.value = audio.muted ? 0 : (audio.volume || 1);
  });

  // Search Input
  searchInput.addEventListener('input', () => {
    clearSearchBtn.classList.toggle('visible', searchInput.value.length > 0);
    renderStations();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.remove('visible');
    renderStations();
  });

  resetSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.remove('visible');
    currentFilter = 'all';
    stateFilter.value = '';
    document.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p.dataset.filter === 'all'));
    renderStations();
  });

  stateFilter.addEventListener('change', renderStations);

  // Quick Filter Pills
  quickTags.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentFilter = pill.dataset.filter;
    renderStations();
  });

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (document.activeElement === searchInput) {
      if (e.key === 'Escape') searchInput.blur();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      playNext();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      playPrev();
    } else if (e.key === 'm' || e.key === 'M') {
      audio.muted = !audio.muted;
    } else if (e.key === '/' || e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
    }
  });

  // Modal
  infoBtn.addEventListener('click', () => infoModal.classList.remove('hidden'));
  closeModalBtn.addEventListener('click', () => infoModal.classList.add('hidden'));
  infoModal.addEventListener('click', (e) => {
    if (e.target === infoModal) infoModal.classList.add('hidden');
  });

  document.querySelectorAll('.inline-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.copy;
      const text = type === 'm3u' ? m3uFullUrl.textContent : activeStationDirectUrl.textContent;
      navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'));
    });
  });

  // Initialize
  drawFallback();
  loadStations();
});
