const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');
const { TranscriptionSession } = require('../../src/main/transcription');
const { getBinaryPath } = require('../../src/main/binary-paths');
const ffprobePath = require('ffprobe-static').path;

const execFileAsync = util.promisify(execFile);
const resourcesPath = path.resolve(__dirname, '..', '..', 'resources');
const fixturePath = path.join(resourcesPath, 'test-fixtures', 'jfk.wav');

const transcriptionSession = new TranscriptionSession({
  getTempPath: () => os.tmpdir(),
  getFfmpegPath: () => getBinaryPath('ffmpeg', { isPackaged: false }),
  getWhisperPath: () => getBinaryPath('whisper-cli', { isPackaged: false, resourcesPath }),
  modelManager: {
    downloadModel: () => Promise.resolve(''),
    getModelPath: () => ''
  }
});

test('preprocessAudio produces 16kHz mono WAV', async () => {
  const outputPath = await transcriptionSession.preprocessAudio(fixturePath);
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=sample_rate,channels,codec_name',
      '-of', 'json',
      outputPath
    ]);
    const info = JSON.parse(stdout);
    expect(info.streams[0].sample_rate).toBe('16000');
    expect(info.streams[0].channels).toBe(1);
    expect(info.streams[0].codec_name).toBe('pcm_s16le');
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
});
