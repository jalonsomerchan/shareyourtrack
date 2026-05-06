let map, points = [], marker;
let isPlaying = false, followCamera = true, is3D = false;
let currentIndex = 0, _lastAnimTime = 0, animationId, playbackSpeed = 50;
let rawGpx = "";
let lastVideoBlob = null, lastVideoMime = null;
let loopEnabled = false;

// RADICAL CHANGE: Real-time Canvas Compositor Engine
// This bypasses html2canvas and getDisplayMedia entirely.
function initMap() {
    map = new maplibregl.Map({
        container: 'map',
        style: {
            "version": 8,
            "sources": {
                "raster-tiles": {
                    "type": "raster",
                    "tiles": ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"],
                    "tileSize": 256,
                    "attribution": "&copy; CARTO"
                }
            },
            "layers": [{
                "id": "simple-tiles",
                "type": "raster",
                "source": "raster-tiles",
                "minzoom": 0,
                "maxzoom": 22
            }]
        },
        center: [-3, 40],
        zoom: 5,
        preserveDrawingBuffer: true,
        antialias: true
    });

    map.on('load', setupMapLayers);
    map.on('style.load', setupMapLayers);

    document.getElementById('zoom-level').addEventListener('input', () => {
        if (points.length) updatePosition(currentIndex);
    });
}

function setupMapLayers() {
    if (!map.getSource('route')) {
        map.addSource('route', { type: 'geojson', data: { type: 'Feature' } });
    }
    if (!map.getLayer('route-line')) {
        map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            paint: { 'line-color': document.getElementById('route-color').value, 'line-width': 6, 'line-opacity': 0.8 },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
    }
    if (points.length > 0) updatePosition(currentIndex);
}

// Map Switching
document.getElementById('map-selector').addEventListener('change', (e) => {
    const urls = {
        dark:     "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        light:    "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        satellite:"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        terrain:  "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
        topo:     "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        cyclosm:  "https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
        streets:  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
        esritopo: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
    };
    const style = map.getStyle();
    style.sources['raster-tiles'].tiles = [urls[e.target.value]];
    map.setStyle(style);
});

// Customization
document.getElementById('route-color').addEventListener('input', (e) => {
    if (map.getLayer('route-line')) map.setPaintProperty('route-line', 'line-color', e.target.value);
});
document.getElementById('route-icon').addEventListener('input', updateMarkerIcon);
document.getElementById('toggle-3d').addEventListener('click', (e) => {
    is3D = !is3D;
    e.currentTarget.classList.toggle('bg-blue-600', is3D);
    map.easeTo({ pitch: is3D ? 60 : 0, duration: 1000 });
});
document.getElementById('toggle-follow').addEventListener('click', (e) => {
    followCamera = !followCamera;
    e.currentTarget.classList.toggle('bg-blue-600', followCamera);
});

// GPX Handling
function handleGpxFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (f) => {
        rawGpx = f.target.result;

        try {
            const gpx = new gpxParser();
            gpx.parse(rawGpx);

            const track = gpx.tracks?.[0];

            if (!track || !Array.isArray(track.points) || track.points.length < 2) {
                alert('El archivo GPX no contiene una ruta válida.');
                return;
            }

            processTrack(track);
            document.getElementById('intro-screen').classList.add('hidden');
        } catch (err) {
            console.error(err);
            alert('No se pudo leer el archivo GPX.');
        }
    };

    reader.readAsText(file);
}

document.getElementById('gpx-input').addEventListener('change', (e) => handleGpxFile(e.target.files[0]));
document.getElementById('gpx-input-intro').addEventListener('change', (e) => handleGpxFile(e.target.files[0]));

// Drag & drop en pantalla de inicio
const introScreen = document.getElementById('intro-screen');
const introDropLabel = document.getElementById('intro-drop-label');
introScreen.addEventListener('dragover', (e) => {
    e.preventDefault();
    introDropLabel.classList.add('border-blue-400', '!bg-blue-500');
});
introScreen.addEventListener('dragleave', (e) => {
    if (!introScreen.contains(e.relatedTarget)) {
        introDropLabel.classList.remove('border-blue-400', '!bg-blue-500');
    }
});
introScreen.addEventListener('drop', (e) => {
    e.preventDefault();
    introDropLabel.classList.remove('border-blue-400', '!bg-blue-500');
    const file = e.dataTransfer.files[0];
    if (file) handleGpxFile(file);
});

function processTrack(track) {
    if (!track || !Array.isArray(track.points) || track.points.length < 2) {
        alert('Ruta inválida.');
        return;
    }

    points = track.points;

    if (!points[0] || points[0].lat == null || points[0].lon == null) {
        alert('El GPX no contiene coordenadas válidas.');
        return;
    }

    if (marker) marker.remove();
    const el = document.createElement('div');
    el.className = 'marker-container';
    el.innerHTML = `<div class="marker-emoji text-3xl drop-shadow-lg">${document.getElementById('route-icon').value}</div>`;
    marker = new maplibregl.Marker({ element: el }).setLngLat([points[0].lon, points[0].lat]).addTo(map);

    const lats = points.map(p => p.lat).filter(v => v != null);
    const lons = points.map(p => p.lon).filter(v => v != null);

    if (!lats.length || !lons.length) {
        alert('Coordenadas inválidas en la ruta.');
        return;
    }

    map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 50 });

    document.getElementById('route-stats').classList.remove('hidden');
    document.getElementById('btn-share').classList.remove('hidden');
    document.getElementById('stat-dist').innerText = (track.distance.total / 1000).toFixed(1) + " KM";
    document.getElementById('stat-ele').innerText = Math.round(track.elevation.pos || 0) + " M Δ";
    document.getElementById('timeline').max = points.length - 1;

    document.getElementById('input-date').value = formatDate(points[0].time);
    document.getElementById('input-title').value = "MI RUTA";
    currentIndex = 0;
    updatePosition(0);
}

function updateMarkerIcon() {
    if (marker) marker.getElement().innerHTML = `<div class="marker-emoji text-3xl drop-shadow-lg">${document.getElementById('route-icon').value}</div>`;
}

function updatePosition(index) {
    if (!points[index]) return;
    const p = points[index];
    marker.setLngLat([p.lon, p.lat]);
    map.getSource('route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: points.slice(0, index + 1).map(pt => [pt.lon, pt.lat]) } });

    if (followCamera) {
        map.jumpTo({ center: [p.lon, p.lat], zoom: parseFloat(document.getElementById('zoom-level').value) });
    }

    document.getElementById('timeline').value = index;
    const elapsed = (new Date(p.time) - new Date(points[0].time)) / 1000;
    document.getElementById('time-curr').innerText = formatTime(elapsed);

    // Update live overlay if visible
    if (!document.getElementById('video-overlay').classList.contains('hidden')) {
        const dist = calculateDistance(0, index);
        document.getElementById('overlay-dist').innerText = (dist / 1000).toFixed(1) + " KM";
        if (elapsed > 0) document.getElementById('overlay-speed').innerText = ((dist / 1000) / (elapsed / 3600)).toFixed(1) + " KM/H";
    }
}

// Pre-carga de tiles: recorre toda la ruta rápidamente para forzar la carga del mapa
function preloadMapTiles(zoomLevel) {
    return new Promise((resolve) => {
        document.getElementById('loader-text').innerText = "CARGANDO MAPA... 0%";
        const step = Math.max(1, Math.floor(points.length / 200));
        let i = 0;
        const visit = () => {
            if (i >= points.length) {
                map.jumpTo({ center: [points[0].lon, points[0].lat], zoom: zoomLevel - 1.5 });
                if (map.areTilesLoaded()) resolve();
                else map.once('idle', resolve);
                return;
            }
            const pct = Math.round(i / points.length * 100);
            document.getElementById('loader-text').innerText = `CARGANDO MAPA... ${pct}%`;
            map.jumpTo({ center: [points[i].lon, points[i].lat], zoom: zoomLevel });
            i += step;
            requestAnimationFrame(visit);
        };
        visit();
    });
}

function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

// EXPORT ENGINE
document.getElementById('btn-start-record').addEventListener('click', async () => {
    if (!points.length) return alert("Carga un archivo GPX primero");

    const ratio        = document.getElementById('input-ratio').value;
    const title        = document.getElementById('input-title').value;
    const dateStr      = document.getElementById('input-date').value;
    const color        = document.getElementById('route-color').value;
    const duration     = parseInt(document.getElementById('input-duration').value) || 30;
    const showHeader   = document.getElementById('check-header').checked;
    const showStats    = document.getElementById('check-stats').checked;
    const showElevation= document.getElementById('check-elevation').checked;
    const showProgress = document.getElementById('check-progress').checked;
    const lineWidth    = parseInt(document.getElementById('input-linewidth').value) || 6;
    const qualityScale = (parseInt(document.getElementById('input-quality').value) || 720) / 720;
    const zoomLevel    = parseFloat(document.getElementById('zoom-level').value);

    document.getElementById('modal-record').classList.add('hidden');
    document.getElementById('loader').classList.remove('hidden');
    document.getElementById('video-overlay').classList.add('hidden');
    if (map.getLayer('route-line')) map.setPaintProperty('route-line', 'line-width', lineWidth);

    // 1. PRE-RENDER: visitar todos los viewports para cargar tiles
    await preloadMapTiles(zoomLevel);
    document.getElementById('loader-text').innerText = "PREPARANDO GRABACIÓN...";
    await new Promise(r => setTimeout(r, 500));

    // 2. CANVAS + RECORDER
    const rW = Math.round((ratio === '916' ? 720 : ratio === '11' ? 720 : 1280) * qualityScale);
    const rH = Math.round((ratio === '916' ? 1280 : ratio === '11' ? 720 : 720) * qualityScale);
    const recordCanvas = document.createElement('canvas');
    recordCanvas.width = rW; recordCanvas.height = rH;
    const rctx = recordCanvas.getContext('2d');

    const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m));
    if (!selectedMime) { document.getElementById('loader').classList.add('hidden'); return alert("Tu navegador no soporta grabación de video."); }

    let recorder, chunks = [];
    try { recorder = new MediaRecorder(recordCanvas.captureStream(30), { mimeType: selectedMime, videoBitsPerSecond: 10000000 }); }
    catch (e) { document.getElementById('loader').classList.add('hidden'); return alert("Error: " + e.message); }
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    // 3. VELOCIDAD para la fase principal
    const totalDistTime = (new Date(points[points.length - 1].time) - new Date(points[0].time)) / 1000;
    const mainSpeed = totalDistTime / duration;
    const originalSpeedVal = document.getElementById('speed-val').value;
    const originalFollowCamera = followCamera;
    followCamera = true;

    // 4. FASES: intro (3s) → main → outro (5s)
    const INTRO_MS = 3000, OUTRO_MS = 5000;
    let recordPhase = 'intro', phaseT0 = null, outroParams = null, recording = true;
    const emoji = document.getElementById('route-icon').value || "🚴";

    // Posición inicial para intro
    currentIndex = 0;
    map.getSource('route').setData({ type: 'FeatureCollection', features: [] });
    map.jumpTo({ center: [points[0].lon, points[0].lat], zoom: zoomLevel - 1.5 });

    // 5. RENDER LOOP
    const renderLoop = (ts) => {
        if (!recording) return;
        if (phaseT0 === null) phaseT0 = ts;
        const pe = ts - phaseT0; // ms transcurridos en la fase actual

        // — Transiciones de fase —
        if (recordPhase === 'intro' && pe >= INTRO_MS) {
            recordPhase = 'main'; phaseT0 = null;
            currentIndex = 0; playbackSpeed = mainSpeed; _lastAnimTime = 0; isPlaying = true;
            document.getElementById('play-icon').className = 'fas fa-pause';
            animationId = requestAnimationFrame(animate);

        } else if (recordPhase === 'main' && !isPlaying && currentIndex >= points.length - 1) {
            recordPhase = 'outro'; phaseT0 = null;
            // Dibujar ruta completa
            map.getSource('route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: points.map(p => [p.lon, p.lat]) } });
            // Calcular cámara para encuadrar toda la ruta
            const lats = points.map(p => p.lat), lons = points.map(p => p.lon);
            const cam = map.cameraForBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60 });
            outroParams = { sZ: map.getZoom(), eZ: cam.zoom, sLng: map.getCenter().lng, sLat: map.getCenter().lat, eLng: cam.center.lng, eLat: cam.center.lat };

        } else if (recordPhase === 'outro') {
            if (pe >= OUTRO_MS) {
                recording = false;
                setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 200);
                return;
            }
            const t = easeInOut(pe / OUTRO_MS);
            map.jumpTo({ center: [outroParams.sLng + (outroParams.eLng - outroParams.sLng) * t, outroParams.sLat + (outroParams.eLat - outroParams.sLat) * t], zoom: outroParams.sZ + (outroParams.eZ - outroParams.sZ) * t });
        }

        // — Cámara del intro: zoom-in suave —
        if (recordPhase === 'intro') {
            const t = easeInOut(Math.min(pe / INTRO_MS, 1));
            map.jumpTo({ center: [points[0].lon, points[0].lat], zoom: (zoomLevel - 1.5) + 1.5 * t });
        }

        // — Composición de frame —
        const mapCanvas = map.getCanvas();
        const mW = mapCanvas.width, mH = mapCanvas.height;
        const tA = rW / rH, mA = mW / mH;
        let sx, sy, sw, sh;
        if (mA > tA) { sh = mH; sw = Math.round(mH * tA); sx = Math.round((mW - sw) / 2); sy = 0; }
        else         { sw = mW; sh = Math.round(mW / tA); sx = 0; sy = Math.round((mH - sh) / 2); }

        rctx.fillStyle = '#020617';
        rctx.fillRect(0, 0, rW, rH);
        rctx.drawImage(mapCanvas, sx, sy, sw, sh, 0, 0, rW, rH);

        // — Marcador —
        const dpr = mW / mapCanvas.clientWidth;
        const idx = recordPhase === 'outro' ? points.length - 1 : currentIndex;
        const pos = map.project([points[idx].lon, points[idx].lat]);
        const mx = (pos.x * dpr - sx) * (rW / sw), my = (pos.y * dpr - sy) * (rH / sh);
        rctx.font = `${Math.floor(rW * 0.08)}px serif`;
        rctx.textAlign = 'center'; rctx.textBaseline = 'middle';
        rctx.fillText(emoji, mx, my);

        // — Overlay con fade in/out —
        const alpha = recordPhase === 'intro' ? easeInOut(Math.min(pe / INTRO_MS, 1))
                    : recordPhase === 'outro' ? 1 - easeInOut(pe / OUTRO_MS) : 1;
        rctx.globalAlpha = alpha;
        drawProOverlayLegacy(rctx, rW, rH, title, dateStr, color, idx, showHeader, recordPhase !== 'intro' && showStats, showElevation, showProgress);
        rctx.globalAlpha = 1;

        requestAnimationFrame(renderLoop);
    };

    // 6. PROGRESO en loader
    const checkDone = setInterval(() => {
        if (!recording) { clearInterval(checkDone); return; }
        const msgs = { intro: 'INTRO... 3s', main: `GRABANDO: ${Math.round((currentIndex / (points.length - 1)) * 100)}%`, outro: 'FINAL... 5s' };
        document.getElementById('loader-text').innerText = msgs[recordPhase] || 'GRABANDO...';
    }, 200);

    function cleanup() {
        clearInterval(checkDone);
        followCamera = originalFollowCamera;
        document.getElementById('speed-val').value = originalSpeedVal;
        playbackSpeed = parseFloat(originalSpeedVal);
        document.getElementById('loader').classList.add('hidden');
    }

    recorder.onstop = () => {
        if (chunks.length === 0) { alert("Error: No se capturaron datos. Intenta otro formato."); cleanup(); return; }
        lastVideoBlob = new Blob(chunks, { type: selectedMime });
        lastVideoMime = selectedMime;
        cleanup();
        document.getElementById('modal-video-ready').classList.remove('hidden');
    };

    try { recorder.start(); requestAnimationFrame(renderLoop); }
    catch (e) { alert("Error al iniciar grabación: " + e.message); cleanup(); }
});

function drawProOverlayLegacy(ctx, w, h, title, date, color, index, showHeader, showStats, showElevation, showProgressBar) {
    const padding = w * 0.1;

    if (showHeader) {
        const g1 = ctx.createLinearGradient(0, 0, 0, h * 0.22);
        g1.addColorStop(0, 'rgba(2,6,23,0.85)'); g1.addColorStop(1, 'transparent');
        ctx.fillStyle = g1; ctx.fillRect(0, 0, w, h * 0.22);

        ctx.textAlign = 'center'; ctx.fillStyle = 'white';
        ctx.font = `900 italic ${Math.floor(w * 0.08)}px Inter`;
        ctx.fillText(title.toUpperCase(), w / 2, padding + 20);
        ctx.font = `700 ${Math.floor(w * 0.03)}px Inter`; ctx.fillStyle = color;
        ctx.fillText(date.toUpperCase(), w / 2, padding + 55);
    }

    if (showStats) {
        const g2 = ctx.createLinearGradient(0, h * 0.75, 0, h);
        g2.addColorStop(0, 'transparent'); g2.addColorStop(1, 'rgba(2,6,23,0.9)');
        ctx.fillStyle = g2; ctx.fillRect(0, h * 0.75, w, h * 0.25);

        const dist = calculateDistance(0, index);
        const elapsed = (new Date(points[index].time) - new Date(points[0].time)) / 1000;
        const speed = elapsed > 0 ? (dist / 1000) / (elapsed / 3600) : 0;
        const labelSize = Math.floor(w * 0.022);
        const valueSize = Math.floor(w * 0.06);
        const labelY = h - padding - 22;
        const valueY = h - padding + 16;

        if (showElevation) {
            // Three stats: dist | ele | speed
            const eleGain = calculateElevationGain(0, index);
            ctx.textAlign = 'left'; ctx.fillStyle = '#94a3b8'; ctx.font = `700 ${labelSize}px Inter`;
            ctx.fillText('DISTANCIA', padding, labelY);
            ctx.fillStyle = 'white'; ctx.font = `900 italic ${valueSize}px Inter`;
            ctx.fillText((dist / 1000).toFixed(1) + ' km', padding, valueY);

            ctx.textAlign = 'center'; ctx.fillStyle = '#34d399'; ctx.font = `700 ${labelSize}px Inter`;
            ctx.fillText('DESNIVEL', w / 2, labelY);
            ctx.fillStyle = 'white'; ctx.font = `900 italic ${valueSize}px Inter`;
            ctx.fillText('+' + Math.round(eleGain) + ' m', w / 2, valueY);

            ctx.textAlign = 'right'; ctx.fillStyle = '#94a3b8'; ctx.font = `700 ${labelSize}px Inter`;
            ctx.fillText('VEL. MEDIA', w - padding, labelY);
            ctx.fillStyle = 'white'; ctx.font = `900 italic ${valueSize}px Inter`;
            ctx.fillText(speed.toFixed(1) + ' km/h', w - padding, valueY);
        } else {
            // Two stats: dist | speed
            ctx.textAlign = 'left'; ctx.fillStyle = '#94a3b8'; ctx.font = `700 ${labelSize}px Inter`;
            ctx.fillText('DISTANCIA', padding, labelY);
            ctx.fillStyle = 'white'; ctx.font = `900 italic ${valueSize}px Inter`;
            ctx.fillText((dist / 1000).toFixed(1) + ' km', padding, valueY);

            ctx.textAlign = 'right'; ctx.fillStyle = '#94a3b8'; ctx.font = `700 ${labelSize}px Inter`;
            ctx.fillText('VEL. MEDIA', w - padding, labelY);
            ctx.fillStyle = 'white'; ctx.font = `900 italic ${valueSize}px Inter`;
            ctx.fillText(speed.toFixed(1) + ' km/h', w - padding, valueY);
        }
    }

    if (showProgressBar) {
        const progress = points.length > 1 ? index / (points.length - 1) : 0;
        const barH = Math.max(3, Math.round(h * 0.005));
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(0, h - barH, w, barH);
        ctx.fillStyle = color;
        ctx.fillRect(0, h - barH, w * progress, barH);
    }
}

// Video share/download modal
function downloadVideo() {
    if (!lastVideoBlob) return;
    const ext = lastVideoMime.includes('mp4') ? 'mp4' : 'webm';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(lastVideoBlob);
    a.download = `shareyourtrack_${Date.now()}.${ext}`;
    a.click();
    document.getElementById('modal-video-ready').classList.add('hidden');
}

document.getElementById('btn-download-video').addEventListener('click', downloadVideo);

document.getElementById('btn-share-video').addEventListener('click', async () => {
    if (!lastVideoBlob) return;
    const ext = lastVideoMime.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([lastVideoBlob], `shareyourtrack_${Date.now()}.${ext}`, { type: lastVideoMime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: document.getElementById('input-title').value || 'Mi Ruta' });
            document.getElementById('modal-video-ready').classList.add('hidden');
        } catch (e) {
            if (e.name !== 'AbortError') downloadVideo();
        }
    } else {
        downloadVideo();
    }
});

// Standard Helpers
function calculateDistance(f, t) {
    let d = 0;
    for (let i = f; i < t; i++) {
        const p1 = points[i], p2 = points[i + 1];
        const R = 6371e3, φ1 = p1.lat * Math.PI / 180, φ2 = p2.lat * Math.PI / 180, Δφ = (p2.lat - p1.lat) * Math.PI / 180, Δλ = (p2.lon - p1.lon) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        d += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    return d;
}
function calculateElevationGain(f, t) {
    let gain = 0;
    for (let i = f; i < t; i++) {
        if (points[i + 1] && points[i].ele != null && points[i + 1].ele != null) {
            const diff = points[i + 1].ele - points[i].ele;
            if (diff > 0) gain += diff;
        }
    }
    return gain;
}
function formatTime(s) { const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`; }
function formatDate(dt) { const d = new Date(dt), m = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"]; return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`; }
function closeModal() { document.getElementById('modal-record').classList.add('hidden'); }
window.closeModal = closeModal;

function animate(timestamp) {
    if (!isPlaying) return;
    if (!_lastAnimTime) _lastAnimTime = timestamp;
    const delta = (timestamp - _lastAnimTime) * playbackSpeed;
    _lastAnimTime = timestamp;
    let next = currentIndex;
    const target = new Date(points[currentIndex].time).getTime() + delta;
    while (next < points.length - 1 && new Date(points[next].time).getTime() < target) next++;
    if (next !== currentIndex) { currentIndex = next; updatePosition(currentIndex); }
    if (currentIndex >= points.length - 1) {
        if (loopEnabled) { currentIndex = 0; _lastAnimTime = 0; updatePosition(0); animationId = requestAnimationFrame(animate); }
        else pause();
    } else animationId = requestAnimationFrame(animate);
}
function play() {
    if (!isPlaying) {
        playbackSpeed = parseFloat(document.getElementById('speed-val').value);
    }
    isPlaying = true;
    _lastAnimTime = 0;
    document.getElementById('play-icon').className = 'fas fa-pause';
    animationId = requestAnimationFrame(animate);
}
function pause() { isPlaying = false; document.getElementById('play-icon').className = 'fas fa-play'; cancelAnimationFrame(animationId); }
document.getElementById('btn-play').addEventListener('click', () => isPlaying ? pause() : play());
document.getElementById('speed-val').addEventListener('change', (e) => playbackSpeed = parseFloat(e.target.value));
document.getElementById('timeline').addEventListener('input', (e) => { pause(); currentIndex = parseInt(e.target.value); updatePosition(currentIndex); });
document.getElementById('btn-record-setup').addEventListener('click', () => { if (!points.length) return alert("Carga un GPX primero"); document.getElementById('modal-record').classList.remove('hidden'); });
document.getElementById('btn-restart').addEventListener('click', () => { pause(); currentIndex = 0; updatePosition(0); });
document.getElementById('btn-loop').addEventListener('click', (e) => {
    loopEnabled = !loopEnabled;
    e.currentTarget.classList.toggle('text-blue-400', loopEnabled);
    e.currentTarget.classList.toggle('bg-blue-500/20', loopEnabled);
});

document.getElementById('btn-share').addEventListener('click', async () => {
    const l = document.getElementById('loader'); l.classList.remove('hidden');
    try {
        const b = new Blob([rawGpx], { type: 'application/gpx+xml' });
        const f = new FormData(); f.append('file', b, 'ruta.gpx');
        const r = await fetch('https://file.io', { method: 'POST', body: f });
        const d = await r.json();
        if (navigator.share) navigator.share({ title: 'Mi Ruta', url: d.link });
        else { const t = document.createElement('textarea'); t.value = d.link; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); alert("Copiado"); }
    } catch (e) { alert("Error"); }
    l.classList.add('hidden');
});

window.addEventListener('DOMContentLoaded', initMap);
