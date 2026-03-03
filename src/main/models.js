const fs = require('fs');
const path = require('path');
const https = require('https');
const { pipeline } = require('stream');
const { promisify } = require('util');
const EventEmitter = require('events');

const pipelineAsync = promisify(pipeline);
const MIN_MODEL_BYTES = 1024 * 1024;

const MODEL_REGISTRY = {
  'tiny.en': {
    label: 'Tiny English — 75MB',
    sizeInBytes: 75 * 1024 * 1024,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin'
  },
  'base.en': {
    label: 'Base English — 142MB',
    sizeInBytes: 142 * 1024 * 1024,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin'
  },
  'small.en': {
    label: 'Small English — 466MB',
    sizeInBytes: 466 * 1024 * 1024,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin'
  },
  'medium.en': {
    label: 'Medium English — 1.5GB',
    sizeInBytes: 1536 * 1024 * 1024,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin'
  },
  'large-v3': {
    label: 'Large v3 — 3GB',
    sizeInBytes: 3072 * 1024 * 1024,
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin'
  }
};

function ensureDirectory(dirPath) {
  return fs.promises.mkdir(dirPath, { recursive: true });
}

function readMagic(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    return buf.toString('latin1');
  } finally {
    fs.closeSync(fd);
  }
}

function isValidModelFile(filePath) {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size < MIN_MODEL_BYTES) return false;
    return readMagic(filePath) === 'lmgg';
  } catch {
    return false;
  }
}

function resolveRedirect(url, redirectsLeft) {
  if (redirectsLeft <= 0) {
    return Promise.reject(new Error('Too many redirects'));
  }

  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'electron-audio-transcriber/0.1',
        Accept: 'application/octet-stream,*/*'
      }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const next = new URL(response.headers.location, url).toString();
        response.resume();
        resolve(resolveRedirect(next, redirectsLeft - 1));
        return;
      }

      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`Failed to download ${url} (${response.statusCode})`));
        return;
      }

      const total = Number(response.headers['content-length'] || 0);
      resolve({ response, total });
    });

    request.on('error', reject);
  });
}

async function downloadWithProgress(url, destination, onProgress) {
  const { response, total } = await resolveRedirect(url, 8);
  const fileStream = fs.createWriteStream(destination);
  let downloaded = 0;

  response.on('data', (chunk) => {
    downloaded += chunk.length;
    if (total) {
      const percent = Math.min(100, Math.round((downloaded / total) * 100));
      onProgress?.({ total, downloaded, percent });
    } else {
      onProgress?.({ total: null, downloaded, percent: null });
    }
  });

  await pipelineAsync(response, fileStream);
}

class ModelManager extends EventEmitter {
  constructor({ getModelsDir }) {
    super();
    this.getModelsDir = getModelsDir;
    this.activeDownloads = new Map();
  }

  async _ensureModelsDir() {
    const dir = this.getModelsDir();
    await ensureDirectory(dir);
    return dir;
  }

  getModelPath(modelName) {
    const dir = this.getModelsDir();
    return path.join(dir, `ggml-${modelName}.bin`);
  }

  isModelDownloaded(modelName) {
    return isValidModelFile(this.getModelPath(modelName));
  }

  getModels() {
    return Object.entries(MODEL_REGISTRY).map(([name, meta]) => ({
      name,
      label: meta.label,
      sizeInBytes: meta.sizeInBytes,
      downloaded: this.isModelDownloaded(name)
    }));
  }

  async downloadModel(modelName) {
    if (!MODEL_REGISTRY[modelName]) {
      throw new Error(`Unknown model ${modelName}`);
    }

    if (this.activeDownloads.has(modelName)) {
      return this.activeDownloads.get(modelName);
    }

    const downloadPromise = (async () => {
      const dir = await this._ensureModelsDir();
      const meta = MODEL_REGISTRY[modelName];
      const tempPath = path.join(dir, `ggml-${modelName}.bin.tmp`);
      const finalPath = this.getModelPath(modelName);

      if (isValidModelFile(finalPath)) {
        return finalPath;
      }

      await fs.promises.rm(finalPath, { force: true });
      await fs.promises.rm(tempPath, { force: true });

      try {
        await downloadWithProgress(meta.url, tempPath, (progress) => {
          this.emit('download-progress', {
            model: modelName,
            ...progress
          });
        });

        if (!isValidModelFile(tempPath)) {
          throw new Error(`Downloaded model ${modelName} failed integrity check`);
        }

        await fs.promises.rename(tempPath, finalPath);
        this.emit('download-progress', {
          model: modelName,
          total: meta.sizeInBytes,
          downloaded: meta.sizeInBytes,
          percent: 100
        });

        return finalPath;
      } finally {
        await fs.promises.rm(tempPath, { force: true });
      }
    })();

    this.activeDownloads.set(modelName, downloadPromise);
    const cleanup = () => this.activeDownloads.delete(modelName);
    downloadPromise.then(cleanup, cleanup);
    return downloadPromise;
  }
}

module.exports = {
  ModelManager,
  MODEL_REGISTRY,
  isValidModelFile
};
