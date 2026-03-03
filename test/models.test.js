const os = require('os');
const path = require('path');
const { TranscriptionSession } = require('../src/main/transcription');
const { getBinaryPath } = require('../src/main/binary-paths');
const { ModelManager } = require('../src/main/models');

const resourcesPath = path.resolve(__dirname, '..', 'resources');
const ffmpegPath = getBinaryPath('ffmpeg', { isPackaged: false });
const whisperPath = getBinaryPath('whisper-cli', { isPackaged: false, resourcesPath });
const cacheDir = path.join(os.tmpdir(), 'electron-transcriber-models');
const modelManager = new ModelManager({ getModelsDir: () => cacheDir });

const MODELS_TO_TEST = process.env.CI ? ['tiny.en'] : ['tiny.en', 'base.en'];

jest.setTimeout(300000);

describe.each(MODELS_TO_TEST)('model: %s', (modelName) => {
  test('transcribes jfk.wav', async () => {
    const session = new TranscriptionSession({
      getTempPath: () => os.tmpdir(),
      getFfmpegPath: () => ffmpegPath,
      getWhisperPath: () => whisperPath,
      modelManager
    });

    const transcript = await session.transcribe(
      path.join(resourcesPath, 'test-fixtures', 'jfk.wav'),
      modelName
    );

    expect(transcript.toLowerCase()).toContain('country');
  });
});
