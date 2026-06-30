let map, points = [], marker;
let isPlaying = false, followCamera = true, is3D = true;
let currentIndex = 0, animationId;
let rawGpx = "";
let lastVideoBlob = null, lastVideoMime = null;
let lastVideoUrl = null;
let loopEnabled = false;
let customTexts = [];
let selectedTextId = null;
let currentOverlayPoint = null;
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
let exportInProgress = false;

const STORAGE_KEY = 'shareyourtrack:settings:v2';

const metricCatalog = [
    { id: 'distance', label: 'Distancia', shortLabel: 'DIST', format: stats => `${(stats.distance / 1000).toFixed(1)} km` },
    { id: 'remainingDistance', label: 'Distancia restante', shortLabel: 'RESTA', format: stats => `${Math.max(0, (stats.totalDistance - stats.distance) / 1000).toFixed(1)} km` },
    { id: 'elapsedTime', label: 'Tiempo', shortLabel: 'TIEMPO', format: stats => formatDuration(stats.elapsed) },
    { id: 'remainingTime', label: 'Tiempo restante', shortLabel: 'QUEDA', format: stats => formatDuration(Math.max(0, stats.totalTime - stats.elapsed)) },
    { id: 'currentSpeed', label: 'Velocidad ahora', shortLabel: 'VEL.', format: stats => `${stats.currentSpeed.toFixed(1)} km/h` },
    { id: 'avgSpeed', label: 'Velocidad media', shortLabel: 'MEDIA', format: stats => `${stats.avgSpeed.toFixed(1)} km/h` },
    { id: 'currentPace', label: 'Ritmo ahora', shortLabel: 'RITMO', format: stats => formatPace(stats.currentSpeed) },
    { id: 'avgPace', label: 'Ritmo medio', shortLabel: 'RIT. MEDIO', format: stats => formatPace(stats.avgSpeed) },
    { id: 'altitude', label: 'Altitud', shortLabel: 'ALT.', format: stats => stats.elevation == null ? '-- m' : `${Math.round(stats.elevation)} m` },
    { id: 'elevationGain', label: 'Desnivel +', shortLabel: 'DESNIVEL', format: stats => `+${Math.round(stats.elevationGain)} m` },
    { id: 'grade', label: 'Pendiente', shortLabel: 'PEND.', format: stats => Number.isFinite(stats.grade) ? `${stats.grade.toFixed(1)}%` : '--%' },
    { id: 'progress', label: 'Progreso', shortLabel: 'PROG.', format: stats => `${Math.round(stats.progress * 100)}%` },
    { id: 'trackTime', label: 'Hora GPX', shortLabel: 'HORA', format: stats => formatClock(stats.point?.time) },
    { id: 'coordinates', label: 'Coordenadas', shortLabel: 'GPS', format: stats => `${stats.point.lat.toFixed(4)}, ${stats.point.lon.toFixed(4)}` }
];

function getElementValue(id, fallback = '') {
    const element = document.getElementById(id);
    return element ? element.value : fallback;
}

function setElementValue(id, value) {
    const element = document.getElementById(id);
    if (!element || value == null) return;
    element.value = value;
}

function setElementChecked(id, value) {
    const element = document.getElementById(id);
    if (!element || value == null) return;
    element.checked = Boolean(value);
}

function getStoredSettings() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {};
    } catch (err) {
        console.warn('No se pudo leer la configuración guardada', err);
        return {};
    }
}

function sanitizeStoredTexts(texts) {
    if (!Array.isArray(texts)) return [];
    return texts
        .filter(text => text && (text.type === 'metric' || text.type === 'text'))
        .map(text => ({
            id: String(text.id || Date.now().toString(36)),
            type: text.type === 'metric' ? 'metric' : 'text',
            content: String(text.content || ''),
            metric: getMetricDefinition(text.metric).id,
            x: Math.max(0, Math.min(100, Number(text.x) || 50)),
            y: Math.max(0, Math.min(100, Number(text.y) || 50)),
            size: Math.max(12, Math.min(120, Number(text.size) || 36)),
            color: /^#[0-9a-f]{6}$/i.test(text.color || '') ? text.color : '#ffffff',
            font: String(text.font || 'Inter')
        }));
}

function collectSettingsForStorage() {
    return {
        mapStyle: getElementValue('map-selector', currentMapStyle),
        routeIcon: getElementValue('route-icon', '🚴'),
        routeColor: getElementValue('route-color', '#3b82f6'),
        zoomLevel: getElementValue('zoom-level', '16'),
        viewMode: is3D ? '3d' : '2d',
        cameraMode,
        motionMode,
        terrainExaggeration,
        title: getElementValue('input-title', 'MI RUTA'),
        date: getElementValue('input-date', ''),
        showHeader: document.getElementById('check-header')?.checked ?? true,
        showKmFlags,
        showTimeFlags,
        kmFlagStep,
        timeFlagStep,
        ratio: getElementValue('input-ratio', '916'),
        quality: getElementValue('input-quality', '720'),
        duration: getElementValue('input-duration', '30'),
        lineWidth: getElementValue('input-linewidth', '6'),
        customTexts,
        selectedTextId
    };
}

function saveSettings() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(collectSettingsForStorage()));
    } catch (err) {
        console.warn('No se pudo guardar la configuración', err);
    }
}

function restoreSettings() {
    const settings = getStoredSettings();
    if (!Object.keys(settings).length) return;

    setElementValue('map-selector', settings.mapStyle);
    setElementValue('wizard-map-selector', settings.mapStyle);
    setElementValue('route-icon', settings.routeIcon);
    setElementValue('wizard-route-icon', settings.routeIcon);
    setElementValue('route-color', settings.routeColor);
    setElementValue('wizard-route-color', settings.routeColor);
    setElementValue('zoom-level', settings.zoomLevel);
    setElementValue('input-view-mode', settings.viewMode);
    setElementValue('camera-mode', settings.cameraMode);
    setElementValue('motion-mode', settings.motionMode);
    setElementValue('terrain-exaggeration', settings.terrainExaggeration);
    setElementValue('input-title', settings.title);
    setElementValue('input-date', settings.date);
    setElementChecked('check-header', settings.showHeader);
    setElementChecked('check-km-flags', settings.showKmFlags);
    setElementChecked('check-time-flags', settings.showTimeFlags);
    setElementValue('km-flag-step', settings.kmFlagStep);
    setElementValue('time-flag-step', settings.timeFlagStep);
    setElementValue('input-ratio', settings.ratio);
    setElementValue('input-quality', settings.quality);
    setElementValue('input-duration', settings.duration);
    setElementValue('input-linewidth', settings.lineWidth);

    currentMapStyle = 'satellite';
    is3D = settings.viewMode ? settings.viewMode === '3d' : is3D;
    cameraMode = settings.cameraMode || cameraMode;
    motionMode = settings.motionMode || motionMode;
    terrainExaggeration = parseFloat(settings.terrainExaggeration) || terrainExaggeration;
    showKmFlags = Boolean(settings.showKmFlags);
    showTimeFlags = Boolean(settings.showTimeFlags);
    kmFlagStep = parseFloat(settings.kmFlagStep) || kmFlagStep;
    timeFlagStep = parseFloat(settings.timeFlagStep) || timeFlagStep;
    customTexts = sanitizeStoredTexts(settings.customTexts);
    selectedTextId = customTexts.some(text => text.id === settings.selectedTextId)
        ? settings.selectedTextId
        : customTexts[0]?.id || null;
}

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
            "glyphs": "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
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

    map.on('load', () => {
        setupMapLayers();
        const savedStyle = getElementValue('map-selector', currentMapStyle);
        if (savedStyle && savedStyle !== currentMapStyle) setMapStyle(savedStyle);
    });
    map.on('style.load', setupMapLayers);

    document.getElementById('zoom-level').addEventListener('input', () => {
        if (points.length) updatePosition(currentIndex);
        saveSettings();
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
    style.glyphs = style.glyphs || "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";
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
    saveSettings();
});

// Customization
document.getElementById('route-color').addEventListener('input', (e) => {
    if (map.getLayer('route-line')) map.setPaintProperty('route-line', 'line-color', e.target.value);
    document.getElementById('wizard-route-color').value = e.target.value;
    saveSettings();
});
document.getElementById('route-icon').addEventListener('input', (e) => {
    document.getElementById('wizard-route-icon').value = e.target.value;
    updateMarkerIcon();
    saveSettings();
});
document.getElementById('toggle-3d').addEventListener('click', (e) => {
    is3D = !is3D;
    e.currentTarget.classList.toggle('bg-blue-600', is3D);
    document.getElementById('input-view-mode').value = is3D ? '3d' : '2d';
    setupTerrainLayers();
    applyTerrainMode();
    saveSettings();
});
document.getElementById('toggle-follow').addEventListener('click', (e) => {
    followCamera = !followCamera;
    e.currentTarget.classList.toggle('bg-blue-600', followCamera);
    saveSettings();
});
document.getElementById('toggle-chase').addEventListener('click', () => {
    cameraMode = cameraMode === 'chase' ? 'center' : 'chase';
    updateCameraModeUi();
    saveSettings();
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

    if (!document.getElementById('input-date').value) document.getElementById('input-date').value = formatDate(points[0].time);
    if (!document.getElementById('input-title').value) document.getElementById('input-title').value = "MI RUTA";
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
    saveSettings();
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
    updateExportControls();
}

function updatePreviewOverlay() {
    const title = document.getElementById('input-title').value || 'MI RUTA';
    const dateStr = document.getElementById('input-date').value || '';
    const color = document.getElementById('route-color').value;
    const showHeader = document.getElementById('check-header').checked;

    document.getElementById('overlay-title').innerText = title.toUpperCase();
    document.getElementById('overlay-date').innerText = dateStr.toUpperCase();
    document.getElementById('overlay-date').style.color = color;
    document.getElementById('overlay-title').parentElement.classList.toggle('hidden', !showHeader);
    document.getElementById('overlay-dist').closest('.flex.justify-between').classList.add('hidden');

    if (points.length) setPreviewProgress(previewProgress);
    renderCustomTexts();
    updateExportControls();
}

function addCustomText() {
    const text = {
        id: Date.now().toString(36),
        type: 'text',
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
    saveSettings();
}

function addMetricText() {
    const text = {
        id: Date.now().toString(36),
        type: 'metric',
        metric: 'currentSpeed',
        x: 50,
        y: 62,
        size: 36,
        color: '#ffffff',
        font: 'Inter'
    };
    customTexts.push(text);
    selectedTextId = text.id;
    document.getElementById('text-controls').classList.remove('hidden');
    renderCustomTexts();
    syncTextControls();
    saveSettings();
}

function getSelectedText() {
    return customTexts.find(t => t.id === selectedTextId) || null;
}

function getMetricDefinition(metricId) {
    return metricCatalog.find(metric => metric.id === metricId) || metricCatalog[0];
}

function getCustomTextDisplay(text, index = currentIndex, point = currentOverlayPoint, progress = previewProgress) {
    if (text.type !== 'metric') {
        return {
            label: '',
            value: text.content || '',
            canvasLines: String(text.content || '').split('\n')
        };
    }

    const metric = getMetricDefinition(text.metric);
    const stats = getCurrentStats(index, point, progress);
    const value = metric.format(stats);
    return {
        label: metric.shortLabel,
        value,
        canvasLines: [metric.shortLabel, value]
    };
}

function renderCustomTexts() {
    const layer = document.getElementById('custom-text-layer');
    layer.innerHTML = '';
    customTexts.forEach(text => {
        const display = getCustomTextDisplay(text);
        const el = document.createElement('div');
        el.className = `custom-text-overlay ${text.type === 'metric' ? 'metric' : ''} ${text.id === selectedTextId ? 'selected' : ''}`;
        el.dataset.id = text.id;
        el.dataset.type = text.type || 'text';
        el.style.left = `${text.x}%`;
        el.style.top = `${text.y}%`;
        el.style.fontSize = `${text.size}px`;
        el.style.color = text.color;
        el.style.fontFamily = text.font;
        if (text.type === 'metric') {
            const label = document.createElement('span');
            label.className = 'metric-label';
            label.textContent = display.label;
            const value = document.createElement('span');
            value.className = 'metric-value';
            value.textContent = display.value;
            el.append(label, value);
        } else {
            el.textContent = display.value;
        }
        el.addEventListener('pointerdown', startTextDrag);
        layer.appendChild(el);
    });
}

function updateCustomMetricValues(index = currentIndex, point = currentOverlayPoint, progress = previewProgress) {
    document.querySelectorAll('.custom-text-overlay[data-type="metric"]').forEach(el => {
        const text = customTexts.find(item => item.id === el.dataset.id);
        if (!text) return;
        const display = getCustomTextDisplay(text, index, point, progress);
        const label = el.querySelector('.metric-label');
        const value = el.querySelector('.metric-value');
        if (label) label.textContent = display.label;
        if (value) value.textContent = display.value;
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
        saveSettings();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
}

function syncTextControls() {
    const text = getSelectedText();
    document.getElementById('text-controls').classList.toggle('hidden', !text);
    if (!text) return;
    const isMetric = text.type === 'metric';
    document.getElementById('text-content').classList.toggle('hidden', isMetric);
    document.getElementById('metric-controls').classList.toggle('hidden', !isMetric);
    document.getElementById('text-content').value = text.content || '';
    document.getElementById('text-size').value = text.size;
    document.getElementById('text-color').value = text.color;
    document.getElementById('text-font').value = text.font;
    document.getElementById('metric-type').value = text.metric || metricCatalog[0].id;
}

function updateSelectedText(patch) {
    const text = getSelectedText();
    if (!text) return;
    Object.assign(text, patch);
    renderCustomTexts();
    saveSettings();
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

function getExportFrameRate() {
    const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return isiOS ? 24 : 30;
}

function waitForMapRenderFrame(timeoutMs = 220) {
    if (!map) return Promise.resolve();
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timeout);
            map.off('render', finish);
            resolve();
        };
        const timeout = setTimeout(finish, timeoutMs);
        map.once('render', finish);
        if (map.triggerRepaint) map.triggerRepaint();
    });
}

function waitUntil(targetTime) {
    const delay = targetTime - performance.now();
    if (delay <= 0) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, delay));
}

function createRecordStream(canvas, fps) {
    try {
        const stream = canvas.captureStream(0);
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.requestFrame === 'function') {
            return { stream, track, manualFrames: true };
        }
        stream.getTracks().forEach(candidate => candidate.stop());
    } catch (err) {
        console.warn('Canvas manual frame capture no disponible, usando FPS fijo', err);
    }

    const stream = canvas.captureStream(fps);
    const track = stream.getVideoTracks()[0] || null;
    return { stream, track, manualFrames: false };
}

function composeRecordFrame(ctx, recordSize, sourceCanvas, position, progress, options) {
    const { w: rW, h: rH } = recordSize;
    const mapCanvas = sourceCanvas || map.getCanvas();
    const mW = mapCanvas.width;
    const mH = mapCanvas.height;
    const tA = rW / rH;
    const mA = mW / mH;
    let sx, sy, sw, sh;

    if (mA > tA) {
        sh = mH;
        sw = Math.round(mH * tA);
        sx = Math.round((mW - sw) / 2);
        sy = 0;
    } else {
        sw = mW;
        sh = Math.round(mW / tA);
        sx = 0;
        sy = Math.round((mH - sh) / 2);
    }

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, rW, rH);
    ctx.drawImage(mapCanvas, sx, sy, sw, sh, 0, 0, rW, rH);

    const dpr = mW / Math.max(1, mapCanvas.clientWidth || mW);
    const markerPoint = position.point || points[currentIndex];
    const projected = map.project([markerPoint.lon, markerPoint.lat]);
    const mx = (projected.x * dpr - sx) * (rW / sw);
    const my = (projected.y * dpr - sy) * (rH / sh);

    ctx.font = `${Math.floor(rW * 0.08)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(options.emoji, mx, my);

    drawProOverlayLegacy(
        ctx,
        rW,
        rH,
        options.title,
        options.dateStr,
        options.color,
        currentIndex,
        options.showHeader,
        options.showStats,
        options.showElevation,
        options.showProgress,
        progress,
        position.point
    );
    drawCustomTextsOnCanvas(ctx, rW, rH, progress, position.point);
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
    currentOverlayPoint = p;
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
    updateCustomMetricValues(index, p, previewProgress);
    updateVisibleRouteFlags(currentDistance, elapsed);
}

function getDistanceAtPosition(index, virtualPoint) {
    return (routeDistances[index] || 0) + calculatePartialDistance(index, virtualPoint);
}

function getCurrentStats(index = currentIndex, point = currentOverlayPoint, progress = previewProgress) {
    const safeIndex = Math.max(0, Math.min(points.length - 1, index || 0));
    const safePoint = point || points[safeIndex] || points[0] || { lat: 0, lon: 0 };
    const distance = getDistanceAtPosition(safeIndex, safePoint);
    const elapsed = getElapsedSecondsAtPoint(safePoint);
    const totalTime = getTotalTrackSeconds();
    const currentSpeed = getInstantSpeedKmh(safeIndex);
    const avgSpeed = elapsed > 0 ? (distance / 1000) / (elapsed / 3600) : 0;

    return {
        index: safeIndex,
        point: safePoint,
        distance,
        totalDistance: totalRouteDistance,
        elapsed,
        totalTime,
        currentSpeed: Number.isFinite(currentSpeed) ? currentSpeed : avgSpeed,
        avgSpeed: Number.isFinite(avgSpeed) ? avgSpeed : 0,
        elevation: safePoint.ele,
        elevationGain: calculateElevationGainAtPosition(safeIndex, safePoint),
        grade: getSegmentGrade(safeIndex),
        progress: Math.max(0, Math.min(1, progress))
    };
}

function getElapsedSecondsAtPoint(point) {
    if (!points.length || !point?.time) return 0;
    const start = new Date(points[0].time).getTime();
    const current = new Date(point.time).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(current)) return 0;
    return Math.max(0, (current - start) / 1000);
}

function getTotalTrackSeconds() {
    if (points.length < 2) return 0;
    const start = new Date(points[0].time).getTime();
    const end = new Date(points[points.length - 1].time).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    return (end - start) / 1000;
}

function getInstantSpeedKmh(index) {
    if (points.length < 2) return 0;
    const a = points[Math.max(0, Math.min(points.length - 2, index))];
    const b = points[Math.max(1, Math.min(points.length - 1, index + 1))];
    const dt = (new Date(b.time).getTime() - new Date(a.time).getTime()) / 1000;
    if (!Number.isFinite(dt) || dt <= 0) return 0;
    return (distanceBetween(a, b) / 1000) / (dt / 3600);
}

function getSegmentGrade(index) {
    if (points.length < 2) return 0;
    const a = points[Math.max(0, Math.min(points.length - 2, index))];
    const b = points[Math.max(1, Math.min(points.length - 1, index + 1))];
    if (a.ele == null || b.ele == null) return NaN;
    const distance = distanceBetween(a, b);
    if (distance <= 0) return NaN;
    return ((b.ele - a.ele) / distance) * 100;
}

function calculateElevationGainAtPosition(index, virtualPoint) {
    const baseGain = calculateElevationGain(0, index);
    if (!virtualPoint || index >= points.length - 1 || points[index]?.ele == null || virtualPoint.ele == null) return baseGain;
    return baseGain + Math.max(0, virtualPoint.ele - points[index].ele);
}

function updateFollowCamera(point, index) {
    const zoom = parseFloat(document.getElementById('zoom-level').value);
    if (cameraMode !== 'chase' || points.length < 3) {
        map.jumpTo({ center: [point.lon, point.lat], zoom, bearing: 0, pitch: is3D ? 72 : 0 });
        smoothedBearing = null;
        return;
    }

    const currentDistance = getDistanceAtPosition(index, point);
    const lookAheadMeters = Math.max(80, Math.min(650, totalRouteDistance * 0.045));
    const lookAhead = getPointAtDistance(Math.min(totalRouteDistance, currentDistance + lookAheadMeters))?.point || points[Math.min(points.length - 1, index + 1)] || point;
    const targetBearing = calculateStableBearing(index, lookAheadMeters, point, currentDistance);
    const bearingDelta = smoothedBearing == null ? 180 : Math.abs(shortestBearingDelta(smoothedBearing, targetBearing));
    if (smoothedBearing == null || bearingDelta > 3) {
        smoothedBearing = smoothBearing(smoothedBearing, targetBearing, 0.04);
    }

    const center = interpolateGeoPoint(point, lookAhead, 0.3);
    map.jumpTo({
        center: [center.lon, center.lat],
        zoom: Math.max(3, zoom - 0.25),
        bearing: smoothedBearing,
        pitch: is3D ? 56 : 50
    });
}

function calculateStableBearing(index, lookAheadMeters, currentPoint, currentDistance = null) {
    if (totalRouteDistance > 0) {
        const distance = currentDistance ?? getDistanceAtPosition(index, currentPoint);
        const behindDistance = Math.max(0, distance - Math.max(40, lookAheadMeters * 0.45));
        const behind = getPointAtDistance(behindDistance)?.point || currentPoint;
        const samples = [];

        [0.55, 0.85, 1.15].forEach(mult => {
            const aheadDistance = Math.min(totalRouteDistance, distance + lookAheadMeters * mult);
            const ahead = getPointAtDistance(aheadDistance)?.point || currentPoint;
            const from = distanceBetween(currentPoint, ahead) > 4 ? currentPoint : behind;
            if (distanceBetween(from, ahead) > 4) samples.push(calculateBearing(from, ahead));
        });

        if (samples.length) return averageBearings(samples);
    }

    const samples = [];
    const start = currentPoint || points[index];
    const lookAheadStep = Math.max(18, Math.round(points.length * 0.035));
    [0.45, 0.7, 1].forEach(mult => {
        const sampleIndex = Math.min(points.length - 1, index + Math.max(2, Math.round(lookAheadStep * mult)));
        const sample = points[sampleIndex];
        if (sample && distanceBetween(start, sample) > 4) samples.push(calculateBearing(start, sample));
    });
    if (samples.length) return averageBearings(samples);

    const previous = points[Math.max(0, index - 1)] || start;
    const next = points[Math.min(points.length - 1, index + 1)] || start;
    if (distanceBetween(previous, start) > 4) return calculateBearing(previous, start);
    if (distanceBetween(start, next) > 4) return calculateBearing(start, next);
    return smoothedBearing ?? 0;
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
async function startRecordingVideo() {
    if (!points.length) return alert("Carga un archivo GPX primero");
    if (!previewMode) return alert("Primero revisa la preview antes de exportar.");
    if (exportInProgress) return;
    exportInProgress = true;
    try {
        await applyWizardSettings();
    } catch (err) {
        console.error(err);
        exportInProgress = false;
        alert("No se pudo preparar la exportación.");
        return;
    }

    const title        = document.getElementById('input-title').value;
    const dateStr      = document.getElementById('input-date').value;
    const color        = document.getElementById('route-color').value;
    const duration     = parseInt(document.getElementById('input-duration').value) || 30;
    const showHeader   = document.getElementById('check-header').checked;
    const showStats    = false;
    const showElevation= false;
    const showProgress = false;
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
    const fps = getExportFrameRate();
    const capture = createRecordStream(recordCanvas, fps);

    const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m));
    if (!selectedMime) {
        document.getElementById('loader').classList.add('hidden');
        exportInProgress = false;
        return alert("Tu navegador no soporta grabación de video.");
    }

    let recorder, chunks = [];
    try { recorder = new MediaRecorder(capture.stream, { mimeType: selectedMime, videoBitsPerSecond: 10000000 }); }
    catch (e) {
        document.getElementById('loader').classList.add('hidden');
        exportInProgress = false;
        return alert("Error: " + e.message);
    }
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    // 3. La duración configurada es la duración total real del vídeo.
    const originalFollowCamera = followCamera;
    followCamera = true;
    smoothedBearing = null;

    // 4. RENDER estable: frame a frame, esperando a que MapLibre pinte cada cambio.
    const totalFrames = Math.max(2, Math.round(duration * fps));
    const frameMs = 1000 / fps;
    let recording = true;
    let frameNumber = 0;
    let captureStartTime = 0;
    const emoji = document.getElementById('route-icon').value || "🚴";
    const recordOptions = {
        title,
        dateStr,
        color,
        showHeader,
        showStats,
        showElevation,
        showProgress,
        emoji
    };

    // Posición inicial
    setPreviewProgress(0);
    map.jumpTo({ center: [points[0].lon, points[0].lat], zoom: zoomLevel - 1.5 });
    await waitForMapRenderFrame(500);

    // 5. RENDER LOOP
    const renderLoop = async () => {
        if (!recording) return;
        const progress = frameNumber / (totalFrames - 1);
        const position = getInterpolatedPosition(progress);
        currentIndex = progress >= 1 ? points.length - 1 : position.index;
        updatePosition(currentIndex, position.point);
        await waitForMapRenderFrame(frameNumber === totalFrames - 1 ? 500 : 220);

        composeRecordFrame(rctx, { w: rW, h: rH }, map.getCanvas(), position, progress, recordOptions);
        if (capture.manualFrames) capture.track.requestFrame();

        if (frameNumber >= totalFrames - 1) {
            recording = false;
            setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, Math.max(250, frameMs * 3));
            return;
        }

        frameNumber += 1;
        if (captureStartTime) await waitUntil(captureStartTime + frameNumber * frameMs);
        requestAnimationFrame(renderLoop);
    };

    // 6. PROGRESO en loader
    const checkDone = setInterval(() => {
        if (!recording) { clearInterval(checkDone); return; }
        document.getElementById('loader-text').innerText = `GRABANDO: ${Math.round((frameNumber / (totalFrames - 1)) * 100)}%`;
    }, 200);

    function cleanup() {
        clearInterval(checkDone);
        capture.track?.stop?.();
        followCamera = originalFollowCamera;
        pause();
        setPreviewProgress(0);
        document.getElementById('loader').classList.add('hidden');
        if (previewMode) {
            document.getElementById('video-overlay').classList.remove('hidden');
            document.getElementById('export-frame-guide').classList.remove('hidden');
            updateExportFrameGuide();
        }
        exportInProgress = false;
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

    try {
        recorder.start(1000);
        captureStartTime = performance.now();
        requestAnimationFrame(renderLoop);
    }
    catch (e) { alert("Error al iniciar grabación: " + e.message); cleanup(); }
}

function drawProOverlayLegacy(ctx, w, h, title, date, color, index, showHeader, showStats, showElevation, showProgressBar, smoothProgress = null, virtualPoint = null) {
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

        const pointForStats = virtualPoint || points[index];
        const dist = getDistanceAtPosition(index, virtualPoint);
        const elapsed = (new Date(pointForStats.time) - new Date(points[0].time)) / 1000;
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

function drawCustomTextsOnCanvas(ctx, w, h, progress = previewProgress, point = currentOverlayPoint) {
    const layerRect = document.getElementById('custom-text-layer').getBoundingClientRect();
    const baseWidth = previewFrameWidth || layerRect.width || window.innerWidth || w;
    const scale = w / baseWidth;

    customTexts.forEach(text => {
        const display = getCustomTextDisplay(text, currentIndex, point, progress);
        const x = w * text.x / 100;
        const y = h * text.y / 100;
        const size = Math.max(12, Math.round(text.size * scale));
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = text.color;
        ctx.shadowColor = 'rgba(0,0,0,0.75)';
        ctx.shadowBlur = Math.round(size * 0.25);
        ctx.shadowOffsetY = Math.round(size * 0.08);

        if (text.type === 'metric') {
            const valueSize = size;
            const labelSize = Math.max(8, Math.round(size * 0.34));
            ctx.font = `900 ${valueSize}px "${text.font}", sans-serif`;
            const valueWidth = ctx.measureText(display.value).width;
            ctx.font = `800 ${labelSize}px "${text.font}", sans-serif`;
            const labelWidth = ctx.measureText(display.label).width;
            const boxW = Math.max(valueWidth, labelWidth) + size * 0.9;
            const boxH = valueSize + labelSize + size * 0.55;
            const radius = Math.max(8, Math.round(size * 0.25));
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
            roundRect(ctx, x - boxW / 2, y - boxH / 2, boxW, boxH, radius);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.lineWidth = Math.max(1, Math.round(size * 0.03));
            ctx.stroke();
            ctx.shadowColor = 'rgba(0,0,0,0.75)';
            ctx.shadowBlur = Math.round(size * 0.14);
            ctx.fillStyle = text.color;
            ctx.font = `900 ${valueSize}px "${text.font}", sans-serif`;
            ctx.fillText(display.value, x, y + labelSize * 0.38);
            ctx.fillStyle = 'rgba(226, 232, 240, 0.78)';
            ctx.font = `800 ${labelSize}px "${text.font}", sans-serif`;
            ctx.fillText(display.label, x, y - valueSize * 0.58);
        } else {
            ctx.font = `900 ${size}px "${text.font}", sans-serif`;
            display.canvasLines.forEach((line, i, lines) => {
                ctx.fillText(line, x, y + (i - (lines.length - 1) / 2) * size * 1.15);
            });
        }
        ctx.restore();
    });
}

function roundRect(ctx, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    ctx.closePath();
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
function formatDuration(seconds) {
    const safeSeconds = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(safeSeconds / 3600);
    const m = Math.floor((safeSeconds % 3600) / 60);
    const s = safeSeconds % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function formatPace(speedKmh) {
    if (!Number.isFinite(speedKmh) || speedKmh <= 0) return '-- /km';
    const secondsPerKm = Math.round(3600 / speedKmh);
    const m = Math.floor(secondsPerKm / 60);
    const s = secondsPerKm % 60;
    return `${m}:${String(s).padStart(2, '0')} /km`;
}
function formatClock(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '--:--';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function formatDate(dt) { const d = new Date(dt), m = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"]; return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`; }
function closeModal() { document.getElementById('modal-record').classList.add('hidden'); }
window.closeModal = closeModal;

function populateMetricOptions() {
    const select = document.getElementById('metric-type');
    if (!select || select.options.length) return;
    metricCatalog.forEach(metric => {
        const option = document.createElement('option');
        option.value = metric.id;
        option.textContent = metric.label;
        select.appendChild(option);
    });
}

function updateExportControls() {
    const exportButton = document.getElementById('btn-record-setup');
    if (!exportButton) return;
    exportButton.innerHTML = previewMode
        ? '<i class="fas fa-clapperboard"></i> EXPORTAR VIDEO'
        : '<i class="fas fa-eye"></i> VER PREVIEW';
}

async function showPreviewFromWizard() {
    if (!points.length) return alert("Carga un GPX primero");
    await applyWizardSettings();
    showPreview();
}

function closeVideoReadyModal() {
    document.getElementById('modal-video-ready').classList.add('hidden');
    if (previewMode) {
        document.getElementById('video-overlay').classList.remove('hidden');
        document.getElementById('export-frame-guide').classList.remove('hidden');
        document.getElementById('text-toolbar').classList.remove('hidden');
        updateExportFrameGuide();
        setPreviewProgress(previewProgress);
    }
}

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
document.getElementById('btn-record-setup').addEventListener('click', () => {
    if (!points.length) return alert("Carga un GPX primero");
    if (!previewMode) {
        openWizard();
        return;
    }
    startRecordingVideo();
});
document.getElementById('btn-restart').addEventListener('click', () => { pause(); smoothedBearing = null; setPreviewProgress(0); });
document.getElementById('btn-loop').addEventListener('click', (e) => {
    loopEnabled = !loopEnabled;
    e.currentTarget.classList.toggle('text-blue-400', loopEnabled);
    e.currentTarget.classList.toggle('bg-blue-500/20', loopEnabled);
});

document.getElementById('btn-config').addEventListener('click', openWizard);
document.getElementById('btn-apply-wizard').addEventListener('click', showPreviewFromWizard);
document.getElementById('btn-start-record').addEventListener('click', showPreviewFromWizard);
document.getElementById('wizard-map-selector').addEventListener('change', (e) => {
    document.getElementById('map-selector').value = e.target.value;
    saveSettings();
});
document.getElementById('wizard-route-icon').addEventListener('input', (e) => {
    document.getElementById('route-icon').value = e.target.value;
    updateMarkerIcon();
    saveSettings();
});
document.getElementById('wizard-route-color').addEventListener('input', (e) => {
    document.getElementById('route-color').value = e.target.value;
    if (map.getLayer('route-line')) map.setPaintProperty('route-line', 'line-color', e.target.value);
    updatePreviewOverlay();
    saveSettings();
});
document.getElementById('input-view-mode').addEventListener('change', (e) => {
    is3D = e.target.value === '3d';
    document.getElementById('toggle-3d').classList.toggle('bg-blue-600', is3D);
    setupTerrainLayers();
    applyTerrainMode();
    saveSettings();
});
document.getElementById('camera-mode').addEventListener('change', (e) => {
    cameraMode = e.target.value;
    updateCameraModeUi();
    saveSettings();
});
document.getElementById('motion-mode').addEventListener('change', (e) => {
    motionMode = e.target.value;
    routePrefixIndex = -1;
    setPreviewProgress(previewProgress);
    saveSettings();
});
document.getElementById('terrain-exaggeration').addEventListener('input', (e) => {
    terrainExaggeration = parseFloat(e.target.value) || 1.5;
    updateTerrainExaggerationLabel();
    if (is3D) applyTerrainMode(false);
    saveSettings();
});
['input-title', 'input-date', 'check-header'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        updatePreviewOverlay();
        saveSettings();
    });
    document.getElementById(id).addEventListener('change', () => {
        updatePreviewOverlay();
        saveSettings();
    });
});
['check-km-flags', 'check-time-flags', 'km-flag-step', 'time-flag-step'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        showKmFlags = document.getElementById('check-km-flags').checked;
        showTimeFlags = document.getElementById('check-time-flags').checked;
        kmFlagStep = parseFloat(document.getElementById('km-flag-step').value) || 1;
        timeFlagStep = parseFloat(document.getElementById('time-flag-step').value) || 10;
        updateRouteFlags();
        setPreviewProgress(previewProgress);
        saveSettings();
    });
    document.getElementById(id).addEventListener('change', () => {
        showKmFlags = document.getElementById('check-km-flags').checked;
        showTimeFlags = document.getElementById('check-time-flags').checked;
        kmFlagStep = parseFloat(document.getElementById('km-flag-step').value) || 1;
        timeFlagStep = parseFloat(document.getElementById('time-flag-step').value) || 10;
        updateRouteFlags();
        setPreviewProgress(previewProgress);
        saveSettings();
    });
});
['input-ratio', 'input-quality', 'input-duration', 'input-linewidth'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        updateExportFrameGuide();
        setPreviewProgress(previewProgress);
        saveSettings();
    });
    document.getElementById(id).addEventListener('change', () => {
        updateExportFrameGuide();
        setPreviewProgress(previewProgress);
        saveSettings();
    });
});
document.getElementById('btn-add-text').addEventListener('click', addCustomText);
document.getElementById('btn-add-metric').addEventListener('click', addMetricText);
document.getElementById('btn-hide-text-panel').addEventListener('click', () => {
    document.getElementById('text-toolbar').classList.toggle('collapsed');
});
document.getElementById('text-content').addEventListener('input', (e) => updateSelectedText({ content: e.target.value }));
document.getElementById('text-size').addEventListener('input', (e) => updateSelectedText({ size: parseInt(e.target.value) || 42 }));
document.getElementById('text-color').addEventListener('input', (e) => updateSelectedText({ color: e.target.value }));
document.getElementById('text-font').addEventListener('change', (e) => updateSelectedText({ font: e.target.value }));
document.getElementById('metric-type').addEventListener('change', (e) => updateSelectedText({ metric: e.target.value }));
document.getElementById('btn-delete-text').addEventListener('click', () => {
    customTexts = customTexts.filter(t => t.id !== selectedTextId);
    selectedTextId = customTexts[0]?.id || null;
    renderCustomTexts();
    syncTextControls();
    saveSettings();
});

document.getElementById('btn-back-to-preview').addEventListener('click', closeVideoReadyModal);
document.getElementById('btn-close-video-ready').addEventListener('click', closeVideoReadyModal);

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

populateMetricOptions();
restoreSettings();
document.getElementById('toggle-3d').classList.toggle('bg-blue-600', is3D);
updateCameraModeUi();
updateTerrainExaggerationLabel();
renderCustomTexts();
syncTextControls();
updatePreviewOverlay();
updateExportFrameGuide();
updateExportControls();
window.addEventListener('DOMContentLoaded', initMap);
window.addEventListener('resize', updateExportFrameGuide);
