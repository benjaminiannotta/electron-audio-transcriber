const path = require('path');
const { validateFilePath, validateModelName } = require('../../src/main/ipc-handlers');

const fixtureDir = path.resolve(__dirname, '..', '..', 'resources', 'test-fixtures');
const allowed = [fixtureDir];

function buildPath(relative) {
  return path.join(fixtureDir, relative);
}

test('rejects non-string file paths', () => {
  expect(() => validateFilePath(123, { allowedDirectories: allowed })).toThrow('Invalid path');
  expect(() => validateFilePath(null, { allowedDirectories: allowed })).toThrow('Invalid path');
});

test('rejects paths outside allowed directories', () => {
  expect(() => validateFilePath('/etc/passwd', { allowedDirectories: allowed })).toThrow('outside allowed');
  expect(() => validateFilePath(path.join('..', '..', 'etc', 'passwd'), { allowedDirectories: allowed })).toThrow('outside allowed');
});

test('validates allowed path', () => {
  const valid = path.join(fixtureDir, 'jfk.wav');
  expect(() => validateFilePath(valid, { allowedDirectories: allowed })).not.toThrow();
});

test('rejects invalid model names', () => {
  expect(() => validateModelName('unknown')).toThrow('Invalid model selected');
});
