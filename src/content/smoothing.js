// Filtro de Média Móvel Exponencial (EMA) — RF01.3.
// P_smooth(t) = alpha * P_raw(t) + (1 - alpha) * P_smooth(t-1)

export class ExponentialSmoothing {
  constructor(alpha = 0.15) {
    this.alpha = alpha;
    this.smoothX = null;
    this.smoothY = null;
  }

  setAlpha(alpha) {
    this.alpha = alpha;
  }

  filter(rawX, rawY) {
    if (this.smoothX === null || this.smoothY === null) {
      this.smoothX = rawX;
      this.smoothY = rawY;
    } else {
      this.smoothX = this.alpha * rawX + (1 - this.alpha) * this.smoothX;
      this.smoothY = this.alpha * rawY + (1 - this.alpha) * this.smoothY;
    }
    return { x: this.smoothX, y: this.smoothY };
  }

  reset() {
    this.smoothX = null;
    this.smoothY = null;
  }
}
