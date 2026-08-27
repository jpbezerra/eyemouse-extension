// Service worker (MV3). Não toca em DOM/câmera — apenas orquestra:
//   - ciclo de vida do documento offscreen (câmera + MediaPipe)
//   - qual aba está ativa (para onde a posição do olhar deve ser enviada)
//   - execução de cliques nativos via Chrome DevTools Protocol
//   - persistência/broadcast de estado (Ativo/Pausado) e configurações
//   - o atalho de teclado Alt+E (RF04.3)
//
// Toda a lógica de "o que fazer" com a piscada/gaze (clique, scroll, dwell)
// mora no content script (src/content/*), que é quem tem o pixel real da
// página. Aqui só relaimos o frame cru para a aba ativa.

import { MSG } from '../utils/messages.js';
import { getSettings, setSettings, getCalibration, setCalibration } from '../utils/storage.js';

const OFFSCREEN_URL = 'offscreen.html';

let activeTabId = null;
let calibrationTabId = null;
const attachedDebuggerTabs = new Set();

// ---------------------------------------------------------------------------
// Ciclo de vida do documento offscreen
// ---------------------------------------------------------------------------

async function ensureOffscreenDocument() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Captura da webcam local para rastreamento ocular (o vídeo nunca sai do dispositivo).'
  });
}

async function closeOffscreenDocument() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) await chrome.offscreen.closeDocument();
}

async function setEngineRunning(enabled) {
  if (enabled) {
    await ensureOffscreenDocument();
    chrome.runtime.sendMessage({ target: 'offscreen', type: MSG.SET_PROCESSING, payload: { enabled: true } });
  } else {
    // enabled:false primeiro (deixa a câmera desligar antes do doc fechar)
    chrome.runtime.sendMessage({ target: 'offscreen', type: MSG.SET_PROCESSING, payload: { enabled: false } }).catch(() => {});
    await closeOffscreenDocument();
  }
}

// ---------------------------------------------------------------------------
// Rastreamento da aba ativa
// ---------------------------------------------------------------------------

chrome.tabs.onActivated.addListener(({ tabId }) => {
  activeTabId = tabId;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeTabId === tabId) activeTabId = null;
  if (calibrationTabId === tabId) calibrationTabId = null;
  attachedDebuggerTabs.delete(tabId);
});

chrome.windows?.onFocusChanged?.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  if (tab) activeTabId = tab.id;
});

async function primeActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) activeTabId = tab.id;
}

// ---------------------------------------------------------------------------
// Execução de cliques nativos via CDP (RF02, justificativa RNF03)
// ---------------------------------------------------------------------------

async function ensureDebuggerAttached(tabId) {
  if (attachedDebuggerTabs.has(tabId)) return;
  await chrome.debugger.attach({ tabId }, '1.3');
  attachedDebuggerTabs.add(tabId);
}

async function detachDebugger(tabId) {
  if (!attachedDebuggerTabs.has(tabId)) return;
  attachedDebuggerTabs.delete(tabId);
  try {
    await chrome.debugger.detach({ tabId });
  } catch (_) {
    // já pode ter sido desanexado (ex: DevTools aberto manualmente)
  }
}

async function detachAllDebuggers() {
  const tabIds = [...attachedDebuggerTabs];
  await Promise.all(tabIds.map(detachDebugger));
}

async function executeNativeClick(tabId, x, y, clickCount = 1) {
  const target = { tabId };
  await ensureDebuggerAttached(tabId);

  const base = {
    x: Math.round(x),
    y: Math.round(y),
    button: 'left',
    clickCount
  };

  await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseMoved', ...base });
  await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
  await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
}

// ---------------------------------------------------------------------------
// Estado global (Ativo/Pausado) e configurações
// ---------------------------------------------------------------------------
//
// Ativo/Pausado e as configurações do usuário vivem só em
// chrome.storage.local (ver utils/storage.js). Content script, popup e
// calibração escutam chrome.storage.onChanged diretamente — por isso o
// service worker não precisa (nem deve) fazer broadcast manual desses
// dados: evita duplicidade de fonte de verdade e condições de corrida com
// abas que ainda não tinham um listener de mensagem pronto.

function routeToRelevantTabs(message) {
  if (activeTabId != null) chrome.tabs.sendMessage(activeTabId, message).catch(() => {});
  if (calibrationTabId != null && calibrationTabId !== activeTabId) {
    chrome.tabs.sendMessage(calibrationTabId, message).catch(() => {});
  }
}

async function setActive(nextActive) {
  if (nextActive) {
    const calibration = await getCalibration();
    if (!calibration) {
      return { ok: false, reason: 'no-calibration' };
    }
    await primeActiveTab();
    await setEngineRunning(true);
  } else {
    await setEngineRunning(false);
    await detachAllDebuggers();
  }
  const settings = await setSettings({ isActive: nextActive });
  return { ok: true, settings };
}

async function toggleActive() {
  const settings = await getSettings();
  return setActive(!settings.isActive);
}

// ---------------------------------------------------------------------------
// Atalho de teclado Alt+E (RF04.3)
// ---------------------------------------------------------------------------

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-active') toggleActive();
});

// ---------------------------------------------------------------------------
// Roteamento de mensagens
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case MSG.GAZE_FRAME: {
      if (activeTabId != null) {
        chrome.tabs.sendMessage(activeTabId, message).catch(() => {});
      }
      if (calibrationTabId != null) {
        chrome.tabs.sendMessage(calibrationTabId, message).catch(() => {});
      }
      return false;
    }

    case MSG.LOW_LIGHT_WARNING: {
      routeToRelevantTabs(message);
      return false;
    }

    case MSG.ENGINE_ERROR: {
      routeToRelevantTabs(message);
      return false;
    }

    case MSG.EXECUTE_CLICK: {
      const tabId = sender.tab?.id;
      if (tabId == null) {
        sendResponse({ status: 'ERROR', error: 'no-tab' });
        return false;
      }
      const { x, y, clickCount } = message.payload;
      executeNativeClick(tabId, x, y, clickCount)
        .then(() => sendResponse({ status: 'SUCCESS' }))
        .catch((err) => sendResponse({ status: 'ERROR', error: err.message }));
      return true; // canal assíncrono
    }

    case MSG.TOGGLE_STATE: {
      toggleActive().then((result) => sendResponse(result));
      return true;
    }

    case MSG.GET_STATE: {
      Promise.all([getSettings(), getCalibration()]).then(([settings, calibration]) => {
        sendResponse({ settings, hasCalibration: !!calibration });
      });
      return true;
    }

    case MSG.SET_SETTINGS: {
      setSettings(message.payload).then((settings) => {
        sendResponse({ ok: true, settings });
      });
      return true;
    }

    case MSG.OPEN_CALIBRATION: {
      chrome.tabs.create({ url: chrome.runtime.getURL('calibration/calibration.html') }).then(() => {
        sendResponse({ ok: true });
      });
      return true;
    }

    case MSG.START_CALIBRATION: {
      // Cobre tanto a aba aberta pelo popup quanto a aberta automaticamente
      // no primeiro uso (chrome.runtime.onInstalled) — em ambos os casos é
      // a própria página de calibração quem avisa "estou pronta".
      calibrationTabId = sender.tab?.id ?? calibrationTabId;
      setEngineRunning(true);
      return false;
    }

    case MSG.STOP_CALIBRATION: {
      calibrationTabId = null;
      // Só desliga a engine se a extensão não estiver ativa em uma aba normal
      getSettings().then((settings) => {
        if (!settings.isActive) setEngineRunning(false);
      });
      return false;
    }

    case MSG.CALIBRATION_COMPLETE: {
      setCalibration(message.payload).then(() => {
        sendResponse({ ok: true });
      });
      return true;
    }

    default:
      return false;
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // RF04.1 — a calibração é obrigatória antes do primeiro uso.
    chrome.tabs.create({ url: chrome.runtime.getURL('calibration/calibration.html') });
  }
});
