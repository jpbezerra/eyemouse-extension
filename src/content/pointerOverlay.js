// UI do cursor visual (Gaze Dot) isolada da página via Shadow DOM (RF05),
// mais o bipe de confirmação sintetizado via Web Audio API (RF05.2).
//
// Tudo roda dentro de uma Shadow Root para que o CSS do site hospedeiro
// nunca vaze para o nosso cursor (e vice-versa).

const COLORS = {
  idle: 'rgba(59, 130, 246, 0.6)', // azul, 60% opacidade — RF05.1
  click: 'rgba(34, 197, 94, 0.95)', // verde — RF05.2
  paused: 'rgba(148, 163, 184, 0.55)' // cinza — RF05.3
};

export class PointerOverlay {
  constructor() {
    this.host = document.createElement('div');
    this.host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
    this.shadow = this.host.attachShadow({ mode: 'open' });

    this.shadow.innerHTML = `
      <style>
        .dot {
          position: fixed;
          top: 0; left: 0;
          width: 22px; height: 22px;
          border-radius: 50%;
          background: ${COLORS.idle};
          border: 2px solid rgba(255,255,255,0.9);
          box-shadow: 0 0 6px rgba(0,0,0,0.25);
          transform: translate(-50%, -50%);
          transition: background-color 0.12s ease-out, width 0.12s ease-out, height 0.12s ease-out;
          will-change: top, left;
        }
        .dot.clicked {
          width: 14px; height: 14px;
          background: ${COLORS.click};
        }
        .banner {
          position: fixed;
          top: 12px; left: 50%;
          transform: translateX(-50%);
          background: rgba(17, 24, 39, 0.92);
          color: #fff;
          font: 13px/1.4 system-ui, sans-serif;
          padding: 8px 14px;
          border-radius: 8px;
          max-width: 360px;
          text-align: center;
          box-shadow: 0 4px 14px rgba(0,0,0,0.3);
          display: none;
        }
        .banner.visible { display: block; }
      </style>
      <div class="dot" part="dot"></div>
      <div class="banner" part="banner"></div>
    `;

    this.dotEl = this.shadow.querySelector('.dot');
    this.bannerEl = this.shadow.querySelector('.banner');
    this._clickResetTimer = null;
    this._bannerTimer = null;
    this._audioCtx = null;
    this.soundEnabled = true;

    (document.documentElement || document.body).appendChild(this.host);
  }

  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
  }

  setPosition(x, y) {
    this.dotEl.style.left = `${x}px`;
    this.dotEl.style.top = `${y}px`;
  }

  setPaused(isPaused) {
    this.dotEl.style.background = isPaused ? COLORS.paused : COLORS.idle;
  }

  showClickFeedback() {
    this.dotEl.classList.add('clicked');
    clearTimeout(this._clickResetTimer);
    this._clickResetTimer = setTimeout(() => this.dotEl.classList.remove('clicked'), 150);
    this._playBeep();
  }

  showWarning(text, autoHideMs = 4000) {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.add('visible');
    clearTimeout(this._bannerTimer);
    if (autoHideMs) {
      this._bannerTimer = setTimeout(() => this.hideWarning(), autoHideMs);
    }
  }

  hideWarning() {
    this.bannerEl.classList.remove('visible');
  }

  _playBeep() {
    if (!this.soundEnabled) return;
    try {
      this._audioCtx = this._audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (_) {
      // Web Audio pode falhar antes de um gesto do usuário em algumas
      // políticas de autoplay; a ausência de som não é crítica.
    }
  }

  destroy() {
    this.host.remove();
  }
}
