import { MSG } from '../utils/messages.js';
import { getSettings, getCalibration, onStorageChanged } from '../utils/storage.js';

const statusPill = document.getElementById('status-pill');
const calibrationHint = document.getElementById('calibration-hint');
const toggleBtn = document.getElementById('toggle-btn');
const calibrateBtn = document.getElementById('calibrate-btn');
const clickModeRadios = document.querySelectorAll('input[name="clickMode"]');
const dwellField = document.getElementById('dwell-time-field');
const dwellInput = document.getElementById('dwell-time');
const dwellValue = document.getElementById('dwell-time-value');
const sensitivityInput = document.getElementById('sensitivity');
const sensitivityValue = document.getElementById('sensitivity-value');
const soundCheckbox = document.getElementById('sound-feedback');
const engineWarning = document.getElementById('engine-warning');

let hasCalibration = false;

// Slider representa o corte mínimo (Hz) do filtro One-Euro diretamente
// (0.3 a 2.5) — ver comentário em utils/storage.js. Não é mais uma
// porcentagem de alpha de EMA.
function sensitivityLabel(minCutoff) {
  if (minCutoff < 0.6) return 'Muito suave';
  if (minCutoff < 1.6) return 'Média';
  return 'Responsiva';
}

function renderState(settings, calibrationPresent) {
  hasCalibration = calibrationPresent;

  statusPill.textContent = settings.isActive ? 'Ativo' : 'Pausado';
  statusPill.classList.toggle('active', settings.isActive);
  toggleBtn.setAttribute('aria-pressed', String(settings.isActive));
  toggleBtn.textContent = settings.isActive ? 'Pausar EyeMouse' : 'Ativar EyeMouse';

  calibrationHint.hidden = calibrationPresent;
  toggleBtn.disabled = !calibrationPresent;

  for (const radio of clickModeRadios) {
    radio.checked = radio.value === settings.clickMode;
  }
  dwellField.hidden = settings.clickMode !== 'dwell';
  dwellInput.value = settings.dwellTimeMs;
  dwellValue.textContent = `${settings.dwellTimeMs}ms`;

  sensitivityInput.value = settings.gazeMinCutoff;
  sensitivityValue.textContent = sensitivityLabel(settings.gazeMinCutoff);

  soundCheckbox.checked = settings.soundFeedback;
}

async function refresh() {
  const [settings, calibration] = await Promise.all([getSettings(), getCalibration()]);
  renderState(settings, !!calibration);
}

function updateSettings(partial) {
  chrome.runtime.sendMessage({ type: MSG.SET_SETTINGS, payload: partial });
}

toggleBtn.addEventListener('click', async () => {
  const result = await chrome.runtime.sendMessage({ type: MSG.TOGGLE_STATE });
  if (!result?.ok && result?.reason === 'no-calibration') {
    calibrationHint.hidden = false;
  }
});

calibrateBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: MSG.OPEN_CALIBRATION });
  window.close();
});

for (const radio of clickModeRadios) {
  radio.addEventListener('change', (e) => {
    if (e.target.checked) updateSettings({ clickMode: e.target.value });
  });
}

dwellInput.addEventListener('input', (e) => {
  dwellValue.textContent = `${e.target.value}ms`;
});
dwellInput.addEventListener('change', (e) => {
  updateSettings({ dwellTimeMs: Number(e.target.value) });
});

sensitivityInput.addEventListener('input', (e) => {
  sensitivityValue.textContent = sensitivityLabel(Number(e.target.value));
});
sensitivityInput.addEventListener('change', (e) => {
  updateSettings({ gazeMinCutoff: Number(e.target.value) });
});

soundCheckbox.addEventListener('change', (e) => {
  updateSettings({ soundFeedback: e.target.checked });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MSG.ENGINE_ERROR) {
    const { message: code, raw } = message.payload;
    engineWarning.hidden = false;
    engineWarning.textContent = code === 'camera-permission-denied'
      ? 'Permissão de câmera negada.'
      : code === 'camera-not-found'
        ? 'Nenhuma câmera encontrada.'
        : code === 'camera-busy'
          ? 'Câmera em uso por outro programa/aba.'
          : `Erro: ${raw || code}`;
  }
});

onStorageChanged((kind, value) => {
  if (kind === 'settings') renderState(value, hasCalibration);
  if (kind === 'calibration') refresh();
});

refresh();
