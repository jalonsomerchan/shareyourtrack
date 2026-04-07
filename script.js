let map, points = [], marker;
let isPlaying = false, followCamera = true, is3D = false;
let currentIndex = 0, _lastAnimTime = 0, animationId, playbackSpeed = 50;
let rawGpx = "";

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
        dark: "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        terrain: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
        topo: "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
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
document.getElementById('gpx-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (f) => {
        rawGpx = f.target.result;
        const gpx = new gpxParser();
        gpx.parse(rawGpx);
        if (gpx.tracks[0]) processTrack(gpx.tracks[0]);
    };
    reader.readAsText(file);
});

function processTrack(track) {
    points = track.points;
    if (marker) marker.remove();
    const el = document.createElement('div');
    el.className = 'marker-container';
    el.innerHTML = `<div class="marker-emoji text-3xl drop-shadow-lg">${document.getElementById('route-icon').value}</div>`;
    marker = new maplibregl.Marker({ element: el }).setLngLat([points[0].lon, points[0].lat]).addTo(map);

    const lats = points.map(p => p.lat), lons = points.map(p => p.lon);
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
        if (elapsed > 0) document.getElementById('overlay-speed').innerText = ((dist/1000)/(elapsed/3600)).toFixed(1) + " KM/H";
    }
}

// EXPORT ENGINE (The Ultimate Radical Strategy)
// We record the main view by mirroring the map canvas to a specific composition canvas.
document.getElementById('btn-start-record').addEventListener('click', async () => {
    if (!points.length) return alert("Carga un archivo GPX primero");

    const ratio = document.getElementById('input-ratio').value;
    const title = document.getElementById('input-title').value;
    const dateStr = document.getElementById('input-date').value;
    const color = document.getElementById('route-color').value;

    document.getElementById('modal-record').classList.add('hidden');
    // 1. Config Mode
    const duration = parseInt(document.getElementById('input-duration').value) || 10;
    const showHeader = document.getElementById('check-header').checked;
    const showStats = document.getElementById('check-stats').checked;
    
    document.getElementById('modal-record').classList.add('hidden');
    document.getElementById('loader').classList.remove('hidden');
    document.getElementById('loader-text').innerText = "PREPARANDO VIDEO...";

    const resW = (ratio === '916') ? 720 : (ratio === '11' ? 720 : 1280);
    const resH = (ratio === '916') ? 1280 : (ratio === '11' ? 720 : 720);
    
    // 2. Setup Hidden Recording Map (PERFECT RESOLUTION)
    const exportDiv = document.createElement('div');
    exportDiv.style.width = resW + 'px';
    exportDiv.style.height = resH + 'px';
    exportDiv.style.position = 'fixed';
    exportDiv.style.left = '-10000px';
    exportDiv.style.top = '0';
    document.body.appendChild(exportDiv);

    const recordingMap = new maplibregl.Map({
        container: exportDiv,
        style: map.getStyle(),
        center: map.getCenter(),
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        interactive: false,
        preserveDrawingBuffer: true,
        antialias: true
    });

    await new Promise(res => recordingMap.once('load', res));
    
    // Setup Layers on the hidden map
    if (!recordingMap.getSource('route')) {
        recordingMap.addSource('route', { type: 'geojson', data: { type: 'Feature' } });
    }
    if (!recordingMap.getLayer('route-line')) {
        recordingMap.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            paint: { 'line-color': color, 'line-width': 8, 'line-opacity': 0.9 },
            layout: { 'line-cap': 'round', 'line-join': 'round' }
        });
    }

    // 3. Setup Recording Compositor
    const recordCanvas = document.createElement('canvas');
    recordCanvas.width = resW;
    recordCanvas.height = resH;
    const rctx = recordCanvas.getContext('2d');
    
    const stream = recordCanvas.captureStream(30);
    let recorder;
    let chunks = [];
    const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    let selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m));
    if (!selectedMime) return alert("Tu navegador no soporta grabación de video.");
    
    try {
        recorder = new MediaRecorder(stream, { mimeType: selectedMime, videoBitsPerSecond: 15000000 });
    } catch (e) { alert("Error: " + e.message); return; }

    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    // 4. Dynamic speed adjustment
    const totalDistTime = (new Date(points[points.length-1].time) - new Date(points[0].time)) / 1000;
    playbackSpeed = totalDistTime / duration;
    const originalSpeedVal = document.getElementById('speed-val').value;

    // 5. Frame Compositor Loop
    let recording = true;
    const emoji = document.getElementById('route-icon').value || "🚴";
    const renderLoop = () => {
        if (!recording) return;
        
        // MIRROR MAIN STATE TO RECORDING MAP
        recordingMap.jumpTo({
            center: map.getCenter(),
            zoom: map.getZoom(),
            pitch: map.getPitch()
        });
        
        const trailJson = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: points.slice(0, currentIndex + 1).map(pt => [pt.lon, pt.lat])
            }
        };
        recordingMap.getSource('route').setData(trailJson);

        // COMPOUND TO FINAL CANVAS
        const mapCanvas = recordingMap.getCanvas();
        rctx.fillStyle = '#020617';
        rctx.fillRect(0, 0, recordCanvas.width, recordCanvas.height);
        rctx.drawImage(mapCanvas, 0, 0, recordCanvas.width, recordCanvas.height);
        
        // Project Emoji using RecordingMap's coordinate system
        const pos = recordingMap.project([points[currentIndex].lon, points[currentIndex].lat]);
        rctx.font = `${Math.floor(recordCanvas.width * 0.08)}px serif`;
        rctx.textAlign = 'center';
        rctx.textBaseline = 'middle';
        rctx.fillText(emoji, pos.x, pos.y);

        drawProOverlayLegacy(rctx, recordCanvas.width, recordCanvas.height, title, dateStr, color, currentIndex, showHeader, showStats);
        requestAnimationFrame(renderLoop);
    };
    renderLoop();

    // 6. Play Animation and Track Progress
    currentIndex = 0;
    isPlaying = true;
    
    function cleanup() {
        clearInterval(checkDone);
        recording = false;
        recordingMap.remove();
        document.body.removeChild(exportDiv);
        document.getElementById('speed-val').value = originalSpeedVal;
        document.getElementById('loader').classList.add('hidden');
    }

    const checkDone = setInterval(() => {
        const percent = Math.round((currentIndex / (points.length - 1)) * 100);
        document.getElementById('loader-text').innerText = `GRABANDO: ${percent}%`;
        
        if (!isPlaying) {
            clearInterval(checkDone);
            recording = false;
            setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 500);
        }
    }, 100);

    recorder.onstop = () => {
        if (chunks.length === 0) { alert("Error: No se capturaron datos."); cleanup(); return; }
        const blob = new Blob(chunks, { type: selectedMime });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `shareyourtrack_hd_${Date.now()}.webm`;
        a.click();
        cleanup();
    };

    try { recorder.start(); play(); } catch (e) { alert("Error: " + e.message); cleanup(); }
});

function drawProOverlayLegacy(ctx, w, h, title, date, color, index, showHeader, showStats) {
    const padding = w * 0.1;

    if (showHeader) {
        const g1 = ctx.createLinearGradient(0, 0, 0, h * 0.2);
        g1.addColorStop(0, 'rgba(2,6,23,0.8)'); g1.addColorStop(1, 'transparent');
        ctx.fillStyle = g1; ctx.fillRect(0, 0, w, h * 0.2);

        ctx.textAlign = 'center'; ctx.fillStyle = 'white';
        ctx.font = `900 italic ${Math.floor(w*0.08)}px Inter`;
        ctx.fillText(title.toUpperCase(), w/2, padding + 20);
        ctx.font = `700 ${Math.floor(w*0.03)}px Inter`; ctx.fillStyle = color;
        ctx.fillText(date.toUpperCase(), w/2, padding + 55);
    }

    if (showStats) {
        const g2 = ctx.createLinearGradient(0, h * 0.8, 0, h);
        g2.addColorStop(0, 'transparent'); g2.addColorStop(1, 'rgba(2,6,23,0.8)');
        ctx.fillStyle = g2; ctx.fillRect(0, h * 0.8, w, h * 0.2);

        const dist = calculateDistance(0, index);
        const elapsed = (new Date(points[index].time) - new Date(points[0].time)) / 1000;
        const speed = elapsed > 0 ? (dist/1000)/(elapsed/3600) : 0;

        ctx.textAlign = 'left'; ctx.fillStyle = '#94a3b8'; ctx.font = `700 ${Math.floor(w*0.02)}px Inter`;
        ctx.fillText('DISTANCIA', padding, h - padding - 20);
        ctx.fillStyle = 'white'; ctx.font = `900 italic ${Math.floor(w*0.06)}px Inter`;
        ctx.fillText((dist/1000).toFixed(1) + ' KM', padding, h - padding + 15);

        ctx.textAlign = 'right'; ctx.fillStyle = '#94a3b8'; ctx.font = `700 ${Math.floor(w*0.02)}px Inter`;
        ctx.fillText('VEL. MEDIA', w - padding, h - padding - 20);
        ctx.fillStyle = 'white'; ctx.font = `900 italic ${Math.floor(w*0.06)}px Inter`;
        ctx.fillText(speed.toFixed(1) + ' KM/H', w - padding, h - padding + 15);
    }
}

// Standard Helpers
function calculateDistance(f, t) {
    let d = 0;
    for (let i = f; i < t; i++) {
        const p1 = points[i], p2 = points[i+1];
        const R = 6371e3, φ1 = p1.lat * Math.PI/180, φ2 = p2.lat * Math.PI/180, Δφ = (p2.lat-p1.lat) * Math.PI/180, Δλ = (p2.lon-p1.lon) * Math.PI/180;
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
        d += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
    return d;
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
    if (currentIndex >= points.length - 1) { pause(); }
    else animationId = requestAnimationFrame(animate);
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
