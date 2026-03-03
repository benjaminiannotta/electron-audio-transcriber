const { app, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { MODEL_REGISTRY } = require('./models');

const ALLOWED_EXTENSIONS = new Set(['.mp3', '.m4a', '.ogg', '.flac', '.wav', '.webm', '.mp4']);

function getAllowedDirectories(appInstance) {
  const base = path.resolve(__dirname, '..', '..');
  const effectiveApp = appInstance || app;
  return [
    path.join(base, 'resources', 'test-fixtures'),
    effectiveApp?.getPath('downloads'),
    effectiveApp?.getPath('documents'),
    effectiveApp?.getPath('desktop'),
    effectiveApp?.getPath('music'),
    effectiveApp?.getPath('temp')
  ]
    .filter(Boolean)
    .map((dir) => path.resolve(dir));
}

function validateFilePath(filePath, options = {}) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Invalid path');
  }

  const normalized = path.resolve(filePath);
  const allowed = options.allowedDirectories || getAllowedDirectories(options.appInstance);
  if (!allowed.some((root) => normalized.startsWith(root))) {
    throw new Error('Path outside allowed directories');
  }

  if (!fs.existsSync(normalized)) {
    throw new Error('File does not exist');
  }

  const ext = path.extname(normalized).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('Unsupported audio format');
  }

  return normalized;
}

function validateModelName(modelName) {
  if (typeof modelName !== 'string' || !MODEL_REGISTRY[modelName]) {
    throw new Error('Invalid model selected');
  }
  return modelName;
}

function registerIpcHandlers(options) {
  const { window, transcriptionSession, modelManager } = options;
  let currentModel = 'tiny.en';

  const sendProgress = (payload) => {
    window?.webContents?.send('transcription-progress', payload);
    if (window?.setProgressBar) {
      const percent = Math.max(0, Math.min(1, (payload.percent || 0) / 100));
      window.setProgressBar(payload.status === 'transcribing' ? percent : -1);
    }
  };

  transcriptionSession.on('progress', sendProgress);
  modelManager.on('download-progress', (payload) => {
    window?.webContents?.send('download-progress', payload);
  });

  ipcMain.handle('transcribe', async (_event, filePath) => {
    const cleanPath = validateFilePath(filePath);
    return transcriptionSession.transcribe(cleanPath, currentModel);
  });

  ipcMain.handle('get-progress', () => transcriptionSession.getProgress());

  ipcMain.handle('get-models', () => modelManager.getModels());

  ipcMain.handle('select-model', (_event, modelName) => {
    currentModel = validateModelName(modelName);
    return currentModel;
  });

  ipcMain.handle('download-model', async (_event, modelName) => {
    const validModel = validateModelName(modelName);
    return modelManager.downloadModel(validModel);
  });

  ipcMain.handle('cancel-transcription', () => {
    transcriptionSession.cancel();
  });

  ipcMain.handle('save-transcript', async (_event, transcript) => {
    if (typeof transcript !== 'string') {
      throw new Error('Transcript must be a string');
    }

    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      title: 'Save transcription',
      defaultPath: path.join(app.getPath('documents'), 'transcript.txt'),
      filters: [{ name: 'Text', extensions: ['txt'] }]
    });

    if (canceled || !filePath) {
      return null;
    }

    await fs.promises.writeFile(filePath, transcript, 'utf8');
    return filePath;
  });
}

module.exports = {
  registerIpcHandlers,
  validateFilePath,
  validateModelName,
  getAllowedDirectories
};
