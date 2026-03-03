import './styles.css';

const root = document.getElementById('root');
root.innerHTML = `
  <div class="app-shell">
    <div class="card">
      <div id="drop-zone" class="drop-zone">
        <div class="badge">Drop audio</div>
        <h1>Drag & drop an audio file</h1>
        <p>Whisper-ready preprocessing will run automatically.</p>
        <p class="supported">Supported: mp3, m4a, ogg, flac, wav, webm, mp4</p>
      </div>
    </div>

    <div class="card output-area empty" id="output-area">
      <pre id="transcript">Drop a file or browse to begin.</pre>
      <div class="bottom-actions">
        <button id="copy-btn" class="secondary" disabled>Copy transcript</button>
        <button id="save-btn" class="secondary" disabled>Save transcript</button>
      </div>
    </div>

    <div class="card controls">
      <div>
        <label for="model-select">Whisper model</label>
        <select id="model-select"></select>
        <div id="model-status" class="status-line">Loading models...</div>
        <button id="download-model-btn" class="secondary" style="margin-top: 8px; display: none;">Download model</button>
      </div>

      <div class="button-row">
        <button id="start-btn" disabled>Transcribe</button>
        <button id="cancel-btn" class="secondary danger" disabled>Cancel</button>
      </div>

      <label for="file-picker" class="status-line">Or browse:</label>
      <input type="file" id="file-picker" accept=".mp3,.m4a,.ogg,.flac,.wav,.webm,.mp4" />

      <div class="progress-group">
        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
        <div class="status-line" id="status-line">Idle</div>
      </div>
    </div>
  </div>
`;

const dropZone = document.getElementById('drop-zone');
const transcriptEl = document.getElementById('transcript');
const outputArea = document.getElementById('output-area');
const copyBtn = document.getElementById('copy-btn');
const saveBtn = document.getElementById('save-btn');
const startBtn = document.getElementById('start-btn');
const cancelBtn = document.getElementById('cancel-btn');
const filePicker = document.getElementById('file-picker');
const modelSelect = document.getElementById('model-select');
const modelStatus = document.getElementById('model-status');
const downloadModelBtn = document.getElementById('download-model-btn');
const progressFill = document.getElementById('progress-fill');
const statusLine = document.getElementById('status-line');

let selectedFilePath = null;
let currentModel = 'tiny.en';
let transcriptText = '';
let isTranscribing = false;
let models = [];

function setStatus(message) {
  statusLine.textContent = message;
}

function setProgress(percent) {
  progressFill.style.width = `${percent}%`;
}

function handleFilePicked(filePath) {
  selectedFilePath = filePath;
  dropZone.querySelector('h1').textContent = pathBasename(filePath);
  startBtn.disabled = !filePath;
}

function pathBasename(filePath) {
  return filePath ? filePath.split(/[/\\]/).pop() : 'No file';
}

function toggleOutputArea(hasText) {
  outputArea.classList.toggle('empty', !hasText);
  copyBtn.disabled = !hasText;
  saveBtn.disabled = !hasText;
}

async function refreshModels() {
  models = await window.api.getModels();
  downloadModelBtn.disabled = false;
  modelSelect.innerHTML = '';

  models.forEach((model) => {
    const option = document.createElement('option');
    option.value = model.name;
    option.textContent = model.label;
    if (!model.downloaded) {
      option.textContent += ' • needs download';
    }
    modelSelect.appendChild(option);
  });

  modelSelect.value = currentModel;
  await window.api.selectModel(currentModel);
  updateModelStatus();
}

function updateModelStatus(message) {
  const model = models.find((item) => item.name === currentModel);
  if (!model) {
    modelStatus.textContent = 'No model selected';
    downloadModelBtn.style.display = 'none';
    return;
  }

  if (message) {
    modelStatus.textContent = message;
  } else if (!model.downloaded) {
    modelStatus.textContent = `${model.label} is not cached. Download before transcribing.`;
    downloadModelBtn.style.display = 'inline-flex';
  } else {
    modelStatus.textContent = `${model.label} is ready.`;
    downloadModelBtn.style.display = 'none';
  }
}

modelSelect.addEventListener('change', async (event) => {
  currentModel = event.target.value;
  await window.api.selectModel(currentModel);
  updateModelStatus();
});

downloadModelBtn.addEventListener('click', async () => {
  downloadModelBtn.disabled = true;
  updateModelStatus('Downloading model...');
  await window.api.downloadModel(currentModel);
  await refreshModels();
});

filePicker.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file?.path) {
    handleFilePicked(file.path);
  }
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.add('active');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.remove('active');
  });
});

dropZone.addEventListener('drop', (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file?.path) {
    handleFilePicked(file.path);
  }
});

startBtn.addEventListener('click', async () => {
  if (!selectedFilePath || isTranscribing) {
    return;
  }

  isTranscribing = true;
  startBtn.disabled = true;
  cancelBtn.disabled = false;
  setStatus('Preparing audio...');
  setProgress(0);

  try {
    const transcript = await window.api.transcribe(selectedFilePath);
    transcriptText = transcript || 'No text recovered.';
    transcriptEl.textContent = transcriptText;
    toggleOutputArea(Boolean(transcriptText));
    setStatus('Transcript ready');
  } catch (error) {
    setStatus(error.message || 'Error during transcription');
  } finally {
    isTranscribing = false;
    startBtn.disabled = false;
    cancelBtn.disabled = true;
  }
});

cancelBtn.addEventListener('click', () => {
  window.api.cancelTranscription();
});

copyBtn.addEventListener('click', async () => {
  if (!transcriptText) {
    return;
  }
  await navigator.clipboard.writeText(transcriptText);
  setStatus('Copied to clipboard');
});

saveBtn.addEventListener('click', async () => {
  if (!transcriptText) {
    return;
  }
  await window.api.saveTranscript(transcriptText);
});

window.api.onProgress((payload) => {
  setStatus(payload.message || payload.status || 'Working...');
  setProgress(payload.percent || 0);
});

window.api.onDownloadProgress((payload) => {
  if (payload?.model === currentModel) {
    const percent = payload.percent ?? 0;
    updateModelStatus(`Downloading ${currentModel} — ${percent}%`);
    if (percent >= 100) {
      refreshModels();
    }
  }
});

window.addEventListener('DOMContentLoaded', () => {
  refreshModels();
});
