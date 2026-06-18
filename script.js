let map, points = [], marker;
let isPlaying = false, followCamera = true, is3D = true;
let currentIndex = 0, animationId;
let rawGpx = "";
let lastVideoBlob = null, lastVideoMime = null;
let lastVideoUrl = null;
let loopEnabled = false;
let customTexts = [];
let selectedTextId = null;
let previewMode = false;
let currentMapStyle = 'satellite';
let pendingStylePromise = Promise.resolve();
let previewProgress = 0;
let previewLastFrame = 0;
let routeCoordinates = [];
let routeDistances = [];
let totalRouteDistance = 0;
let routePrefixCoordinates = [];
let routePrefixIndex = -1;
let terrainExaggeration = 1.5;
let cameraMode = 'chase';
let motionMode = 'distance';
let smoothedBearing = null;
let previewFrameWidth = 0;
let showKmFlags = false;
let showTimeFlags = false;
let kmFlagStep = 1;
let timeFlagStep = 10;
let allRouteFlagFeatures = [];

const mapTileUrls = {
    dark:     "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
    light:    "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
    satellite:"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    terrain:  "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
    topo:     "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    cyclosm:  "https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
    streets:  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    esritopo: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
};
const DEM_TILEJSON_URL = 'https://tiles.mapterhorn.com/tilejson.json';

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
                    "tiles": ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
                    "tileSize": 256,
                    "attribution": "&copy; Esri"
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
        maxPitch: 85,
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
    setupTerrainLayers();

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
    setupFlagLayers();
    if (points.length > 0) updatePosition(currentIndex);
    applyTerrainMode(false);
}

function setupFlagLayers() {
    if (!map.getSource('route-flags')) {
        map.addSource('route-flags', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    ensureFlagImages();
    if (!map.getLayer('route-flag-icons')) {
        map.addLayer({
            id: 'route-flag-icons',
            type: 'symbol',
            source: 'route-flags',
            layout: {
                'icon-image': ['case', ['==', ['get', 'kind'], 'km'], 'flag-km', 'flag-time'],
                'icon-size': 0.9,
                'icon-anchor': 'bottom',
                'icon-allow-overlap': true
            }
        });
    }
    if (!map.getLayer('route-flag-labels')) {
        map.addLayer({
            id: 'route-flag-labels',
            type: 'symbol',
            source: 'route-flags',
            layout: {
                'text-field': ['get', 'label'],
                'text-size': 12,
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-offset': [0, -3.1],
                'text-anchor': 'bottom',
                'text-allow-overlap': true
            },
            paint: {
                'text-color': ['case', ['==', ['get', 'kind'], 'km'], '#fef9c3', '#e0f2fe'],
                'text-halo-color': '#020617',
                'text-halo-width': 2
            }
        });
    }
    updateVisibleRouteFlags();
}

function ensureFlagImages() {
    if (!map.hasImage('flag-km')) map.addImage('flag-km', createFlagImage('#facc15'));
    if (!map.hasImage('flag-time')) map.addImage('flag-time', createFlagImage('#38bdf8'));
}

function createFlagImage(color) {
    const canvas = document.createElement('canvas');
    canvas.width = 56;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(14, 58);
    ctx.lineTo(14, 8);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(16, 9);
    ctx.lineTo(48, 16);
    ctx.lineTo(16, 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(14, 58, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function setupTerrainLayers() {
    if (!map.getSource('terrainSource')) {
        map.addSource('terrainSource', {
            type: 'raster-dem',
            url: DEM_TILEJSON_URL
        });
    }

    if (!map.getSource('hillshadeSource')) {
        map.addSource('hillshadeSource', {
            type: 'raster-dem',
            url: DEM_TILEJSON_URL
        });
    }

    if (!map.getLayer('terrain-hillshade')) {
        const beforeLayer = map.getLayer('route-line') ? 'route-line' : undefined;
        map.addLayer({
            id: 'terrain-hillshade',
            type: 'hillshade',
            source: 'hillshadeSource',
            layout: { visibility: is3D ? 'visible' : 'none' },
            paint: {
                'hillshade-exaggeration': 0.45,
                'hillshade-shadow-color': '#0f172a',
                'hillshade-highlight-color': '#ffffff',
                'hillshade-accent-color': '#64748b'
            }
        }, beforeLayer);
    }
}

function applyTerrainMode(animateCamera = true) {
    if (!map || !map.getSource('terrainSource')) return;
    terrainExaggeration = parseFloat(document.getElementById('terrain-exaggeration')?.value) || terrainExaggeration;

    try {
        map.setTerrain(is3D ? { source: 'terrainSource', exaggeration: terrainExaggeration } : null);
        if (map.getLayer('terrain-hillshade')) {
            map.setLayoutProperty('terrain-hillshade', 'visibility', is3D ? 'visible' : 'none');
        }
        if (map.setMaxPitch) map.setMaxPitch(85);
        const camera = { pitch: is3D ? (cameraMode === 'chase' ? 56 : 72) : 0, duration: animateCamera ? 800 : 0 };
        if (animateCamera) map.easeTo(camera);
        else map.jumpTo({ pitch: camera.pitch });
    } catch (err) {
        console.warn('No se pudo activar terreno 3D', err);
    }
}

function updateTerrainExaggerationLabel() {
    const label = document.getElementById('terrain-exaggeration-label');
    if (label) label.innerText = `${terrainExaggeration.toFixed(2).replace(/\.00$/, '').replace(/0$/, '')}×`;
}

function updateCameraModeUi() {
    const isChase = cameraMode === 'chase';
    document.getElementById('camera-mode').value = cameraMode;
    document.getElementById('toggle-chase').classList.toggle('bg-blue-600', isChase);
    document.getElementById('toggle-chase').classList.toggle('hover:bg-white/10', !isChase);
    smoothedBearing = null;
    if (isChase && !followCamera) {
        followCamera = true;
        document.getElementById('toggle-follow').classList.add('bg-blue-600');
    }
    if (points.length) setPreviewProgress(previewProgress);
}

// Map Switching
function setMapStyle(styleId) {
    if (!map || !mapTileUrls[styleId]) return;
    if (currentMapStyle === styleId) return pendingStylePromise;
    const style = map.getStyle();
    style.sources['raster-tiles'].tiles = [mapTileUrls[styleId]];
    pendingStylePromise = new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            resolve();
        };
        map.once('style.load', finish);
        setTimeout(finish, 2500);
    });
    currentMapStyle = styleId;
    map.setStyle(style);
    return pendingStylePromise;
}

document.getElementById('map-selector').addEventListener('change', (e) => {
    document.getElementById('wizard-map-selector').value = e.target.value;
    setMapStyle(e.target.value);
});

// Customization
document.getElementById('route-color').addEventListener('input', (e) => {
    if (map.getLayer('route-line')) map.setPaintProperty('route-line', 'line-color', e.target.value);
});
document.getElementById('route-icon').addEventListener('input', updateMarkerIcon);
document.getElementById('toggle-3d').addEventListener('click', (e) => {
    is3D = !is3D;
    e.currentTarget.classList.toggle('bg-blue-600', is3D);
    document.getElementById('input-view-mode').value = is3D ? '3d' : '2d';
    setupTerrainLayers();
    applyTerrainMode();
});
document.getElementById('toggle-follow').addEventListener('click', (e) => {
    followCamera = !followCamera;
    e.currentTarget.classList.toggle('bg-blue-600', followCamera);
});
document.getElementById('toggle-chase').addEventListener('click', () => {
    cameraMode = cameraMode === 'chase' ? 'center' : 'chase';
    updateCameraModeUi();
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
            openWizard();
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
    routeCoordinates = points.map(pt => [pt.lon, pt.lat]);
    buildRouteDistances();
    routePrefixCoordinates = [];
    routePrefixIndex = -1;

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
    document.getElementById('timeline').max = 1000;

    document.getElementById('input-date').value = formatDate(points[0].time);
    document.getElementById('input-title').value = "MI RUTA";
    syncWizardFromToolbar();
    setPreviewProgress(0);
    updateExportFrameGuide();
}

function updateMarkerIcon() {
    if (marker) marker.getElement().innerHTML = `<div class="marker-emoji text-3xl drop-shadow-lg">${document.getElementById('route-icon').value}</div>`;
}

function syncWizardFromToolbar() {
    document.getElementById('wizard-map-selector').value = document.getElementById('map-selector').value;
    document.getElementById('wizard-route-icon').value = document.getElementById('route-icon').value;
    document.getElementById('wizard-route-color').value = document.getElementById('route-color').value;
    document.getElementById('input-view-mode').value = is3D ? '3d' : '2d';
    document.getElementById('camera-mode').value = cameraMode;
    document.getElementById('motion-mode').value = motionMode;
    document.getElementById('check-km-flags').checked = showKmFlags;
    document.getElementById('check-time-flags').checked = showTimeFlags;
    document.getElementById('km-flag-step').value = kmFlagStep;
    document.getElementById('time-flag-step').value = timeFlagStep;
    document.getElementById('terrain-exaggeration').value = terrainExaggeration;
    updateTerrainExaggerationLabel();
}

function openWizard() {
    syncWizardFromToolbar();
    document.getElementById('modal-record').classList.remove('hidden');
}

function applyWizardSettings() {
    const mapStyle = document.getElementById('wizard-map-selector').value;
    const icon = document.getElementById('wizard-route-icon').value || "🚴";
    const color = document.getElementById('wizard-route-color').value;
    const wants3D = document.getElementById('input-view-mode').value === '3d';
    const lineWidth = parseInt(document.getElementById('input-linewidth').value) || 6;
    cameraMode = document.getElementById('camera-mode').value;
    motionMode = document.getElementById('motion-mode').value;
    showKmFlags = document.getElementById('check-km-flags').checked;
    showTimeFlags = document.getElementById('check-time-flags').checked;
    kmFlagStep = parseFloat(document.getElementById('km-flag-step').value) || 1;
    timeFlagStep = parseFloat(document.getElementById('time-flag-step').value) || 10;
    updateRouteFlags();
    updateCameraModeUi();
    terrainExaggeration = parseFloat(document.getElementById('terrain-exaggeration').value) || 1.5;
    updateTerrainExaggerationLabel();

    document.getElementById('map-selector').value = mapStyle;
    document.getElementById('route-icon').value = icon;
    document.getElementById('route-color').value = color;
    const styleReady = setMapStyle(mapStyle) || Promise.resolve();
    updateMarkerIcon();

    is3D = wants3D;
    document.getElementById('toggle-3d').classList.toggle('bg-blue-600', is3D);
    setupTerrainLayers();
    applyTerrainMode();

    if (map.getLayer('route-line')) {
        map.setPaintProperty('route-line', 'line-color', color);
        map.setPaintProperty('route-line', 'line-width', lineWidth);
    }

    updatePreviewOverlay();
    return styleReady;
}

function showPreview() {
    previewMode = true;
    document.body.classList.add('preview-editing');
    document.getElementById('modal-record').classList.add('hidden');
    document.getElementById('video-overlay').classList.remove('hidden');
    document.getElementById('export-frame-guide').classList.remove('hidden');
    document.getElementById('btn-config').classList.remove('hidden');
    document.getElementById('text-toolbar').classList.remove('hidden');
    updateExportFrameGuide();
    setPreviewProgress(previewProgress);
    updatePreviewOverlay();
}

function updatePreviewOverlay() {
    const title = document.getElementById('input-title').value || 'MI RUTA';
    const dateStr = document.getElementById('input-date').value || '';
    const color = document.getElementById('route-color').value;
    const showHeader = document.getElementById('check-header').checked;
    const showStats = document.getElementById('check-stats').checked;

    document.getElementById('overlay-title').innerText = title.toUpperCase();
    document.getElementById('overlay-date').innerText = dateStr.toUpperCase();
    document.getElementById('overlay-date').style.color = color;
    document.getElementById('overlay-title').parentElement.classList.toggle('hidden', !showHeader);
    document.getElementById('overlay-dist').closest('.flex.justify-between').classList.toggle('hidden', !showStats);

    if (points.length) setPreviewProgress(previewProgress);
    renderCustomTexts();
}

function addCustomText() {
    const text = {
        id: Date.now().toString(36),
        content: 'Tu texto',
        x: 50,
        y: 50,
        size: 42,
        color: '#ffffff',
        font: 'Inter'
    };
    customTexts.push(text);
    selectedTextId = text.id;
    document.getElementById('text-controls').classList.remove('hidden');
    renderCustomTexts();
    syncTextControls();
}

function getSelectedText() {
    return customTexts.find(t => t.id === selectedTextId) || null;
}

function renderCustomTexts() {
    const layer = document.getElementById('custom-text-layer');
    layer.innerHTML = '';
    customTexts.forEach(text => {
        const el = document.createElement('div');
        el.className = `custom-text-overlay ${text.id === selectedTextId ? 'selected' : ''}`;
        el.dataset.id = text.id;
        el.textContent = text.content;
        el.style.left = `${text.x}%`;
        el.style.top = `${text.y}%`;
        el.style.fontSize = `${text.size}px`;
        el.style.color = text.color;
        el.style.fontFamily = text.font;
        el.addEventListener('pointerdown', startTextDrag);
        layer.appendChild(el);
    });
}

function startTextDrag(e) {
    if (!previewMode) return;
    e.preventDefault();
    const id = e.currentTarget.dataset.id;
    selectedTextId = id;
    syncTextControls();
    renderCustomTexts();

    const text = getSelectedText();
    const layer = document.getElementById('custom-text-layer');
    const rect = layer.getBoundingClientRect();
    const move = (ev) => {
        text.x = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
        text.y = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100));
        renderCustomTexts();
    };
    const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
}

function syncTextControls() {
    const text = getSelectedText();
    document.getElementById('text-controls').classList.toggle('hidden', !text);
    if (!text) return;
    document.getElementById('text-content').value = text.content;
    document.getElementById('text-size').value = text.size;
    document.getElementById('text-color').value = text.color;
    document.getElementById('text-font').value = text.font;
}

function updateSelectedText(patch) {
    const text = getSelectedText();
    if (!text) return;
    Object.assign(text, patch);
    renderCustomTexts();
}

function getExportSize() {
    const ratio = document.getElementById('input-ratio').value;
    const qualityScale = (parseInt(document.getElementById('input-quality').value) || 720) / 720;
    const base = ratio === '916'
        ? { w: 720, h: 1280, label: '9:16' }
        : ratio === '11'
            ? { w: 720, h: 720, label: '1:1' }
            : { w: 1280, h: 720, label: '16:9' };
    return {
        w: Math.round(base.w * qualityScale),
        h: Math.round(base.h * qualityScale),
        label: base.label
    };
}

function getPreviewDurationSeconds() {
    return Math.max(1, parseInt(document.getElementById('input-duration').value) || 30);
}

function updateExportFrameGuide() {
    const guide = document.getElementById('export-frame-guide');
    const label = document.getElementById('export-frame-label');
    const size = getExportSize();
    const marginX = 24;
    const marginTop = 96;
    const marginBottom = 170;
    const availableW = Math.max(120, window.innerWidth - marginX * 2);
    const availableH = Math.max(160, window.innerHeight - marginTop - marginBottom);
    const aspect = size.w / size.h;
    let frameW = availableW;
    let frameH = frameW / aspect;
    if (frameH > availableH) {
        frameH = availableH;
        frameW = frameH * aspect;
    }

    guide.style.width = `${Math.round(frameW)}px`;
    guide.style.height = `${Math.round(frameH)}px`;
    guide.style.left = `${Math.round((window.innerWidth - frameW) / 2)}px`;
    guide.style.top = `${Math.round(marginTop + (availableH - frameH) / 2)}px`;
    guide.style.aspectRatio = `${size.w} / ${size.h}`;
    label.innerText = `${size.label} · ${size.w}×${size.h}`;
    updatePreviewFrameRect(frameW, frameH, (window.innerWidth - frameW) / 2, marginTop + (availableH - frameH) / 2);
}

function updatePreviewFrameRect(frameW, frameH, left, top) {
    const overlay = document.getElementById('video-overlay');
    if (!overlay) return;
    previewFrameWidth = frameW;
    overlay.style.left = `${Math.round(left)}px`;
    overlay.style.top = `${Math.round(top)}px`;
    overlay.style.right = 'auto';
    overlay.style.bottom = 'auto';
    overlay.style.width = `${Math.round(frameW)}px`;
    overlay.style.height = `${Math.round(frameH)}px`;
    overlay.style.padding = `${Math.max(18, Math.round(frameW * 0.1))}px`;

    const title = document.getElementById('overlay-title');
    const date = document.getElementById('overlay-date');
    const values = [document.getElementById('overlay-dist'), document.getElementById('overlay-speed')];
    const labels = overlay.querySelectorAll('.overlay-stat-label');
    title.style.fontSize = `${Math.max(18, Math.round(frameW * 0.08))}px`;
    date.style.fontSize = `${Math.max(9, Math.round(frameW * 0.03))}px`;
    values.forEach(el => el.style.fontSize = `${Math.max(16, Math.round(frameW * 0.06))}px`);
    labels.forEach(el => el.style.fontSize = `${Math.max(8, Math.round(frameW * 0.022))}px`);
}

function getIndexForProgress(progress) {
    if (!points.length) return 0;
    const safeProgress = Math.max(0, Math.min(1, progress));
    if (motionMode === 'distance' && totalRouteDistance > 0) {
        return getDistancePosition(safeProgress).index;
    }
    return Math.min(points.length - 1, Math.floor(safeProgress * (points.length - 1)));
}

function getInterpolatedPosition(progress) {
    if (!points.length) return null;
    if (points.length === 1) return { point: points[0], index: 0, fraction: 0 };
    const safeProgress = Math.max(0, Math.min(1, progress));
    const distancePosition = motionMode === 'distance' && totalRouteDistance > 0
        ? getDistancePosition(safeProgress)
        : null;
    const exact = distancePosition ? distancePosition.index + distancePosition.fraction : safeProgress * (points.length - 1);
    const index = distancePosition ? distancePosition.index : Math.min(points.length - 2, Math.floor(exact));
    const fraction = distancePosition ? distancePosition.fraction : safeProgress >= 1 ? 1 : exact - index;
    const a = points[index];
    const b = points[index + 1] || a;
    const lerp = (from, to) => from + (to - from) * fraction;
    const timeA = new Date(a.time).getTime();
    const timeB = new Date(b.time).getTime();

    return {
        index,
        fraction,
        point: {
            lat: lerp(a.lat, b.lat),
            lon: lerp(a.lon, b.lon),
            ele: a.ele != null && b.ele != null ? lerp(a.ele, b.ele) : a.ele,
            time: Number.isFinite(timeA) && Number.isFinite(timeB) ? new Date(lerp(timeA, timeB)) : a.time
        }
    };
}

function getDistancePosition(progress) {
    const target = totalRouteDistance * Math.max(0, Math.min(1, progress));
    let hi = routeDistances.length - 1;
    let lo = 0;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (routeDistances[mid] < target) lo = mid + 1;
        else hi = mid;
    }
    const nextIndex = Math.max(1, lo);
    const index = Math.min(points.length - 2, nextIndex - 1);
    const startDist = routeDistances[index] || 0;
    const endDist = routeDistances[index + 1] || startDist;
    const segmentDist = Math.max(1e-6, endDist - startDist);
    return {
        index,
        fraction: progress >= 1 ? 1 : Math.max(0, Math.min(1, (target - startDist) / segmentDist))
    };
}

function getPointAtDistance(distanceMeters) {
    if (!points.length || totalRouteDistance <= 0) return null;
    const progress = Math.max(0, Math.min(1, distanceMeters / totalRouteDistance));
    return getInterpolatedPositionForMode(progress, 'distance');
}

function getInterpolatedPositionForMode(progress, mode) {
    const previousMode = motionMode;
    motionMode = mode;
    const position = getInterpolatedPosition(progress);
    motionMode = previousMode;
    return position;
}

function getPointAtElapsedSeconds(seconds) {
    if (!points.length) return null;
    const startTime = new Date(points[0].time).getTime();
    const endTime = new Date(points[points.length - 1].time).getTime();
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) return null;
    const target = startTime + seconds * 1000;
    if (target <= startTime) return { index: 0, point: points[0], fraction: 0 };
    if (target >= endTime) return { index: points.length - 1, point: points[points.length - 1], fraction: 1 };

    let hi = points.length - 1;
    let lo = 0;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const midTime = new Date(points[mid].time).getTime();
        if (midTime < target) lo = mid + 1;
        else hi = mid;
    }
    const index = Math.max(0, lo - 1);
    const a = points[index];
    const b = points[index + 1] || a;
    const timeA = new Date(a.time).getTime();
    const timeB = new Date(b.time).getTime();
    const fraction = timeB > timeA ? (target - timeA) / (timeB - timeA) : 0;
    const lerp = (from, to) => from + (to - from) * fraction;
    return {
        index,
        fraction,
        point: {
            lat: lerp(a.lat, b.lat),
            lon: lerp(a.lon, b.lon),
            ele: a.ele != null && b.ele != null ? lerp(a.ele, b.ele) : a.ele,
            time: new Date(target)
        }
    };
}

function updateRouteFlags() {
    allRouteFlagFeatures = [];
    if (points.length) {
        if (showKmFlags && totalRouteDistance > 0) {
            const stepMeters = Math.max(100, kmFlagStep * 1000);
            for (let d = stepMeters; d < totalRouteDistance; d += stepMeters) {
                const pos = getPointAtDistance(d);
                if (pos?.point) {
                    allRouteFlagFeatures.push(makeFlagFeature(pos.point, `KM ${formatFlagNumber(d / 1000)}`, 'km', d, null));
                }
            }
        }
        if (showTimeFlags) {
            const start = new Date(points[0].time).getTime();
            const end = new Date(points[points.length - 1].time).getTime();
            const stepSeconds = Math.max(60, timeFlagStep * 60);
            if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
                for (let t = stepSeconds; t < (end - start) / 1000; t += stepSeconds) {
                    const pos = getPointAtElapsedSeconds(t);
                    if (pos?.point) allRouteFlagFeatures.push(makeFlagFeature(pos.point, formatFlagTime(t), 'time', null, t));
                }
            }
        }
    }
    updateVisibleRouteFlags();
}

function updateVisibleRouteFlags(currentDistance = 0, currentElapsed = 0) {
    if (!map?.getSource('route-flags')) return;
    const features = allRouteFlagFeatures.filter(feature => {
        if (feature.properties.kind === 'km') return feature.properties.distance <= currentDistance + 1;
        return feature.properties.elapsed <= currentElapsed + 0.5;
    });
    map.getSource('route-flags').setData({ type: 'FeatureCollection', features });
}

function makeFlagFeature(point, label, kind, distance, elapsed) {
    return {
        type: 'Feature',
        properties: { label, kind, distance, elapsed },
        geometry: { type: 'Point', coordinates: [point.lon, point.lat] }
    };
}

function formatFlagNumber(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatFlagTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

function setPreviewProgress(progress) {
    if (!points.length) return;
    previewProgress = Math.max(0, Math.min(1, progress));
    const position = getInterpolatedPosition(previewProgress);
    currentIndex = previewProgress >= 1 ? points.length - 1 : position.index;
    updatePosition(currentIndex, position.point);
    document.getElementById('timeline').value = Math.round(previewProgress * 1000);
    document.getElementById('time-curr').innerText = formatTime(previewProgress * getPreviewDurationSeconds());
    document.getElementById('time-total').innerText = formatTime(getPreviewDurationSeconds());
}

function updatePosition(index, virtualPoint = null) {
    if (!points[index]) return;
    const p = virtualPoint || points[index];
    marker.setLngLat([p.lon, p.lat]);
    if (routePrefixIndex !== index) {
        routePrefixCoordinates = routeCoordinates.slice(0, index + 1);
        routePrefixIndex = index;
    }
    const coordinates = virtualPoint && index < points.length - 1
        ? routePrefixCoordinates.concat([[virtualPoint.lon, virtualPoint.lat]])
        : routePrefixCoordinates;
    map.getSource('route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates } });

    if (followCamera) {
        updateFollowCamera(p, index);
    }

    const elapsed = (new Date(p.time) - new Date(points[0].time)) / 1000;
    const currentDistance = getDistanceAtPosition(index, virtualPoint);

    // Update live overlay if visible
    if (!document.getElementById('video-overlay').classList.contains('hidden')) {
        document.getElementById('overlay-dist').innerText = (currentDistance / 1000).toFixed(1) + " KM";
        if (elapsed > 0) document.getElementById('overlay-speed').innerText = ((currentDistance / 1000) / (elapsed / 3600)).toFixed(1) + " KM/H";
    }
    updateVisibleRouteFlags(currentDistance, elapsed);
}

function getDistanceAtPosition(index, virtualPoint) {
    return (routeDistances[index] || 0) + calculatePartialDistance(index, virtualPoint);
}

function updateFollowCamera(point, index) {
    const zoom = parseFloat(document.getElementById('zoom-level').value);
    if (cameraMode !== 'chase' || points.length < 3) {
        map.jumpTo({ center: [point.lon, point.lat], zoom, bearing: 0, pitch: is3D ? 72 : 0 });
        smoothedBearing = null;
        return;
    }

    const lookAheadStep = Math.max(18, Math.round(points.length * 0.035));
    const lookAheadIndex = Math.min(points.length - 1, index + lookAheadStep);
    const lookAhead = points[lookAheadIndex] || point;
    const targetBearing = calculateStableBearing(index, lookAheadStep, point);
    const bearingDelta = smoothedBearing == null ? 180 : Math.abs(shortestBearingDelta(smoothedBearing, targetBearing));
    if (smoothedBearing == null || bearingDelta > 5) {
        smoothedBearing = smoothBearing(smoothedBearing, targetBearing, 0.025);
    }

    const center = interpolateGeoPoint(point, lookAhead, 0.34);
    map.jumpTo({
        center: [center.lon, center.lat],
        zoom: Math.max(3, zoom - 0.25),
        bearing: smoothedBearing,
        pitch: is3D ? 56 : 50
    });
}

function calculateStableBearing(index, lookAheadStep, currentPoint) {
    const samples = [];
    const start = currentPoint || points[index];
    [0.45, 0.7, 1].forEach(mult => {
        const sampleIndex = Math.min(points.length - 1, index + Math.max(2, Math.round(lookAheadStep * mult)));
        const sample = points[sampleIndex];
        if (sample && sample !== start) samples.push(calculateBearing(start, sample));
    });
    return averageBearings(samples.length ? samples : [calculateBearing(start, points[Math.min(points.length - 1, index + 1)] || start)]);
}

function averageBearings(bearings) {
    let x = 0, y = 0;
    bearings.forEach(bearing => {
        const rad = bearing * Math.PI / 180;
        x += Math.cos(rad);
        y += Math.sin(rad);
    });
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function interpolateGeoPoint(a, b, t) {
    return {
        lon: a.lon + (b.lon - a.lon) * t,
        lat: a.lat + (b.lat - a.lat) * t
    };
}

function calculateBearing(a, b) {
    const φ1 = a.lat * Math.PI / 180;
    const φ2 = b.lat * Math.PI / 180;
    const Δλ = (b.lon - a.lon) * Math.PI / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function smoothBearing(current, target, amount) {
    if (current == null) return target;
    const delta = shortestBearingDelta(current, target);
    return (current + delta * amount + 360) % 360;
}

function shortestBearingDelta(current, target) {
    return ((target - current + 540) % 360) - 180;
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
                if (map.areTilesLoaded()) {
                    resolve();
                    return;
                }

                let resolved = false;
                const timeout = setTimeout(() => {
                    if (resolved) return;
                    resolved = true;
                    resolve();
                }, 8000);

                map.once('idle', () => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeout);
                    resolve();
                });
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

// EXPORT ENGINE
document.getElementById('btn-start-record').addEventListener('click', async () => {
    if (!points.length) return alert("Carga un archivo GPX primero");
    await applyWizardSettings();

    const title        = document.getElementById('input-title').value;
    const dateStr      = document.getElementById('input-date').value;
    const color        = document.getElementById('route-color').value;
    const duration     = parseInt(document.getElementById('input-duration').value) || 30;
    const showHeader   = document.getElementById('check-header').checked;
    const showStats    = document.getElementById('check-stats').checked;
    const showElevation= document.getElementById('check-elevation').checked;
    const showProgress = document.getElementById('check-progress').checked;
    const lineWidth    = parseInt(document.getElementById('input-linewidth').value) || 6;
    const zoomLevel    = parseFloat(document.getElementById('zoom-level').value);

    updateExportFrameGuide();
    document.getElementById('modal-record').classList.add('hidden');
    document.getElementById('loader').classList.remove('hidden');
    document.getElementById('video-overlay').classList.add('hidden');
    document.getElementById('export-frame-guide').classList.add('hidden');
    if (map.getLayer('route-line')) map.setPaintProperty('route-line', 'line-width', lineWidth);

    // 1. PRE-RENDER: visitar todos los viewports para cargar tiles
    await preloadMapTiles(zoomLevel);
    document.getElementById('loader-text').innerText = "PREPARANDO GRABACIÓN...";
    await new Promise(r => setTimeout(r, 500));

    // 2. CANVAS + RECORDER
    const { w: rW, h: rH } = getExportSize();
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

    // 3. La duración configurada es la duración total real del vídeo.
    const originalFollowCamera = followCamera;
    followCamera = true;
    smoothedBearing = null;

    // 4. RENDER continuo: 0% → 100% dentro de duration.
    const TOTAL_MS = duration * 1000;
    let recordT0 = null, recording = true;
    const emoji = document.getElementById('route-icon').value || "🚴";

    // Posición inicial
    setPreviewProgress(0);
    map.jumpTo({ center: [points[0].lon, points[0].lat], zoom: zoomLevel - 1.5 });

    // 5. RENDER LOOP
    const renderLoop = (ts) => {
        if (!recording) return;
        if (recordT0 === null) recordT0 = ts;
        const elapsedMs = Math.min(ts - recordT0, TOTAL_MS);
        const progress = TOTAL_MS > 0 ? elapsedMs / TOTAL_MS : 1;
        const position = getInterpolatedPosition(progress);
        currentIndex = progress >= 1 ? points.length - 1 : position.index;
        updatePosition(currentIndex, position.point);

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
        const idx = currentIndex;
        const markerPoint = position.point || points[idx];
        const pos = map.project([markerPoint.lon, markerPoint.lat]);
        const mx = (pos.x * dpr - sx) * (rW / sw), my = (pos.y * dpr - sy) * (rH / sh);
        rctx.font = `${Math.floor(rW * 0.08)}px serif`;
        rctx.textAlign = 'center'; rctx.textBaseline = 'middle';
        rctx.fillText(emoji, mx, my);

        // — Overlay —
        drawProOverlayLegacy(rctx, rW, rH, title, dateStr, color, idx, showHeader, showStats, showElevation, showProgress, progress);
        drawCustomTextsOnCanvas(rctx, rW, rH);

        if (elapsedMs >= TOTAL_MS) {
            recording = false;
            setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 200);
            return;
        }
        requestAnimationFrame(renderLoop);
    };

    // 6. PROGRESO en loader
    const checkDone = setInterval(() => {
        if (!recording) { clearInterval(checkDone); return; }
        document.getElementById('loader-text').innerText = `GRABANDO: ${Math.round((currentIndex / (points.length - 1)) * 100)}%`;
    }, 200);

    function cleanup() {
        clearInterval(checkDone);
        followCamera = originalFollowCamera;
        pause();
        setPreviewProgress(0);
        document.getElementById('loader').classList.add('hidden');
        if (previewMode) {
            document.getElementById('video-overlay').classList.remove('hidden');
            document.getElementById('export-frame-guide').classList.remove('hidden');
            updateExportFrameGuide();
        }
    }

    recorder.onstop = () => {
        if (chunks.length === 0) { alert("Error: No se capturaron datos. Intenta otro formato."); cleanup(); return; }
        lastVideoBlob = new Blob(chunks, { type: selectedMime });
        lastVideoMime = selectedMime;
        if (lastVideoUrl) URL.revokeObjectURL(lastVideoUrl);
        lastVideoUrl = URL.createObjectURL(lastVideoBlob);
        const preview = document.getElementById('download-preview');
        preview.src = lastVideoUrl;
        preview.load();
        cleanup();
        document.getElementById('modal-video-ready').classList.remove('hidden');
    };

    try { recorder.start(); requestAnimationFrame(renderLoop); }
    catch (e) { alert("Error al iniciar grabación: " + e.message); cleanup(); }
});

function drawProOverlayLegacy(ctx, w, h, title, date, color, index, showHeader, showStats, showElevation, showProgressBar, smoothProgress = null) {
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
        const progress = smoothProgress != null ? smoothProgress : points.length > 1 ? index / (points.length - 1) : 0;
        const barH = Math.max(3, Math.round(h * 0.005));
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(0, h - barH, w, barH);
        ctx.fillStyle = color;
        ctx.fillRect(0, h - barH, w * progress, barH);
    }
}

function drawCustomTextsOnCanvas(ctx, w, h) {
    const layerRect = document.getElementById('custom-text-layer').getBoundingClientRect();
    const baseWidth = previewFrameWidth || layerRect.width || window.innerWidth || w;
    const scale = w / baseWidth;

    customTexts.forEach(text => {
        const x = w * text.x / 100;
        const y = h * text.y / 100;
        const size = Math.max(12, Math.round(text.size * scale));
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 ${size}px "${text.font}", sans-serif`;
        ctx.fillStyle = text.color;
        ctx.shadowColor = 'rgba(0,0,0,0.75)';
        ctx.shadowBlur = Math.round(size * 0.25);
        ctx.shadowOffsetY = Math.round(size * 0.08);
        String(text.content || '').split('\n').forEach((line, i, lines) => {
            ctx.fillText(line, x, y + (i - (lines.length - 1) / 2) * size * 1.15);
        });
        ctx.restore();
    });
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
        d += distanceBetween(points[i], points[i + 1]);
    }
    return d;
}
function calculatePartialDistance(index, virtualPoint) {
    if (!virtualPoint || index >= points.length - 1) return 0;
    return distanceBetween(points[index], virtualPoint);
}
function distanceBetween(p1, p2) {
    if (!p1 || !p2) return 0;
    const R = 6371e3, φ1 = p1.lat * Math.PI / 180, φ2 = p2.lat * Math.PI / 180, Δφ = (p2.lat - p1.lat) * Math.PI / 180, Δλ = (p2.lon - p1.lon) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function buildRouteDistances() {
    routeDistances = [0];
    totalRouteDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
        totalRouteDistance += distanceBetween(points[i], points[i + 1]);
        routeDistances.push(totalRouteDistance);
    }
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
    if (!previewLastFrame) previewLastFrame = timestamp;
    const speed = parseFloat(document.getElementById('speed-val').value) || 1;
    const deltaProgress = ((timestamp - previewLastFrame) / 1000) * speed / getPreviewDurationSeconds();
    previewLastFrame = timestamp;
    const nextProgress = previewProgress + deltaProgress;

    if (nextProgress >= 1) {
        if (loopEnabled) {
            setPreviewProgress(0);
            previewLastFrame = timestamp;
            animationId = requestAnimationFrame(animate);
        } else {
            pause();
            setPreviewProgress(0);
        }
        return;
    }

    setPreviewProgress(nextProgress);
    animationId = requestAnimationFrame(animate);
}
function play() {
    if (!points.length) return;
    if (previewProgress >= 1) setPreviewProgress(0);
    isPlaying = true;
    previewLastFrame = 0;
    document.getElementById('play-icon').className = 'fas fa-pause';
    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(animate);
}
function pause() {
    isPlaying = false;
    previewLastFrame = 0;
    document.getElementById('play-icon').className = 'fas fa-play';
    cancelAnimationFrame(animationId);
}
document.getElementById('btn-play').addEventListener('click', () => isPlaying ? pause() : play());
document.getElementById('timeline').addEventListener('input', (e) => { pause(); setPreviewProgress(parseInt(e.target.value) / 1000); });
document.getElementById('btn-record-setup').addEventListener('click', () => { if (!points.length) return alert("Carga un GPX primero"); document.getElementById('btn-start-record').click(); });
document.getElementById('btn-restart').addEventListener('click', () => { pause(); smoothedBearing = null; setPreviewProgress(0); });
document.getElementById('btn-loop').addEventListener('click', (e) => {
    loopEnabled = !loopEnabled;
    e.currentTarget.classList.toggle('text-blue-400', loopEnabled);
    e.currentTarget.classList.toggle('bg-blue-500/20', loopEnabled);
});

document.getElementById('btn-config').addEventListener('click', openWizard);
document.getElementById('btn-apply-wizard').addEventListener('click', async () => {
    await applyWizardSettings();
    showPreview();
});
document.getElementById('wizard-map-selector').addEventListener('change', (e) => {
    document.getElementById('map-selector').value = e.target.value;
});
document.getElementById('wizard-route-icon').addEventListener('input', (e) => {
    document.getElementById('route-icon').value = e.target.value;
    updateMarkerIcon();
});
document.getElementById('wizard-route-color').addEventListener('input', (e) => {
    document.getElementById('route-color').value = e.target.value;
    if (map.getLayer('route-line')) map.setPaintProperty('route-line', 'line-color', e.target.value);
    updatePreviewOverlay();
});
document.getElementById('input-view-mode').addEventListener('change', (e) => {
    is3D = e.target.value === '3d';
    document.getElementById('toggle-3d').classList.toggle('bg-blue-600', is3D);
    setupTerrainLayers();
    applyTerrainMode();
});
document.getElementById('camera-mode').addEventListener('change', (e) => {
    cameraMode = e.target.value;
    updateCameraModeUi();
});
document.getElementById('motion-mode').addEventListener('change', (e) => {
    motionMode = e.target.value;
    routePrefixIndex = -1;
    setPreviewProgress(previewProgress);
});
document.getElementById('terrain-exaggeration').addEventListener('input', (e) => {
    terrainExaggeration = parseFloat(e.target.value) || 1.5;
    updateTerrainExaggerationLabel();
    if (is3D) applyTerrainMode(false);
});
['input-title', 'input-date', 'check-header', 'check-stats', 'check-elevation', 'check-progress'].forEach(id => {
    document.getElementById(id).addEventListener('input', updatePreviewOverlay);
    document.getElementById(id).addEventListener('change', updatePreviewOverlay);
});
['check-km-flags', 'check-time-flags', 'km-flag-step', 'time-flag-step'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        showKmFlags = document.getElementById('check-km-flags').checked;
        showTimeFlags = document.getElementById('check-time-flags').checked;
        kmFlagStep = parseFloat(document.getElementById('km-flag-step').value) || 1;
        timeFlagStep = parseFloat(document.getElementById('time-flag-step').value) || 10;
        updateRouteFlags();
        setPreviewProgress(previewProgress);
    });
    document.getElementById(id).addEventListener('change', () => {
        showKmFlags = document.getElementById('check-km-flags').checked;
        showTimeFlags = document.getElementById('check-time-flags').checked;
        kmFlagStep = parseFloat(document.getElementById('km-flag-step').value) || 1;
        timeFlagStep = parseFloat(document.getElementById('time-flag-step').value) || 10;
        updateRouteFlags();
        setPreviewProgress(previewProgress);
    });
});
['input-ratio', 'input-quality', 'input-duration'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        updateExportFrameGuide();
        setPreviewProgress(previewProgress);
    });
    document.getElementById(id).addEventListener('change', () => {
        updateExportFrameGuide();
        setPreviewProgress(previewProgress);
    });
});
document.getElementById('btn-add-text').addEventListener('click', addCustomText);
document.getElementById('btn-hide-text-panel').addEventListener('click', () => {
    document.getElementById('text-toolbar').classList.toggle('collapsed');
});
document.getElementById('text-content').addEventListener('input', (e) => updateSelectedText({ content: e.target.value }));
document.getElementById('text-size').addEventListener('input', (e) => updateSelectedText({ size: parseInt(e.target.value) || 42 }));
document.getElementById('text-color').addEventListener('input', (e) => updateSelectedText({ color: e.target.value }));
document.getElementById('text-font').addEventListener('change', (e) => updateSelectedText({ font: e.target.value }));
document.getElementById('btn-delete-text').addEventListener('click', () => {
    customTexts = customTexts.filter(t => t.id !== selectedTextId);
    selectedTextId = customTexts[0]?.id || null;
    renderCustomTexts();
    syncTextControls();
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
window.addEventListener('resize', updateExportFrameGuide);
