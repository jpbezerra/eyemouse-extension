// Aplica a calibração (regressão polinomial, RF04) sobre as razões cruas
// (rx, ry) recebidas do offscreen, já suavizadas por um filtro One-Euro
// (ver smoothing.js) que se adapta à velocidade do olhar, produzindo a
// fração de tela (0..1) onde o cursor deve aparecer.

import { applyCalibration } from '../utils/mathHelpers.js';
import { OneEuroFilter } from './smoothing.js';

// Beta fixo: o quanto o corte do filtro sobe por unidade de velocidade de
// rx/ry (uma razão 0..1, não pixel — por isso o valor não se parece com os
// exemplos "para mouse" que costumam aparecer na literatura do One Euro).
// Ajustado por simulação numérica (ver a conversa) para reagir dentro de
// ~100-150ms a um movimento real de olhar sem amplificar o ruído normal
// da leitura da íris quando o olho está parado. Não é exposto na UI —
// só o corte mínimo (gazeMinCutoff, abaixo) é, via o slider "Suavização
// do cursor" do popup.
const GAZE_BETA = 4.0;
const GAZE_D_CUTOFF = 1.0;

export class GazeMapper {
  constructor(minCutoff) {
    this.filterX = new OneEuroFilter({ minCutoff, beta: GAZE_BETA, dCutoff: GAZE_D_CUTOFF });
    this.filterY = new OneEuroFilter({ minCutoff, beta: GAZE_BETA, dCutoff: GAZE_D_CUTOFF });
    this.coefX = null;
    this.coefY = null;
  }

  setCalibration(calibration) {
    this.coefX = calibration?.coefX ?? null;
    this.coefY = calibration?.coefY ?? null;
  }

  get isCalibrated() {
    return !!(this.coefX && this.coefY);
  }

  setMinCutoff(minCutoff) {
    this.filterX.setMinCutoff(minCutoff);
    this.filterY.setMinCutoff(minCutoff);
  }

  reset() {
    this.filterX.reset();
    this.filterY.reset();
  }

  /**
   * @param {number} t Timestamp da amostra (performance.now() do documento
   *   offscreen, repassado sem modificar — só precisa ser consistente
   *   entre chamadas sucessivas, nunca é comparado com o relógio desta
   *   página).
   * @returns {{xFrac:number,yFrac:number}|null} null se ainda não calibrado
   */
  map(rx, ry, t) {
    if (!this.isCalibrated) return null;
    const sx = this.filterX.filter(rx, t);
    const sy = this.filterY.filter(ry, t);
    return applyCalibration(this.coefX, this.coefY, sx, sy);
  }
}
