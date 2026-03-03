const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

const execFileAsync = (file, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: stdout?.toString('utf8') || '', stderr: stderr?.toString('utf8') || '' });
    });
  });

class TranscriptionSession extends EventEmitter {
  constructor({ getTempPath, getFfmpegPath, getWhisperPath, modelManager }) {
    super();
    this.getTempPath = getTempPath;
    this.getFfmpegPath = getFfmpegPath;
    this.getWhisperPath = getWhisperPath;
    this.modelManager = modelManager;
    this.currentProcess = null;
    this.progressTicker = null;
    this.progress = { status: 'idle', percent: 0, message: 'Waiting' };
  }

  _emitProgress(payload) {
    this.progress = { ...this.progress, ...payload };
    this.emit('progress', this.progress);
  }

  _startTicker() {
    this._stopTicker();
    this.progressTicker = setInterval(() => {
      if (this.progress.percent < 95) {
        const next = Math.min(95, this.progress.percent + 3);
        this._emitProgress({ percent: next });
      }
    }, 1200);
  }

  _stopTicker() {
    if (this.progressTicker) {
      clearInterval(this.progressTicker);
      this.progressTicker = null;
    }
  }

  cancel() {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGINT');
      this.currentProcess = null;
    }
    this._stopTicker();
    this._emitProgress({ status: 'cancelled', percent: 0, message: 'Cancelled' });
  }

  async preprocessAudio(inputPath) {
    const ffmpegPath = this.getFfmpegPath();
    const tempDir = this.getTempPath();
    const outputPath = path.join(tempDir, `preprocessed-${Date.now()}.wav`);
    await execFileAsync(ffmpegPath, [
      '-i', inputPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      '-y',
      outputPath
    ]);
    return outputPath;
  }

  async transcribe(inputPath, modelName) {
    if (!this.modelManager) {
      throw new Error('Model manager not initialized');
    }

    this._emitProgress({ status: 'preprocessing', percent: 5, message: 'Preprocessing audio' });

    const wavPath = await this.preprocessAudio(inputPath);
    this._emitProgress({ status: 'preprocessed', percent: 15, message: 'Audio ready' });

    const modelPath = await this.modelManager.downloadModel(modelName);

    const whisperPath = this.getWhisperPath();
    if (!whisperPath) {
      throw new Error('Whisper binary path invalid');
    }

    const args = [
      '-m', modelPath,
      '-f', wavPath,
      '--output-txt',
      '--no-timestamps'
    ];

    this._emitProgress({ status: 'transcribing', percent: 20, message: 'Running Whisper' });
    this._startTicker();

    return new Promise((resolve, reject) => {
      this.currentProcess = execFile(whisperPath, args, { timeout: 300000 }, (error, stdout, stderr) => {
        this._stopTicker();
        this.currentProcess = null;

        if (error) {
          this._emitProgress({ status: 'failed', percent: 0, message: 'Whisper failed' });
          reject(error);
          return;
        }

        const transcript = stdout?.toString('utf8').trim();
        this._emitProgress({ status: 'complete', percent: 100, message: 'Transcription complete' });
        resolve(transcript);
      });

      if (this.currentProcess.stdout) {
        this.currentProcess.stdout.on('data', () => {
          // keep the ticker moving
        });
      }
    });
  }

  getProgress() {
    return this.progress;
  }
}

module.exports = {
  TranscriptionSession
};
