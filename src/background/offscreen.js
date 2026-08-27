// Executa dentro do documento offscreen (src/background/offscreen.html).
// Único lugar da extensão que toca a câmera e o MediaPipe (RNF01: o vídeo
// nunca sai da máquina do usuário — aqui ele nem chega a atravessar o
// content script de uma página web).

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { calculateEAR, irisRatioInEye } from '../utils/mathHelpers.js';
import {
  LEFT_EYE_IDX,
  RIGHT_EYE_IDX,
  LEFT_IRIS_CENTER_IDX,
  RIGHT_IRIS_CENTER_IDX
} from '../utils/landmarks.js';
import { MSG } from '../utils/messages.js';

let faceLandmarker = null;
let videoEl = null;
let stream = null;
let running = false;
let loopTimerId = null;
let lastVideoTime = -1;

// ~30 FPS. IMPORTANTE: nada de requestAnimationFrame aqui — rAF só dispara
// em sincronia com o pintar da tela, e um documento offscreen nunca é
// pintado. Na prática o Chrome quase congela o rAF nesse contexto (o loop
// roda uma vez e trava), então o loop de captura tem que ser via timer.
const FRAME_INTERVAL_MS = 33;

const lumaCanvas = new OffscreenCanvas(32, 24);
const lumaCtx = lumaCanvas.getContext('2d');
let lastLumaCheck = 0;
let lowLightNotified = false;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.target !== 'offscreen') return;
  if (message.type === MSG.SET_PROCESSING) {
    if (message.payload?.enabled) start();
    else stop();
  }
});

async function ensureEngine() {
  if (faceLandmarker) return;
  const filesetResolver = await FilesetResolver.forVisionTasks(
    chrome.runtime.getURL('wasm')
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: chrome.runtime.getURL('models/face_landmarker.task'),
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A permissão de câmera é pedida numa aba visível (a de calibração — ver
// calibration.js), que solta a câmera logo em seguida para este documento
// offscreen abrir seu próprio stream. Em algumas combinações de SO/driver
// de webcam, o dispositivo físico leva um instante para ficar livre de
// novo depois do `track.stop()` daquela aba, e essa primeira chamada aqui
// pode falhar com "NotReadableError" (device in use) mesmo já com
// permissão concedida. Só vale a pena tentar de novo nesse caso — erro de
// permissão negada ou câmera inexistente não muda tentando de novo.
const RETRYABLE_ERRORS = new Set(['NotReadableError', 'TrackStartError', 'AbortError']);
const RETRY_DELAYS_MS = [300, 700, 1200];

async function openCamera() {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, min: 24 } },
        audio: false
      });
    } catch (error) {
      lastError = error;
      if (!RETRYABLE_ERRORS.has(error?.name) || attempt === RETRY_DELAYS_MS.length) throw error;
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

async function start() {
  if (running) return;

  let stage = 'engine'; // 'engine' (MediaPipe/wasm/modelo) ou 'camera' (getUserMedia)
  try {
    await ensureEngine();
    stage = 'camera';
    videoEl = videoEl || document.getElementById('camera-feed');
    if (!stream) {
      stream = await openCamera();
      videoEl.srcObject = stream;
      await videoEl.play();
    }
    running = true;
    chrome.runtime.sendMessage({ type: MSG.ENGINE_READY });
    loop();
  } catch (error) {
    running = false;
    // Log completo aqui: este console só é visível inspecionando o próprio
    // documento offscreen (chrome://extensions -> EyeMouse -> "Inspecionar
    // visualizações" -> offscreen.html), já que ele não tem janela própria.
    console.error(`[EyeMouse] falha ao iniciar (etapa: ${stage}):`, error);
    chrome.runtime.sendMessage({
      type: MSG.ENGINE_ERROR,
      payload: { stage, message: describeError(error), raw: `${error?.name || 'Error'}: ${error?.message || error}` }
    });
  }
}

function stop() {
  running = false;
  if (loopTimerId) clearTimeout(loopTimerId);
  loopTimerId = null;
  // Pausar desliga fisicamente a câmera (o indicador do Chrome some), o que
  // é o comportamento que o usuário espera de um botão "Pausado" (RF05.3) —
  // o service worker também fecha este documento offscreen logo em seguida.
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

function describeError(error) {
  if (error?.name === 'NotAllowedError') return 'camera-permission-denied';
  if (error?.name === 'NotFoundError') return 'camera-not-found';
  if (RETRYABLE_ERRORS.has(error?.name)) return 'camera-busy';
  return error?.message || String(error);
}

function loop() {
  if (!running) return;
  if (videoEl.readyState >= 2 && videoEl.currentTime !== lastVideoTime) {
    lastVideoTime = videoEl.currentTime;
    const results = faceLandmarker.detectForVideo(videoEl, performance.now());
    processResults(results);
    maybeCheckLowLight();
  }
  loopTimerId = setTimeout(loop, FRAME_INTERVAL_MS);
}

function processResults(results) {
  const landmarks = results.faceLandmarks?.[0];
  if (!landmarks) return;

  const leftEye = LEFT_EYE_IDX.map((i) => landmarks[i]);
  const rightEye = RIGHT_EYE_IDX.map((i) => landmarks[i]);
  const irisLeft = landmarks[LEFT_IRIS_CENTER_IDX];
  const irisRight = landmarks[RIGHT_IRIS_CENTER_IDX];

  const earLeft = calculateEAR(leftEye);
  const earRight = calculateEAR(rightEye);

  const ratioLeft = irisRatioInEye(irisLeft, leftEye);
  const ratioRight = irisRatioInEye(irisRight, rightEye);

  // A webcam espelha a imagem; invertendo rx aqui, o resto do pipeline
  // (calibração, cursor) pode assumir "olhar para a direita do usuário
  // == rx maior" sem se preocupar com espelhamento.
  const rx = 1 - (ratioLeft.rx + ratioRight.rx) / 2;
  const ry = (ratioLeft.ry + ratioRight.ry) / 2;

  chrome.runtime.sendMessage({
    type: MSG.GAZE_FRAME,
    payload: { rx, ry, earLeft, earRight, t: performance.now() }
  }).catch(() => {});
}

function maybeCheckLowLight() {
  const now = performance.now();
  if (now - lastLumaCheck < 1000) return;
  lastLumaCheck = now;
  try {
    lumaCtx.drawImage(videoEl, 0, 0, lumaCanvas.width, lumaCanvas.height);
    const { data } = lumaCtx.getImageData(0, 0, lumaCanvas.width, lumaCanvas.height);
    let sum = 0;
    const pixelCount = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const avgLuma = sum / pixelCount;
    const isLow = avgLuma < 55;
    if (isLow !== lowLightNotified) {
      lowLightNotified = isLow;
      chrome.runtime.sendMessage({
        type: MSG.LOW_LIGHT_WARNING,
        payload: { lowLight: isLow }
      }).catch(() => {});
    }
  } catch (_) {
    // getImageData pode falhar esporadicamente; não é crítico para o core.
  }
}
