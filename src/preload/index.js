const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

const ALLOWED_EXTENSIONS = new Set(['.mp3', '.m4a', '.ogg', '.flac', '.wav', '.webm', '.mp4']);

function ensureSafeFilePath(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Invalid path');
  }

  const normalized = path.normalize(filePath);
  if (normalized.includes('..' + path.sep)) {
    throw new Error('Path traversal detected');
  }

  const ext = path.extname(normalized).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('Unsupported audio format');
  }

  return normalized;
}

function ensureValidModel(modelName) {
  if (typeof modelName !== 'string' || !modelName.trim()) {
    throw new Error('Invalid model');
  }
  return modelName;
}

contextBridge.exposeInMainWorld('api', {
  transcribe: (filePath) => {
    const safePath = ensureSafeFilePath(filePath);
    return ipcRenderer.invoke('transcribe', safePath);
  },
  getProgress: () => ipcRenderer.invoke('get-progress'),
  onProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('transcription-progress', handler);
    return () => ipcRenderer.removeListener('transcription-progress', handler);
  },
  getModels: () => ipcRenderer.invoke('get-models'),
  selectModel: (modelName) => {
    const safeModel = ensureValidModel(modelName);
    return ipcRenderer.invoke('select-model', safeModel);
  },
  downloadModel: (modelName) => {
    const safeModel = ensureValidModel(modelName);
    return ipcRenderer.invoke('download-model', safeModel);
  },
  onDownloadProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },
  cancelTranscription: () => ipcRenderer.invoke('cancel-transcription'),
  saveTranscript: (text) => ipcRenderer.invoke('save-transcript', text)
});
