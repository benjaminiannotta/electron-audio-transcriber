const path = require('path');
const { ModelManager } = require('../src/main/models');

const targetDir = process.env.MODEL_CACHE_DIR || path.resolve(__dirname, '..', 'model-cache');
const manager = new ModelManager({ getModelsDir: () => targetDir });
const requested = process.argv.slice(2);

if (!requested.length) {
  console.error('Usage: node scripts/download-model.js <model-name> [more-models]');
  process.exit(1);
}

(async () => {
  for (const name of requested) {
    console.log(`Downloading ${name}...`);
    const location = await manager.downloadModel(name);
    console.log(`Saved ${name} to ${location}`);
  }
})();
