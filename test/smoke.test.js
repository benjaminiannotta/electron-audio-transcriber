const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const { execFile } = require('child_process');
const { TranscriptionSession } = require('../src/main/transcription');
const { getBinaryPath } = require('../src/main/binary-paths');
const { ModelManager } = require('../src/main/models');

const execFileAsync = util.promisify(execFile);
const resourcesPath = path.resolve(__dirname, '..', 'resources');
const fixturePath = path.join(resourcesPath, 'test-fixtures', 'jfk.wav');
const ffmpegPath = getBinaryPath('ffmpeg', { isPackaged: false });
const whisperPath = getBinaryPath('whisper-cli', { isPackaged: false, resourcesPath });
const cacheDir = path.join(os.tmpdir(), 'electron-transcriber-models');
const modelManager = new ModelManager({
  getModelsDir: () => cacheDir
});

function hasExecutableWhisper() {
  try {
    fs.accessSync(whisperPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

jest.setTimeout(200000);

test('full pipeline: audio produces expected keyword', async () => {
  const ffmpegVersion = (await execFileAsync(ffmpegPath, ['-version'])).stdout;
  expect(ffmpegVersion).toContain('ffmpeg version');

  const session = new TranscriptionSession({
    getTempPath: () => os.tmpdir(),
    getFfmpegPath: () => ffmpegPath,
    getWhisperPath: () => whisperPath,
    modelManager
  });

  const preprocessed = await session.preprocessAudio(fixturePath);
  expect(fs.existsSync(preprocessed)).toBe(true);

  if (!hasExecutableWhisper()) {
    expect(fs.statSync(preprocessed).size).toBeGreaterThan(1000);
    return;
  }

  const whisperHelp = (await execFileAsync(whisperPath, ['--help'])).stdout;
  expect(whisperHelp.length).toBeGreaterThan(0);

  const transcript = await session.transcribe(fixturePath, 'tiny.en');
  expect(transcript.toLowerCase()).toContain('country');
});
