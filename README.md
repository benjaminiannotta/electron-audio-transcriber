# Electron Audio Transcriber

Offline-first desktop transcription using Electron, Whisper.cpp (via `whisper-cli`) and FFmpeg preprocessing. The app ships with a renderer built with Vite, a secure preload bridge, and tests that cover the binary path helpers, preprocessing expectations, and the full transcription pipeline.

## Highlights

- **Secure IPC** via a `contextBridge`-only API (`transcribe`, `getModels`, `downloadModel`, `cancelTranscription`, etc.).
- **Whisper binary/support** resolved using packaged-aware helpers (`ffmpeg-static` + `/resources/bin/{platform}/whisper-cli`).
- **Audio preprocessing** ensures every file is converted to 16 kHz mono PCM before Whisper runs.
- **Model download manager** keeps Whisper models in `%APPDATA%/Electron Audio Transcriber/models` and reports progress to the UI.
- **Modern UI** with drag-and-drop, dark mode, real-time progress, copy/save actions, and contextual error states built with Vite (Vanilla JS).
- **Tests** enforce binary resolution, preprocessing expectations, IPC validation, smoke runs, and a model matrix.

## Supported Models

| Model | Size | CI | Notes |
|---|---|---|---|
| `tiny.en` | 75 MB | ✅ | Default for CI.
| `base.en` | 142 MB | ⚠️ | Recommended for local accuracy checks.
| `small.en` | 466 MB | ❌ | Local only.
| `medium.en` | 1.5 GB | ❌ | Local only.
| `large-v3` | 3 GB | ❌ | Best accuracy, multilingual.

Models download to the user data directory on demand.

## Getting Started

```bash
# Install dependencies
PATH=/workspace/node-v20.19.0-linux-x64/bin:$PATH npm install

# Build the renderer, then run Electron in dev
npm run dev:vite      # runs Vite dev server (http://localhost:5173)
npm run dev:electron  # launch Electron, connects to the dev server
```

In production (`npm start`) the renderer is built via Vite before Electron launches.

## Testing

- `npm run test:unit` — binary paths, preprocessing expectations (requires ffmpeg/ffprobe), IPC validation.
- `npm run test:smoke` — full pipeline (`jfk.wav` → preprocess → Whisper) with `tiny.en` (120s timeout).
- `npm run test:models` — model matrix. In CI, only `tiny.en` runs; locally it also runs `base.en`.

The smoke/tests assume the `resources/bin/{platform}/whisper-cli` binary and the Whisper models (downloaded on first use). CI should call `npm run download-model tiny.en` beforehand.

## Building & Packaging

```bash
npm run build:renderer
npm run package
```

`electron-builder` reads `electron-builder.yml`; the renderer bundle is injected via Vite output in `dist/renderer` and packaged alongside the main process.

## Architecture

- `src/main/` — main process helpers (binary resolution, model manager, transcription session, IPC handlers).
- `src/preload/` — safe bridge (`window.api`) with validation.
- `src/renderer/` — UI built with plain JS/CSS and Vite.
- `resources/bin/{platform}/` — platform-specific Whisper binaries (not bundled in CI artifacts).
- `resources/test-fixtures/jfk.wav` — smoke test audio (public domain).
- `test/` — Jest smoke, model matrix, and unit tests.

## CI

See `.github/workflows/ci.yml` for the lint/unit job and the matrix build/smoke pipelines across Linux, macOS, and Windows. Each matrix job installs `tiny.en` ahead of time (`node scripts/download-model.js tiny.en`).

## Debugging

- Use the built-in progress bar/status messages for real-time insight.
- Check `~/.config/<app>/logs` (platform dependent) for spinner logs.
- If Whisper fails, run `resources/bin/<platform>/whisper-cli --help` to ensure the binary is executable.
