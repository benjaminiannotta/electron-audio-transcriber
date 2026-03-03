const fs = require('fs');
const path = require('path');
const https = require('https');
const { pipeline } = require('stream');
const { promisify } = require('util');
const EventEmitter = require('events');

const pipelineAsync = promisify(pipeline);

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

function resolveRedirect(url, redirectsLeft) {
  if (redirectsLeft <= 0) {
    return Promise.reject(new Error('Too many redirects')); 
  }

  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        resolve(resolveRedirect(response.headers.location, redirectsLeft - 1));
        return;
      }

      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`Failed to download ${url} (${response.statusCode})`));
        return;
      }

      const total = Number(response.headers['content-length'] || 0);
      let downloaded = 0;
      response.on('data', (chunk) => {
        downloaded += chunk.length;
      });

      resolve({ response, total });
    });

    request.on('error', reject);
  });
}

async function downloadWithProgress(url, destination, onProgress) {
  const { response, total } = await resolveRedirect(url, 5);
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
    try {
      const stats = fs.statSync(this.getModelPath(modelName));
      return stats.isFile() && stats.size > 1024;
    } catch (error) {
      return false;
    }
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

      if (fs.existsSync(finalPath)) {
        return finalPath;
      }

      await fs.promises.rm(tempPath, { force: true });
      await downloadWithProgress(meta.url, tempPath, (progress) => {
        this.emit('download-progress', {
          model: modelName,
          ...progress
        });
      });

      await fs.promises.rename(tempPath, finalPath);
      this.emit('download-progress', {
        model: modelName,
        total: meta.sizeInBytes,
        downloaded: meta.sizeInBytes,
        percent: 100
      });

      return finalPath;
    })();

    this.activeDownloads.set(modelName, downloadPromise);
    const cleanup = () => this.activeDownloads.delete(modelName);
    downloadPromise.then(cleanup, cleanup);
    return downloadPromise;
  }
}

module.exports = {
  ModelManager,
  MODEL_REGISTRY
};
