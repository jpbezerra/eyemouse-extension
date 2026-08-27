// Fluxo de calibração (RF04.1) — roda como uma aba normal da extensão
// (chrome-extension://.../calibration/calibration.html), aberta pelo popup
// ou automaticamente no primeiro uso.

import { MSG } from '../utils/messages.js';
import { getSettings } from '../utils/storage.js';
import { polynomialFeatures, solveLeastSquares } from '../utils/mathHelpers.js';

// 9 pontos cobrindo cantos, meios de borda e centro — dá graus de liberdade
// suficientes para o ajuste quadrático (6 coeficientes) da calibração completa.
const FULL_POINTS = [
  [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
  [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
  [0.1, 0.9], [0.5, 0.9], [0.9, 0.9]
];

// 3 pontos não colineares bastam para o ajuste linear/afim (3 coeficientes)
// da recalibração rápida — mitigação de risco do PRD (óculos/iluminação).
const QUICK_POINTS = [[0.15, 0.15], [0.85, 0.85], [0.5, 0.15]];

const MIN_SAMPLES_TO_CONFIRM = 8;
const SAMPLE_BUFFER_SIZE = 20;

const screens = {
  intro: document.getElementById('screen-intro'),
  running: document.getElementById('screen-running'),
  done: document.getElementById('screen-done')
};
const engineStatusEl = document.getElementById('engine-status');
const globalBannerEl = document.getElementById('global-banner');
const globalBannerTextEl = document.getElementById('global-banner-text');
const globalBannerRetryEl = document.getElementById('global-banner-retry');
const targetEl = document.getElementById('target');
const runningHintEl = document.getElementById('running-hint');
const progressLabelEl = document.getElementById('progress-label');
const startFullBtn = document.getElementById('start-full');
const startQuickBtn = document.getElementById('start-quick');

let settings = null;
let mode = null; // 'full' | 'quick'
let points = [];
let pointIndex = 0;
let sampleBuffer = [];
let collected = [];

let bothClosedAt = null;
let engineReady = false;

function showScreen(name) {
  for (const key of Object.keys(screens)) screens[key].hidden = key !== name;
}

function showGlobalError(text, { retryable = false } = {}) {
  globalBannerTextEl.textContent = text;
  globalBannerRetryEl.hidden = !retryable;
  globalBannerEl.hidden = false;
}

function hideGlobalError() {
  globalBannerEl.hidden = true;
}

function featuresFor(rx, ry) {
  return mode === 'quick' ? [1, rx, ry] : polynomialFeatures(rx, ry);
}

function startFlow(selectedMode) {
  mode = selectedMode;
  points = selectedMode === 'quick' ? QUICK_POINTS : FULL_POINTS;
  pointIndex = 0;
  collected = [];
  showScreen('running');
  showCurrentPoint();
}

function showCurrentPoint() {
  const [xFrac, yFrac] = points[pointIndex];
  targetEl.style.left = `${xFrac * window.innerWidth}px`;
  targetEl.style.top = `${yFrac * window.innerHeight}px`;
  targetEl.classList.remove('capturing');
  runningHintEl.textContent = 'Olhe para o ponto e pisque para confirmar';
  progressLabelEl.textContent = `Ponto ${pointIndex + 1} de ${points.length}`;
  sampleBuffer = [];
  bothClosedAt = null;
}

function handleGazeFrame(payload) {
  const { rx, ry, earLeft, earRight } = payload;

  sampleBuffer.push({ rx, ry });
  if (sampleBuffer.length > SAMPLE_BUFFER_SIZE) sampleBuffer.shift();

  const enoughSamples = sampleBuffer.length >= MIN_SAMPLES_TO_CONFIRM;
  targetEl.classList.toggle('capturing', enoughSamples);
  // O contador (N/8) ajuda a diagnosticar: se ele nunca sair de 1, é sinal
  // de que os frames pararam de chegar (em vez de o rosto não ser achado).
  runningHintEl.textContent = enoughSamples
    ? 'Pisque com os dois olhos para confirmar'
    : `Olhe fixamente para o ponto… (${sampleBuffer.length}/${MIN_SAMPLES_TO_CONFIRM})`;

  const closeThreshold = settings.blinkCloseThreshold;
  const openThreshold = settings.blinkOpenThreshold;
  const leftClosed = earLeft < closeThreshold;
  const rightClosed = earRight < closeThreshold;
  const leftOpen = earLeft > openThreshold;
  const rightOpen = earRight > openThreshold;

  if (leftClosed && rightClosed) {
    if (bothClosedAt == null) bothClosedAt = Date.now();
    return;
  }

  if (bothClosedAt != null && leftOpen && rightOpen) {
    const duration = Date.now() - bothClosedAt;
    bothClosedAt = null;
    if (duration >= settings.blinkMinMs && duration <= settings.blinkMaxMs && enoughSamples) {
      confirmCurrentPoint();
    }
  }
}

function confirmCurrentPoint() {
  const avgRx = sampleBuffer.reduce((s, p) => s + p.rx, 0) / sampleBuffer.length;
  const avgRy = sampleBuffer.reduce((s, p) => s + p.ry, 0) / sampleBuffer.length;
  const [tx, ty] = points[pointIndex];
  collected.push({ rx: avgRx, ry: avgRy, tx, ty });

  pointIndex += 1;
  if (pointIndex >= points.length) {
    finishCalibration();
  } else {
    showCurrentPoint();
  }
}

async function finishCalibration() {
  const X = collected.map((s) => featuresFor(s.rx, s.ry));
  const yX = collected.map((s) => s.tx);
  const yY = collected.map((s) => s.ty);

  const coefXRaw = solveLeastSquares(X, yX);
  const coefYRaw = solveLeastSquares(X, yY);

  // Normaliza o comprimento do vetor de coeficientes para 6 posições
  // (padrão quadrático) preenchendo com zero os termos que a calibração
  // rápida (afim, 3 termos) não usa — assim applyCalibration() não precisa
  // saber qual foi o modo usado.
  const coefX = padCoefficients(coefXRaw);
  const coefY = padCoefficients(coefYRaw);

  await chrome.runtime.sendMessage({
    type: MSG.CALIBRATION_COMPLETE,
    payload: { coefX, coefY, samples: collected.length, mode, calibratedAt: Date.now() }
  });

  showScreen('done');
  chrome.runtime.sendMessage({ type: MSG.STOP_CALIBRATION });
}

function padCoefficients(coef) {
  if (coef.length === 6) return coef;
  // Ordem de polynomialFeatures: [1, rx, ry, rx*ry, rx^2, ry^2]
  // Ordem afim: [1, rx, ry] -> mapeia direto nos 3 primeiros termos.
  return [...coef, 0, 0, 0].slice(0, 6);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MSG.GAZE_FRAME && !screens.running.hidden) {
    handleGazeFrame(message.payload);
  }
  if (message.type === MSG.ENGINE_READY) {
    engineReady = true;
    engineStatusEl.textContent = '';
    hideGlobalError();
  }
  if (message.type === MSG.ENGINE_ERROR) {
    // Banner global (não só o texto da tela de intro) porque esse erro pode
    // chegar bem depois do usuário já ter avançado para a tela de pontos.
    showGlobalError(describeEngineError(message.payload), { retryable: true });
  }
});

function describeEngineError({ stage, message: code, raw }) {
  if (code === 'camera-permission-denied') {
    return 'Permissão de câmera negada. Autorize o acesso e recarregue esta página.';
  }
  if (code === 'camera-not-found') {
    return 'Nenhuma câmera encontrada neste dispositivo.';
  }
  if (code === 'camera-busy') {
    return 'A câmera parece estar em uso por outro programa ou aba (Zoom, Teams, Câmera do Windows...). Feche o que estiver usando ela e clique em "Tentar novamente".';
  }
  // Erro não catalogado (falha ao carregar o MediaPipe/modelo, por exemplo)
  // — mostra a mensagem real em vez de esconder atrás de um texto genérico.
  const stageLabel = stage === 'engine' ? 'ao carregar o motor de rastreamento' : 'ao acessar a câmera';
  return `Erro ${stageLabel}: ${raw || code}`;
}

document.getElementById('start-full').addEventListener('click', () => startFlow('full'));
document.getElementById('start-quick').addEventListener('click', () => startFlow('quick'));
document.getElementById('close-btn').addEventListener('click', () => window.close());

window.addEventListener('beforeunload', () => {
  chrome.runtime.sendMessage({ type: MSG.STOP_CALIBRATION }).catch(() => {});
});

// Documentos offscreen (onde a câmera roda de verdade — ver
// src/background/offscreen.js) são invisíveis, então o Chrome NÃO consegue
// mostrar ali o popup de "Permitir acesso à câmera?": não existe superfície
// visível pra ancorar o balão de permissão, e o getUserMedia() só falha
// silenciosamente. A saída é pedir a permissão uma vez a partir desta aba
// (que é normal e visível) antes de mandar o offscreen ligar a câmera —
// uma vez concedida, ela vale pra origem inteira da extensão, offscreen
// incluso, e não é pedida de novo.
async function ensureCameraPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    // Dá um instante pro driver da webcam liberar o dispositivo antes do
    // offscreen tentar abrir o stream dele (evita "câmera em uso" — o
    // offscreen também tenta de novo sozinho se isso acontecer mesmo assim).
    await new Promise((resolve) => setTimeout(resolve, 250));
    return true;
  } catch (error) {
    const code = error?.name === 'NotAllowedError'
      ? 'camera-permission-denied'
      : error?.name === 'NotFoundError'
        ? 'camera-not-found'
        : 'camera-busy';
    const raw = `${error?.name || 'Error'}: ${error?.message || error}`;
    showGlobalError(describeEngineError({ stage: 'camera', message: code, raw }), { retryable: true });
    engineStatusEl.textContent = '';
    return false;
  }
}

async function startEngine() {
  startFullBtn.disabled = true;
  startQuickBtn.disabled = true;
  engineReady = false;

  const granted = await ensureCameraPermission();
  if (!granted) {
    startFullBtn.disabled = false;
    startQuickBtn.disabled = false;
    return;
  }

  chrome.runtime.sendMessage({ type: MSG.START_CALIBRATION });
  // Pequena espera para dar feedback caso a câmera demore pra iniciar no
  // offscreen (o modelo do MediaPipe ainda precisa carregar).
  engineStatusEl.textContent = 'Carregando o motor de rastreamento…';
  startFullBtn.disabled = false;
  startQuickBtn.disabled = false;
}

globalBannerRetryEl.addEventListener('click', () => {
  hideGlobalError();
  startEngine();
});

(async function init() {
  settings = await getSettings();
  await startEngine();
})();
