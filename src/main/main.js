const path = require('path');
const { app, BrowserWindow, nativeTheme } = require('electron');
const { getBinaryPath } = require('./binary-paths');
const { ModelManager } = require('./models');
const { TranscriptionSession } = require('./transcription');
const { registerIpcHandlers } = require('./ipc-handlers');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const rendererPath = path.resolve(__dirname, '..', '..', 'dist', 'renderer', 'index.html');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    title: 'Electron Audio Transcriber',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const binaryOptions = {
    isPackaged: app.isPackaged,
    resourcesPath: app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..', '..', 'resources')
  };

  const modelManager = new ModelManager({
    getModelsDir: () => process.env.MODEL_CACHE_DIR || path.join(app.getPath('userData'), 'models')
  });

  const transcriptionSession = new TranscriptionSession({
    getTempPath: () => app.getPath('temp'),
    getFfmpegPath: () => getBinaryPath('ffmpeg', binaryOptions),
    getWhisperPath: () => getBinaryPath('whisper-cli', binaryOptions),
    modelManager
  });

  registerIpcHandlers({ window: mainWindow, transcriptionSession, modelManager });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(rendererPath);
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.setTitle(`Electron Audio Transcriber — ${nativeTheme.shouldUseDarkColors ? 'Dark' : 'Light'} mode`);
  });

  return mainWindow;
}

app.on('ready', () => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
