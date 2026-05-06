# Share Your Track

<p align="center">
  <strong>Turn your Strava, Garmin, Komoot or Wahoo GPX into a viral animated route video in seconds.</strong>
</p>

<p align="center">
  <a href="https://shareyourtrack.alon.one">
    <img alt="Live demo" src="https://img.shields.io/badge/try%20the%20demo-shareyourtrack.alon.one-2563eb?style=for-the-badge">
  </a>
  <a href="https://github.com/jalonsomerchan/shareyourtrack/stargazers">
    <img alt="GitHub stars" src="https://img.shields.io/github/stars/jalonsomerchan/shareyourtrack?style=for-the-badge&logo=github">
  </a>
  <a href="https://github.com/jalonsomerchan/shareyourtrack/issues">
    <img alt="GitHub issues" src="https://img.shields.io/github/issues/jalonsomerchan/shareyourtrack?style=for-the-badge">
  </a>
  <img alt="No backend" src="https://img.shields.io/badge/backend-not%20needed-success?style=for-the-badge">
</p>

<p align="center">
  <img alt="HTML5" src="https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white">
  <img alt="CSS3" src="https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=000">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind%20CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white">
  <img alt="MapLibre GL" src="https://img.shields.io/badge/MapLibre%20GL-map-blue?style=flat-square">
</p>

<p align="center">
  <a href="https://shareyourtrack.alon.one"><strong>🚴 Try it online</strong></a>
  ·
  <a href="#features"><strong>Features</strong></a>
  ·
  <a href="#why"><strong>Why</strong></a>
  ·
  <a href="#running-locally"><strong>Run locally</strong></a>
</p>

---

## Create social-ready route videos from GPX files

**Share Your Track** is a lightweight browser app that transforms outdoor activity tracks into beautiful animated videos. Upload a `.gpx` file, choose a map style, customize the route and export a video for Reels, TikTok, YouTube Shorts, Stories or any social platform.

<p align="center">
  <a href="https://shareyourtrack.alon.one">
    <img src="https://shareyourtrack.alon.one/og-image.jpg" alt="Share Your Track preview" width="900">
  </a>
</p>

<p align="center">
  <a href="https://shareyourtrack.alon.one">
    <img alt="Open Share Your Track" src="https://img.shields.io/badge/open%20the%20app-generate%20your%20route%20video-2563eb?style=for-the-badge">
  </a>
</p>

> Demo GIF coming soon. Add `demo.gif` to the repository root and replace this note with an embedded preview for maximum GitHub impact.

---

## Why

Most fitness apps are great at tracking activities, but exporting a beautiful short-form video is usually limited, locked behind a platform, or not customizable enough.

Share Your Track focuses on one simple idea:

> **Your GPX file should be enough to create a polished, shareable route video.**

No account. No backend. No installation. Just open the browser, upload the track and export.

---

## Try it online

👉 **[https://shareyourtrack.alon.one](https://shareyourtrack.alon.one)**

No account, backend, installation or API key is required. Upload a `.gpx` file exported from your favourite activity app and generate an animated route video from it.

---

## Perfect for

- Cyclists sharing weekend rides.
- Runners posting race routes.
- Hikers documenting trails.
- Travel creators showing road trips.
- Outdoor clubs creating social clips.
- Developers looking for a clean client-side GPX/video experiment.

---

## Features

### GPX import

- Load `.gpx` files from Garmin, Strava, Komoot, Wahoo and other activity platforms.
- Supports file picker and drag-and-drop upload.
- Parses route coordinates, timestamps, distance and elevation data.
- Validates that the GPX contains a usable track before rendering it.

### Animated route playback

- Play, pause and restart the route animation.
- Scrub through the activity using a timeline slider.
- Adjustable playback speed: `1×`, `10×`, `50×`, `200×` and `500×`.
- Optional loop mode for continuous route playback.
- Follow-camera mode that keeps the moving marker centered.
- Adjustable zoom level.

### Map styles

The app includes multiple map backgrounds:

- Dark map
- Light map
- Satellite imagery
- Terrain / relief map
- Topographic map
- Cycling map
- Street map
- ESRI topographic map

Map rendering is powered by **MapLibre GL JS** and raster tile providers such as CARTO, OpenStreetMap, OpenTopoMap, CyclOSM and ESRI.

### Route customization

- Change the route line color.
- Change the moving marker icon using any emoji.
- Enable or disable 3D perspective.
- Toggle follow-camera behavior.
- Customize route stroke width for video export.

### Video generation

Share Your Track includes a browser-side video export engine based on Canvas and MediaRecorder.

Supported export options:

- Vertical video: `9:16`, ideal for Instagram Reels, TikTok and YouTube Shorts.
- Square video: `1:1`, ideal for feed posts.
- Horizontal video: `16:9`, ideal for YouTube and landscape previews.
- Quality presets: `720p` and `1080p`.
- Custom duration from 5 to 120 seconds.
- Optional title overlay.
- Optional date overlay.
- Optional distance and average speed stats.
- Optional elevation gain stat.
- Optional progress bar.
- Download generated video.
- Share generated video using the Web Share API when supported by the browser.

---

## Share Your Track vs standard fitness app exports

| Feature | Share Your Track | Typical activity apps |
| --- | --- | --- |
| Upload any GPX file | ✅ | ⚠️ Often limited |
| Browser-only video export | ✅ | ❌ |
| 9:16, 1:1 and 16:9 formats | ✅ | ⚠️ Limited |
| Custom route color | ✅ | ⚠️ Limited |
| Custom emoji marker | ✅ | ❌ |
| Multiple map providers | ✅ | ⚠️ Platform-specific |
| No account required | ✅ | ❌ |
| Open source | ✅ | ❌ |

---

## How it works

1. The user uploads a GPX file.
2. The app parses the file with `gpxparser`.
3. The track points are drawn as a GeoJSON line on a MapLibre map.
4. A customizable emoji marker moves through the track using timestamp-based playback.
5. For video export, the app preloads map tiles along the route.
6. A hidden canvas compositor renders the map, marker, overlays and stats frame by frame.
7. `MediaRecorder` captures the canvas stream and creates a downloadable video blob.

This approach avoids any server-side rendering process and keeps the whole workflow inside the browser.

---

## Tech stack

| Area | Technology |
| --- | --- |
| Structure | HTML5 |
| Styling | CSS3, Tailwind CSS CDN |
| Logic | Vanilla JavaScript |
| Maps | MapLibre GL JS |
| GPX parsing | gpxparser |
| Video export | Canvas API, MediaRecorder API |
| Sharing | Web Share API |
| Icons | Font Awesome |
| Fonts | Inter |

---

## Project structure

```txt
shareyourtrack/
├── index.html        # Main UI and HTML structure
├── script.js         # GPX parsing, map logic, playback and video export
├── style.css         # Custom visual styles and UI refinements
├── og-image.jpg      # Social preview image
└── README.md
```

---

## Running locally

Because this is a static web app, you do not need Node.js, npm or a build step.

Clone the repository:

```bash
git clone https://github.com/jalonsomerchan/shareyourtrack.git
cd shareyourtrack
```

Start a local static server:

```bash
python3 -m http.server 8000
```

Open:

```txt
http://localhost:8000
```

You can also use any other static server, such as VS Code Live Server.

> Opening `index.html` directly from the filesystem may work for some features, but a local HTTP server is recommended for browser APIs and external assets.

---

## Usage

1. Open the demo or run the project locally.
2. Upload a `.gpx` file.
3. Choose a map style.
4. Customize the route color and marker emoji.
5. Use playback controls to preview the animation.
6. Click **Generate video**.
7. Choose format, quality, duration and overlay options.
8. Download or share the generated video.

---

## Browser compatibility

The app uses modern browser APIs. For best results, use an up-to-date Chromium-based browser such as Chrome, Edge or Brave.

Important APIs used:

- `FileReader`
- `CanvasRenderingContext2D`
- `HTMLCanvasElement.captureStream()`
- `MediaRecorder`
- `navigator.share()`
- `navigator.canShare()`

Some features, especially video recording and file sharing, may behave differently depending on browser and operating system support.

---

## Privacy

Share Your Track is designed as a client-side tool:

- GPX files are parsed in the browser.
- Video rendering happens in the browser.
- No backend is required to generate videos.
- The generated video is created locally as a browser blob.

The optional GPX sharing feature uploads the GPX file to an external temporary file-sharing service in order to create a shareable link.

---

## Known limitations

- Very large GPX files may be slow on low-powered devices.
- Video export depends on browser support for `MediaRecorder` and canvas capture.
- Available output formats depend on the browser. Most browsers will generate WebM; MP4 support may vary.
- Map tiles are loaded from third-party providers and are subject to their availability, usage policies and rate limits.
- Satellite and topographic tile rendering quality depends on the selected provider and zoom level.
- The app currently focuses on the first GPX track found in the file.

---

## Roadmap ideas

- Add automatic route simplification for very large GPX files.
- Add elevation profile overlays.
- Add more marker presets for running, hiking, cycling and driving.
- Add custom image markers.
- Add GPX metadata editing.
- Add route intro/outro templates.
- Add direct snapshot export as PNG.
- Add offline-friendly map fallback.
- Add multilingual UI.
- Add PWA installation support.

---

## Contributing

Contributions, ideas and bug reports are welcome.

You can help by:

- Reporting bugs through GitHub Issues.
- Suggesting new export templates.
- Improving browser compatibility.
- Adding more map styles.
- Optimizing performance for long tracks.
- Improving accessibility and keyboard navigation.

---

## License

No license file is currently included in this repository.

If you plan to reuse, modify or distribute this project, please contact the repository owner or add a license file to clarify the permitted usage.

---

## Author

Created by [Jorge Alonso](https://github.com/jalonsomerchan).

Repository: [github.com/jalonsomerchan/shareyourtrack](https://github.com/jalonsomerchan/shareyourtrack)
