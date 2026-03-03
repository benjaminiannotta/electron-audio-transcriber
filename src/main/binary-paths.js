const path = require('path');
const ffmpegStatic = require('ffmpeg-static');

const DEFAULT_PLATFORM = process.platform;

function resolveResourcesPath() {
  return path.resolve(__dirname, '..', '..', 'resources');
}

function getPlatformExtension(platform = DEFAULT_PLATFORM) {
  return platform === 'win32' ? '.exe' : '';
}

function getFfmpegPath({ isPackaged = false } = {}) {
  let resolved = ffmpegStatic;
  if (isPackaged && typeof resolved === 'string') {
    resolved = resolved.replace('app.asar', 'app.asar.unpacked');
  }
  return resolved;
}

function resolveSelfManagedBinary(binaryName, { platform = DEFAULT_PLATFORM, resourcesPath, isPackaged = false } = {}) {
  const ext = getPlatformExtension(platform);
  const fileName = `${binaryName}${ext}`;
  const baseResources = resourcesPath || resolveResourcesPath();

  if (isPackaged) {
    return path.join(baseResources, 'bin', fileName);
  }

  return path.join(baseResources, 'bin', platform, fileName);
}

function getBinaryPath(binaryName, options = {}) {
  if (binaryName === 'ffmpeg') {
    return getFfmpegPath(options);
  }

  if (binaryName === 'whisper-cli') {
    return resolveSelfManagedBinary(binaryName, options);
  }

  throw new Error(`Unknown binary name: ${binaryName}`);
}

module.exports = {
  getBinaryPath,
  getFfmpegPath,
  resolveSelfManagedBinary
};
