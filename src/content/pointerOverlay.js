// UI do cursor visual (Gaze Dot) isolada da página via Shadow DOM (RF05),
// mais o bipe de confirmação sintetizado via Web Audio API (RF05.2).
//
// Tudo roda dentro de uma Shadow Root para que o CSS do site hospedeiro
// nunca vaze para o nosso cursor (e vice-versa).

// Visual em "vidro" (glassmorphism): gradiente radial com um brilho no
// canto superior esquerdo simulando luz refletida, esmaecendo para as
// bordas — dá sensação de volume/relevo numa forma que continua
// predominantemente transparente, em vez de um círculo azul chapado.
const GRADIENTS = {
  idle: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.30) 15%, rgba(96,165,250,0.38) 45%, rgba(37,99,235,0.22) 75%, rgba(37,99,235,0.08) 100%)', // azul — RF05.1
  click: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.40) 15%, rgba(74,222,128,0.55) 45%, rgba(22,163,74,0.35) 75%, rgba(22,163,74,0.12) 100%)', // verde — RF05.2
  paused: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.70) 0%, rgba(255,255,255,0.22) 15%, rgba(148,163,184,0.32) 45%, rgba(100,116,139,0.20) 75%, rgba(100,116,139,0.08) 100%)' // cinza — RF05.3
};

// Sombra externa (eleva o ponto sobre a página) + duas sombras internas
// (brilho no topo, sombra sutil embaixo) — é isso que dá o "relevo" de
// vidro/bolha em vez de um disco liso.
const DOT_SHADOW = '0 3px 10px rgba(15, 23, 42, 0.32), inset 0 1px 1px rgba(255,255,255,0.65), inset 0 -3px 5px rgba(15, 23, 42, 0.16)';
const DOT_SHADOW_CLICK = '0 2px 8px rgba(15, 23, 42, 0.35), inset 0 1px 1px rgba(255,255,255,0.8), inset 0 -2px 4px rgba(15, 23, 42, 0.18)';

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
          width: 26px; height: 26px;
          border-radius: 50%;
          background: ${GRADIENTS.idle};
          border: 1px solid rgba(255,255,255,0.45);
          box-shadow: ${DOT_SHADOW};
          backdrop-filter: blur(0.5px);
          transform: translate(-50%, -50%);
          transition: background 0.15s ease-out, box-shadow 0.15s ease-out, width 0.12s ease-out, height 0.12s ease-out;
          will-change: top, left;
        }
        .dot.paused {
          background: ${GRADIENTS.paused};
        }
        /* Precisa vir DEPOIS de .dot.paused: mesma especificidade (duas
           classes), então quem ganha é a ordem no CSS — assim um clique
           (ainda que raro) sempre aparece em verde, mesmo pausado. Setar
           a cor via style inline (como era antes) não funcionava porque
           estilo inline sempre vence regra de classe do stylesheet. */
        .dot.clicked {
          width: 17px; height: 17px;
          background: ${GRADIENTS.click};
          box-shadow: ${DOT_SHADOW_CLICK};
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
    this.dotEl.classList.toggle('paused', isPaused);
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
