// RF03.1 — rolagem automática ao fixar o olhar nas margens superior/inferior
// da janela, e RF02.4 — clique por tempo de fixação (dwell click) como
// alternativa ao clique por piscada (mitiga a fadiga ocular, RF06/risco).

export class MarginScrollController {
  constructor(settings) {
    this.updateSettings(settings);
    this.zone = null; // 'top' | 'bottom' | null
    this.enteredAt = 0;
    this.intervalId = null;
  }

  updateSettings(settings) {
    this.marginPct = settings.scrollMarginPct;
    this.dwellMs = settings.scrollMarginDwellMs;
    this.stepPx = settings.scrollStepPx;
  }

  /** @param {number} y posição Y do cursor em pixels de viewport */
  update(y) {
    const height = window.innerHeight;
    const topLimit = height * this.marginPct;
    const bottomLimit = height * (1 - this.marginPct);

    let zone = null;
    if (y <= topLimit) zone = 'top';
    else if (y >= bottomLimit) zone = 'bottom';

    if (zone !== this.zone) {
      this._stop();
      this.zone = zone;
      if (zone) this.enteredAt = Date.now();
      return;
    }

    if (zone && !this.intervalId && Date.now() - this.enteredAt >= this.dwellMs) {
      this._start(zone);
    }
  }

  _start(zone) {
    const delta = zone === 'top' ? -this.stepPx : this.stepPx;
    window.scrollBy({ top: delta, behavior: 'smooth' });
    this.intervalId = setInterval(() => {
      window.scrollBy({ top: delta, behavior: 'smooth' });
    }, 350);
  }

  _stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  reset() {
    this._stop();
    this.zone = null;
  }
}

export class DwellClickController {
  constructor(onDwellClick, settings) {
    this.onDwellClick = onDwellClick;
    this.updateSettings(settings);
    this.anchor = null;
    this.anchorAt = 0;
    this.fired = false;
  }

  updateSettings(settings) {
    this.radiusPx = settings.dwellRadiusPx;
    this.timeMs = settings.dwellTimeMs;
  }

  update(x, y) {
    if (!this.anchor) {
      this.anchor = { x, y };
      this.anchorAt = Date.now();
      this.fired = false;
      return;
    }

    const dist = Math.hypot(x - this.anchor.x, y - this.anchor.y);
    if (dist > this.radiusPx) {
      this.anchor = { x, y };
      this.anchorAt = Date.now();
      this.fired = false;
      return;
    }

    if (!this.fired && Date.now() - this.anchorAt >= this.timeMs) {
      this.fired = true;
      this.onDwellClick(x, y);
    }
  }

  reset() {
    this.anchor = null;
    this.fired = false;
  }
}
