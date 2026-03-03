const path = require('path');
const { getBinaryPath } = require('../../src/main/binary-paths');

const resourcesPath = path.resolve(__dirname, '..', '..', 'resources');

test('returns ffmpeg from ffmpeg-static', () => {
  const ffmpegPath = getBinaryPath('ffmpeg', { isPackaged: false });
  expect(ffmpegPath).toContain('ffmpeg');
});

test('resolves whisper-cli path for current platform', () => {
  const whisperPath = getBinaryPath('whisper-cli', { isPackaged: false, resourcesPath });
  expect(whisperPath).toContain(process.platform);
  if (process.platform === 'win32') {
    expect(whisperPath.endsWith('.exe')).toBe(true);
  }
});
