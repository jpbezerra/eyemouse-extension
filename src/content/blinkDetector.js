// Máquina de estados para piscadas (RF02) e winks unilaterais (RF03.2, RF04.3).
//
// Usa dois limiares (fechado/aberto) em vez de um único, para evitar
// oscilação ("flicker") quando o EAR fica exatamente em cima do limiar —
// só contamos "reabriu" quando o valor sobe claramente acima do limiar de
// abertura, e "fechou" quando cai claramente abaixo do de fechamento.

export class BlinkDetector {
  constructor({ onSingleClick, onDoubleClick, onWinkLeft, onWinkRight, onToggleGesture }, settings) {
    this.onSingleClick = onSingleClick;
    this.onDoubleClick = onDoubleClick;
    this.onWinkLeft = onWinkLeft;
    this.onWinkRight = onWinkRight;
    this.onToggleGesture = onToggleGesture;

    this.updateSettings(settings);

    this.leftClosedAt = null;
    this.rightClosedAt = null;
    this.bilateralClosedAt = null;

    this.pendingSingleClickTimer = null;

    this.lastWinkType = null; // 'left' | 'right'
    this.lastWinkAt = 0;
  }

  updateSettings(settings) {
    this.closeThreshold = settings.blinkCloseThreshold;
    this.openThreshold = settings.blinkOpenThreshold;
    this.blinkMinMs = settings.blinkMinMs;
    this.blinkMaxMs = settings.blinkMaxMs;
    this.doubleClickWindowMs = settings.doubleClickWindowMs;
    this.toggleGestureWindowMs = settings.toggleGestureWindowMs;
  }

  reset() {
    this.leftClosedAt = null;
    this.rightClosedAt = null;
    this.bilateralClosedAt = null;
    if (this.pendingSingleClickTimer) clearTimeout(this.pendingSingleClickTimer);
    this.pendingSingleClickTimer = null;
  }

  /** @param {number} earLeft @param {number} earRight */
  processFrame(earLeft, earRight) {
    const now = Date.now();
    const leftClosed = earLeft < this.closeThreshold;
    const rightClosed = earRight < this.closeThreshold;
    const leftOpen = earLeft > this.openThreshold;
    const rightOpen = earRight > this.openThreshold;

    this._trackWink('left', leftClosed, rightClosed, leftOpen, rightOpen, now);
    this._trackWink('right', rightClosed, leftClosed, rightOpen, leftOpen, now);
    this._trackBilateral(leftClosed, rightClosed, leftOpen, rightOpen, now);
  }

  _trackWink(side, thisClosed, otherClosed, thisOpen, otherOpen, now) {
    const atKey = side === 'left' ? 'leftClosedAt' : 'rightClosedAt';

    if (thisClosed && !otherClosed) {
      if (this[atKey] == null) this[atKey] = now;
      return;
    }

    // A condição de "unilateral fechado" deixou de valer: ou reabriu de
    // forma limpa (dispara o wink), ou o outro olho também fechou (virou
    // piscada bilateral — cancela silenciosamente).
    if (this[atKey] != null) {
      const duration = now - this[atKey];
      if (thisOpen && otherOpen && duration >= this.blinkMinMs) {
        this._fireWink(side, now);
      }
      this[atKey] = null;
    }
  }

  _fireWink(side, now) {
    if (side === 'left') this.onWinkLeft();
    else this.onWinkRight();

    // Sequência Esquerdo -> Direito em menos de toggleGestureWindowMs
    // alterna Ativo/Pausado (RF04.3).
    if (this.lastWinkType === 'left' && side === 'right' && now - this.lastWinkAt < this.toggleGestureWindowMs) {
      this.onToggleGesture();
      this.lastWinkType = null;
      return;
    }
    this.lastWinkType = side;
    this.lastWinkAt = now;
  }

  _trackBilateral(leftClosed, rightClosed, leftOpen, rightOpen, now) {
    if (leftClosed && rightClosed) {
      if (this.bilateralClosedAt == null) this.bilateralClosedAt = now;
      return;
    }
    if (this.bilateralClosedAt != null) {
      const duration = now - this.bilateralClosedAt;
      this.bilateralClosedAt = null;
      if (leftOpen && rightOpen && duration >= this.blinkMinMs && duration <= this.blinkMaxMs) {
        this._handleBilateralBlink(now);
      }
    }
  }

  _handleBilateralBlink(now) {
    if (this.pendingSingleClickTimer) {
      // Uma segunda piscada chegou dentro da janela de duplo clique.
      clearTimeout(this.pendingSingleClickTimer);
      this.pendingSingleClickTimer = null;
      this.onDoubleClick();
      return;
    }
    this.pendingSingleClickTimer = setTimeout(() => {
      this.pendingSingleClickTimer = null;
      this.onSingleClick();
    }, this.doubleClickWindowMs);
  }
}
