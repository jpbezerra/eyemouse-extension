// Aplica a calibração (regressão polinomial, RF04) sobre as razões cruas
// (rx, ry) recebidas do offscreen, já suavizadas (RF01.3), produzindo a
// fração de tela (0..1) onde o cursor deve aparecer.

import { applyCalibration } from '../utils/mathHelpers.js';
import { ExponentialSmoothing } from './smoothing.js';

export class GazeMapper {
  constructor(alpha) {
    this.smoother = new ExponentialSmoothing(alpha);
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

  setAlpha(alpha) {
    this.smoother.setAlpha(alpha);
  }

  reset() {
    this.smoother.reset();
  }

  /** @returns {{xFrac:number,yFrac:number}|null} null se ainda não calibrado */
  map(rx, ry) {
    if (!this.isCalibrated) return null;
    const smoothed = this.smoother.filter(rx, ry);
    return applyCalibration(this.coefX, this.coefY, smoothed.x, smoothed.y);
  }
}
