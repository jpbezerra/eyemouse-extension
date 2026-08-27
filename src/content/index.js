// Ponto de entrada do content script. Roda em toda página (RF01) mas NÃO
// toca na câmera — apenas recebe frames já processados (rx, ry, EAR) via
// mensagens do background/offscreen e cuida de tudo que precisa do
// contexto real da página: pixels de viewport, scroll e o cursor visual.

import { MSG } from '../utils/messages.js';
import { getSettings, getCalibration, onStorageChanged } from '../utils/storage.js';
import { GazeMapper } from './gazeEngine.js';
import { BlinkDetector } from './blinkDetector.js';
import { MarginScrollController, DwellClickController } from './scrollController.js';
import { PointerOverlay } from './pointerOverlay.js';

let settings = null;
let isActive = false;

let currentX = window.innerWidth / 2;
let currentY = window.innerHeight / 2;

const overlay = new PointerOverlay();
const mapper = new GazeMapper(1.2); // corrigido para o valor real assim que getSettings() resolve, em applySettings()
const marginScroll = new MarginScrollController({
  scrollMarginPct: 0.10,
  scrollMarginDwellMs: 400,
  scrollStepPx: 300
});

let blinkDetector = null;
let dwellClick = null;

function buildBlinkDetector(currentSettings) {
  return new BlinkDetector(
    {
      onSingleClick: () => {
        if (settings.clickMode === 'blink') dispatchClick(1);
      },
      onDoubleClick: () => dispatchClick(2),
      // RF03.2 — wink esquerdo = página abaixo, wink direito = página acima
      onWinkLeft: () => window.scrollBy({ top: window.innerHeight * settings.pageScrollFactor, behavior: 'smooth' }),
      onWinkRight: () => window.scrollBy({ top: -window.innerHeight * settings.pageScrollFactor, behavior: 'smooth' }),
      // RF04.3 — wink esquerdo -> direito em <500ms alterna Ativo/Pausado
      onToggleGesture: () => chrome.runtime.sendMessage({ type: MSG.TOGGLE_STATE })
    },
    currentSettings
  );
}

function dispatchClick(clickCount) {
  overlay.showClickFeedback();
  chrome.runtime.sendMessage({
    type: MSG.EXECUTE_CLICK,
    payload: { x: currentX, y: currentY, clickCount }
  }).then((response) => {
    if (response?.status === 'ERROR') {
      overlay.showWarning('Não foi possível clicar: feche o DevTools desta aba se estiver aberto.', 5000);
    }
  }).catch(() => {});
}

function handleGazeFrame(payload) {
  if (!isActive) return;
  const { rx, ry, earLeft, earRight, t } = payload;

  const mapped = mapper.map(rx, ry, t);
  if (!mapped) return; // ainda sem calibração salva

  currentX = mapped.xFrac * window.innerWidth;
  currentY = mapped.yFrac * window.innerHeight;
  overlay.setPosition(currentX, currentY);

  blinkDetector.processFrame(earLeft, earRight);
  marginScroll.update(currentY);

  if (settings.clickMode === 'dwell') {
    dwellClick.update(currentX, currentY);
  }
}

function applySettings(next) {
  settings = next;
  mapper.setMinCutoff(settings.gazeMinCutoff);
  overlay.setSoundEnabled(settings.soundFeedback);
  blinkDetector?.updateSettings(settings);
  dwellClick?.updateSettings(settings);
  marginScroll.updateSettings(settings);
}

function applyActiveState(active) {
  isActive = active;
  overlay.setPaused(!active);
  if (active) {
    mapper.reset();
    blinkDetector.reset();
    marginScroll.reset();
    dwellClick.reset();
    overlay.hideWarning();
  }
}

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case MSG.GAZE_FRAME:
      handleGazeFrame(message.payload);
      break;
    case MSG.LOW_LIGHT_WARNING:
      if (message.payload.lowLight) {
        overlay.showWarning('Pouca luz detectada — melhore a iluminação do ambiente para maior precisão.', 6000);
      } else {
        overlay.hideWarning();
      }
      break;
    case MSG.ENGINE_ERROR:
      overlay.showWarning(describeEngineError(message.payload), 8000);
      break;
    default:
      break;
  }
});

function describeEngineError({ stage, message: code, raw }) {
  if (code === 'camera-permission-denied') {
    return 'Permissão de câmera negada. Autorize o acesso à câmera para usar o EyeMouse.';
  }
  if (code === 'camera-not-found') {
    return 'Nenhuma câmera foi encontrada neste dispositivo.';
  }
  if (code === 'camera-busy') {
    return 'Câmera em uso por outro programa/aba. Feche o que estiver usando ela e reative o EyeMouse.';
  }
  // Erro não catalogado — mostra a mensagem real em vez de um texto genérico.
  const stageLabel = stage === 'engine' ? 'motor de rastreamento' : 'câmera';
  return `Erro no ${stageLabel}: ${raw || code}`;
}

async function init() {
  settings = await getSettings();
  const calibration = await getCalibration();

  mapper.setCalibration(calibration);
  blinkDetector = buildBlinkDetector(settings);
  dwellClick = new DwellClickController((x, y) => dispatchClick(1), settings);

  applySettings(settings);
  applyActiveState(settings.isActive);

  onStorageChanged((kind, value) => {
    if (kind === 'settings') {
      const wasActive = isActive;
      applySettings(value);
      if (value.isActive !== wasActive) applyActiveState(value.isActive);
    } else if (kind === 'calibration') {
      mapper.setCalibration(value);
    }
  });
}

init();
