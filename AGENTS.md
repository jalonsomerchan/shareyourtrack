# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Running the project

This is a static web app served via MAMP. Open it at `http://localhost/shareyourtrack/` (or equivalent MAMP port). No build step, no package manager — just open in a browser.

## Architecture

Single-page application with three files:
- `index.html` — all UI markup (Tailwind via CDN, Font Awesome, Google Fonts)
- `script.js` — all application logic as vanilla JS globals
- `style.css` — custom styles beyond Tailwind

### External dependencies (CDN only, no npm)
- **MapLibre GL 3.6.2** — map rendering with `preserveDrawingBuffer: true` (required for canvas capture)
- **gpxparser 3.0.8** — parses uploaded `.gpx` files into `track.points[]`
- **RecordRTC 5.6.2** — imported but not used in current implementation (kept in HTML)
- **html2canvas 1.4.1** — imported but not used in current implementation (kept in HTML)

### Core data flow
1. User uploads a `.gpx` file → parsed into global `points[]` array (each point has `.lat`, `.lon`, `.time`, `.ele`)
2. `processTrack()` sets up the MapLibre `route` GeoJSON source and timeline range input
3. `animate()` / `play()` / `pause()` drive playback via `requestAnimationFrame`, advancing `currentIndex` based on real elapsed GPS time scaled by `playbackSpeed`
4. `updatePosition(index)` updates the map marker, draws the route line up to current index, and optionally follows camera

### Video recording engine
The recording pipeline avoids `getDisplayMedia` (screen capture) entirely:
1. MapLibre map is initialized with `preserveDrawingBuffer: true` — allows `map.getCanvas()` to be read
2. On record start, the `#map-container` is resized to match the target aspect ratio in the UI
3. An offscreen `<canvas>` is created at full resolution (e.g. 720×1280 for 9:16)
4. `renderLoop()` runs via `requestAnimationFrame`: copies `map.getCanvas()` → record canvas, then draws emoji marker and stats overlay via `drawProOverlayLegacy()`
5. `recordCanvas.captureStream(30)` feeds a `MediaRecorder` → outputs `.webm`
6. Playback speed is auto-calculated so the full GPX track fits within the user-specified duration

### Map style switching
Map styles are switched by mutating the current style object's tile URL and calling `map.setStyle()`. The `style.load` event re-runs `setupMapLayers()` to re-add the route source and layer after each style change.

### Key globals
- `points[]` — parsed GPX track points
- `currentIndex` — current playback position
- `playbackSpeed` — multiplier over real GPS time (default 50x, auto-set during recording)
- `followCamera` — whether map pans to follow current position
- `is3D` — whether map pitch is at 60°
- `rawGpx` — raw GPX file string (used for share feature)
