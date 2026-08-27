// Tipos de mensagem trocadas entre os "mundos" da extensão
// (offscreen <-> background <-> content/popup/calibration).
// Centralizar aqui evita erros de digitação em strings soltas.

export const MSG = {
  // offscreen -> background: um frame processado da câmera
  GAZE_FRAME: 'GAZE_FRAME',

  // content -> background: pede execução de clique nativo via CDP
  EXECUTE_CLICK: 'EXECUTE_CLICK',

  // content/popup -> background: alterna ativo/pausado
  TOGGLE_STATE: 'TOGGLE_STATE',

  // popup -> background: leitura do estado atual
  GET_STATE: 'GET_STATE',

  // popup -> background: grava novas configurações do usuário
  SET_SETTINGS: 'SET_SETTINGS',

  // popup -> background: abre a página de calibração
  OPEN_CALIBRATION: 'OPEN_CALIBRATION',

  // calibration -> background: entra/sai do modo de streaming de calibração
  START_CALIBRATION: 'START_CALIBRATION',
  STOP_CALIBRATION: 'STOP_CALIBRATION',

  // calibration -> background: salva os coeficientes calculados
  CALIBRATION_COMPLETE: 'CALIBRATION_COMPLETE',

  // offscreen -> background: alerta de pouca luz (mitigação de risco do PRD)
  LOW_LIGHT_WARNING: 'LOW_LIGHT_WARNING',

  // background -> offscreen: liga/desliga o pipeline de câmera para economizar CPU
  SET_PROCESSING: 'SET_PROCESSING',

  // offscreen -> background: erro fatal (câmera negada, modelo não carregou, etc.)
  ENGINE_ERROR: 'ENGINE_ERROR',
  ENGINE_READY: 'ENGINE_READY'
};
