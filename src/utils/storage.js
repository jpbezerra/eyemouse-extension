// Wrapper fino sobre chrome.storage.local (RF04.2) com valores padrão
// centralizados, para que nenhuma parte do código precise adivinhar o
// formato salvo.

export const DEFAULT_SETTINGS = {
  isActive: false,
  clickMode: 'blink', // 'blink' | 'dwell'
  smoothingAlpha: 0.15, // RF01.3 — fator da EMA (0.05 a 0.3)
  blinkCloseThreshold: 0.18, // RF02.1
  blinkOpenThreshold: 0.24,
  blinkMinMs: 150, // RF02.2
  blinkMaxMs: 400,
  doubleClickWindowMs: 350, // RF02.3
  dwellRadiusPx: 15, // RF02.4
  dwellTimeMs: 800, // dentro da faixa 500-2000ms
  scrollMarginPct: 0.10, // RF03.1 — 10% do topo/base
  scrollMarginDwellMs: 400,
  scrollStepPx: 300,
  pageScrollFactor: 0.9, // RF03.2 — fração da altura da janela por wink (Page Up/Down)
  soundFeedback: true,
  toggleGestureWindowMs: 500 // RF04.3 — wink E->D
};

const SETTINGS_KEY = 'eyemouse_settings';
const CALIBRATION_KEY = 'eyemouse_calibration';

export async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
}

export async function setSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function getCalibration() {
  const stored = await chrome.storage.local.get(CALIBRATION_KEY);
  return stored[CALIBRATION_KEY] || null;
}

/**
 * @param {{coefX:number[], coefY:number[], samples:number, calibratedAt:number}} calibration
 */
export async function setCalibration(calibration) {
  await chrome.storage.local.set({ [CALIBRATION_KEY]: calibration });
}

export async function clearCalibration() {
  await chrome.storage.local.remove(CALIBRATION_KEY);
}

export function onStorageChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[SETTINGS_KEY]) callback('settings', changes[SETTINGS_KEY].newValue);
    if (changes[CALIBRATION_KEY]) callback('calibration', changes[CALIBRATION_KEY].newValue);
  });
}
