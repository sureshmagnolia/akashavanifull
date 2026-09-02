// Akashvani & Live Radio Hub - Modern Studio Client
document.addEventListener('DOMContentLoaded', () => {
  // Application State
  let stations = [];
  let currentStation = null;
  let currentFilteredStations = [];
  let activeTab = 'air';
  let activeLangChip = '';
  let favorites = new Set(JSON.parse(localStorage.getItem('akashvani_favs') || '[]'));
  let isPlaying = false;
  let hls = null;

  // DOM Elements
  const audio = document.getElementById('audioElement');
  const stationsGrid = document.getElementById('stationsGrid');
  const emptyState = document.getElementById('emptyState');
  const resetFilterBtn = document.getElementById('resetFilterBtn');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const stateFilter = document.getElementById('stateFilter');
  const langFilter = document.getElementById('langFilter');
  const languageChips = document.getElementById('languageChips');
  const navItems = document.querySelectorAll('.nav-item');

  // Hero Card Elements
  const heroPlayerCard = document.querySelector('.hero-player-card');
  const heroTitle = document.getElementById('heroTitle');
  const heroSubtitle = document.getElementById('heroSubtitle');
  const heroCategory = document.getElementById('heroCategory');
  const heroState = document.getElementById('heroState');
  const sectionTitle = document.getElementById('sectionTitle');
  const sectionSubtitle = document.getElementById('sectionSubtitle');

  // Bottom Player Elements
  const playPauseBtn = document.getElementById('playPauseBtn');
  const playSvg = playPauseBtn.querySelector('.play-svg');
  const pauseSvg = playPauseBtn.querySelector('.pause-svg');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const playerStationName = document.getElementById('playerStationName');
  const playerStationSub = document.getElementById('playerStationSub');
  const statusDot = document.getElementById('statusDot');
  const playerStatusLabel = document.getElementById('playerStatusLabel');
  const volumeSlider = document.getElementById('volumeSlider');
  const muteBtn = document.getElementById('muteBtn');
  const favBtn = document.getElementById('favBtn');
  const copyStreamBtn = document.getElementById('copyStreamBtn');

  // Tab Counters
  const countAir = document.getElementById('countAir');
  const countTv = document.getElementById('countTv');
  const countOthers = document.getElementById('countOthers');
  const countFav = document.getElementById('countFav');

  // Modal Elements
  const infoBtn = document.getElementById('infoBtn');
  const infoModal = document.getElementById('infoModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const downloadM3uBtn = document.getElementById('downloadM3uBtn');
  const m3uFullUrl = document.getElementById('m3uFullUrl');
  const activeStationDirectUrl = document.getElementById('activeStationDirectUrl');
  const esp32Url = document.getElementById('esp32Url');
  const toast = document.getElementById('toast');

  m3uFullUrl.textContent = `${window.location.origin}/playlist.m3u`;

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
      ctx.fillRect(x, canvas.height - barHeight, barWidth - 3, barHeight);
      x += barWidth;
    }
  }

  function drawFallback() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bars = 18;
    const barWidth = canvas.width / bars;
    const time = Date.now() / 180;

    for (let i = 0; i < bars; i++) {
      const height = isPlaying ? Math.abs(Math.sin(time + i * 0.45)) * (canvas.height * 0.75) + 6 : 4;
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

  // 1. Data Fetching
  async function loadStations() {
    try {
      playerStatusLabel.textContent = 'Loading...';
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
      playerStatusLabel.textContent = 'Ready';
    } catch (err) {
      console.error('Error loading stations:', err);
      playerStatusLabel.textContent = 'Offline';
    }
  }

  // 2. Populate Dropdowns
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

  // 3. Tab & Count Updates
  function updateCounts() {
    countAir.textContent = stations.filter(s => s.category === 'air').length;
    countTv.textContent = stations.filter(s => s.category === 'tv').length;
    countOthers.textContent = stations.filter(s => s.category === 'others').length;
    countFav.textContent = favorites.size;
  }

  // 4. Render Grid Cards
  function renderStations() {
    const query = searchInput.value.trim().toLowerCase();
    const selectedState = stateFilter.value;
    const selectedLang = langFilter.value || activeLangChip;

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

    // Update Section Title & Subtitle
    const tabNames = { air: 'All India Radio Stations', tv: 'Live TV Audio Channels', others: 'Web & Classical Radios', fav: 'Saved Favorite Stations' };
    sectionTitle.textContent = tabNames[activeTab] || 'Radio Stations';
    sectionSubtitle.textContent = `Showing ${currentFilteredStations.length} ${currentFilteredStations.length === 1 ? 'station' : 'stations'}`;

    stationsGrid.innerHTML = '';

    if (currentFilteredStations.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    currentFilteredStations.forEach((station) => {
      const isFav = favorites.has(station.id);
      const isCurrent = currentStation && currentStation.id === station.id;

      const card = document.createElement('div');
      card.className = `station-card ${isCurrent && isPlaying ? 'active-card' : ''}`;
      
      const avatarLetter = station.name.charAt(0).toUpperCase();

      card.innerHTML = `
        <div class="card-header">
          <div class="card-title-group">
            <div class="card-avatar">${avatarLetter}</div>
            <div class="card-title">${station.name}</div>
          </div>
          <button class="card-fav-btn ${isFav ? 'is-fav' : ''}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </button>
        </div>
        <div class="card-tags">
          <span class="tag-badge state">${station.state || 'NATIONAL'}</span>
          <span class="tag-badge">${station.language || 'General'}</span>
        </div>
        <div class="card-footer">
          <div class="play-action">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              ${isCurrent && isPlaying ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>' : '<path d="M8 5v14l11-7z"/>'}
            </svg>
            ${isCurrent && isPlaying ? 'Playing' : 'Listen Now'}
          </div>
          <button class="btn-inline-copy" title="Copy Stream URL">Copy URL</button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-fav-btn')) {
          toggleFavorite(station.id);
          return;
        }
        if (e.target.closest('.btn-inline-copy')) {
          copyStreamUrl(station);
          return;
        }
        playStation(station);
      });

      stationsGrid.appendChild(card);
    });
  }

  // 5. Playback Engine
  function playStation(station) {
    if (!station) return;
    initVisualizer();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    currentStation = station;

    // Update Hero Card
    heroTitle.textContent = station.name;
    heroSubtitle.textContent = `Broadcasting from ${station.state || 'India'} in ${station.language || 'Standard'}.`;
    heroCategory.textContent = station.category.toUpperCase();
    heroState.textContent = station.state || 'NATIONAL';
    heroPlayerCard.classList.add('playing');

    // Update Bottom Player
    playerStationName.textContent = station.name;
    playerStationSub.textContent = `${station.state || 'National'} • ${station.language || 'Standard'}`;
    playerStatusLabel.textContent = 'Connecting...';
    activeStationDirectUrl.textContent = station.stream_url;
    esp32Url.textContent = `${window.location.origin}/stream/${station.id}`;

    // Clean up previous HLS instance
    if (hls) {
      hls.destroy();
      hls = null;
    }

    // Direct HLS engine with seamless fallback
    if (window.Hls && Hls.isSupported() && station.stream_url && station.stream_url.includes('.m3u8')) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(station.stream_url);
      hls.attachMedia(audio);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        audio.play().then(onPlaySuccess).catch(onPlayError);
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          fallbackToAudioSrc(station);
        }
      });
    } else if (audio.canPlayType('application/vnd.apple.mpegurl') && station.stream_url) {
      audio.src = station.stream_url;
      audio.play().then(onPlaySuccess).catch(() => fallbackToAudioSrc(station));
    } else {
      fallbackToAudioSrc(station);
    }

    updateFavButton();
    renderStations();
  }

  function fallbackToAudioSrc(station) {
    audio.src = `/stream/${station.id}`;
    audio.play().then(onPlaySuccess).catch(onPlayError);
  }

  function onPlaySuccess() {
    isPlaying = true;
    playSvg.classList.add('hidden');
    pauseSvg.classList.remove('hidden');
    statusDot.classList.add('active');
    playerStatusLabel.textContent = 'Live Broadcast';
    heroPlayerCard.classList.add('playing');
    renderStations();
  }

  function onPlayError(err) {
    console.warn('Play error:', err);
    playerStatusLabel.textContent = 'Retrying...';
  }

  function togglePlay() {
    if (!currentStation) {
      if (currentFilteredStations.length > 0) playStation(currentFilteredStations[0]);
      return;
    }

    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      playSvg.classList.remove('hidden');
      pauseSvg.classList.add('hidden');
      statusDot.classList.remove('active');
      playerStatusLabel.textContent = 'Paused';
      heroPlayerCard.classList.remove('playing');
    } else {
      audio.play().then(onPlaySuccess);
    }
    renderStations();
  }

  function playNext() {
    if (currentFilteredStations.length === 0) return;
    let nextIdx = 0;
    if (currentStation) {
      const idx = currentFilteredStations.findIndex(s => s.id === currentStation.id);
      nextIdx = (idx + 1) % currentFilteredStations.length;
    }
    playStation(currentFilteredStations[nextIdx]);
  }

  function playPrev() {
    if (currentFilteredStations.length === 0) return;
    let prevIdx = 0;
    if (currentStation) {
      const idx = currentFilteredStations.findIndex(s => s.id === currentStation.id);
      prevIdx = (idx - 1 + currentFilteredStations.length) % currentFilteredStations.length;
    }
    playStation(currentFilteredStations[prevIdx]);
  }

  // 6. Favorites
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
    if (currentStation) {
      const isFav = favorites.has(currentStation.id);
      favBtn.classList.toggle('is-fav', isFav);
      favBtn.querySelector('svg').setAttribute('fill', isFav ? 'currentColor' : 'none');
    }
  }

  // 7. Clipboard & M3U Export
  function copyStreamUrl(station) {
    const target = station || currentStation;
    if (!target) {
      showToast('Select a station first');
      return;
    }
    const url = target.stream_url || `${window.location.origin}/stream/${target.id}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast(`Copied stream: ${target.name}`);
    });
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2600);
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
    a.download = 'akashvani_radio_playlist.m3u';
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

  copyStreamBtn.addEventListener('click', () => copyStreamUrl());

  // Volume
  volumeSlider.addEventListener('input', (e) => {
    audio.volume = e.target.value;
    audio.muted = (audio.volume === 0);
  });

  muteBtn.addEventListener('click', () => {
    audio.muted = !audio.muted;
    volumeSlider.value = audio.muted ? 0 : (audio.volume || 1);
  });

  // Search
  searchInput.addEventListener('input', () => {
    clearSearchBtn.classList.toggle('visible', searchInput.value.length > 0);
    renderStations();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.remove('visible');
    renderStations();
  });

  resetFilterBtn.addEventListener('click', () => {
    searchInput.value = '';
    stateFilter.value = '';
    langFilter.value = '';
    activeLangChip = '';
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.lang === ''));
    renderStations();
  });

  stateFilter.addEventListener('change', renderStations);
  langFilter.addEventListener('change', () => {
    activeLangChip = langFilter.value;
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.lang === activeLangChip));
    renderStations();
  });

  // Language Quick Chips
  languageChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeLangChip = chip.dataset.lang;
    langFilter.value = activeLangChip;
    renderStations();
  });

  // Nav Tabs
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      activeTab = item.dataset.tab;
      renderStations();
    });
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

  document.querySelectorAll('.copy-inline-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.copy;
      const text = type === 'm3u' ? m3uFullUrl.textContent : activeStationDirectUrl.textContent;
      navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'));
    });
  });

  // Start visualizer loop and load stations
  drawFallback();
  loadStations();
});
