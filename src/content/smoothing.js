// Filtro "One Euro" (Casiez, Godin & Vogel, 2012 — "1€ Filter: A Simple
// Speed-based Low-pass Filter for Noisy Input in Interactive Systems").
//
// Por que trocar a EMA de alpha fixo: com alpha fixo existe uma escolha
// única entre dois extremos ruins. Alpha baixo (usado no início) deixa o
// cursor estável quando o olho está parado, mas ele "arrasta atrás" do
// olhar de verdade — sentido como lentidão. Alpha alto (a correção
// seguinte) reage rápido a um movimento real, mas também amplifica o
// ruído normal do rastreamento (tremor de 1-2px na leitura da íris vira
// tremor visível do cursor) — sentido como "descontrolável". Não existe
// um alpha fixo que resolva as duas queixas ao mesmo tempo, porque as
// duas situações (olho parado vs. olho em movimento) pedem respostas
// opostas do filtro.
//
// O One Euro resolve isso ajustando o corte do filtro passa-baixa em
// função da velocidade estimada do sinal: baixa velocidade (olhar fixo)
// -> corte baixo -> bastante suavização/estabilidade; alta velocidade
// (sacada real) -> corte sobe -> quase sem atraso. Testado por simulação
// numérica (não dá pra testar com webcam real neste ambiente) contra a
// EMA antiga: mesmo settling-time do movimento intencional, só que com
// bem menos tremor parado — ver a conversa para os números.
class LowPassFilter {
  constructor() {
    this.hasLast = false;
    this.lastValue = 0;
  }

  filter(value, alpha) {
    const result = this.hasLast ? alpha * value + (1 - alpha) * this.lastValue : value;
    this.hasLast = true;
    this.lastValue = result;
    return result;
  }

  reset() {
    this.hasLast = false;
  }
}

function alphaFromCutoff(cutoffHz, dtSeconds) {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSeconds);
}

export class OneEuroFilter {
  /**
   * @param {number} minCutoff Corte (Hz) usado quando a velocidade do sinal
   *   é ~0 — controla a suavização de base (olhar parado). Menor = mais
   *   estável parado, mas com um pouco mais de atraso ao começar a mover.
   * @param {number} beta Quanto o corte sobe por unidade de velocidade do
   *   sinal (unidades de rx/ry por segundo — a escala aqui é uma razão
   *   0..1, não pixels, então este valor é bem diferente dos exemplos
   *   típicos de mouse/pixel do filtro original).
   * @param {number} dCutoff Corte (Hz) do filtro auxiliar que suaviza a
   *   própria estimativa de velocidade, reduzindo ruído nela.
   */
  constructor({ minCutoff = 1.0, beta = 0.0, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
    this.lastTime = null;
    this.lastValue = 0;
  }

  setMinCutoff(minCutoff) {
    this.minCutoff = minCutoff;
  }

  /** @param {number} value Amostra crua. @param {number} timestampMs Precisa vir sempre da mesma origem de relógio (aqui, performance.now() do documento offscreen — ver src/background/offscreen.js). */
  filter(value, timestampMs) {
    if (this.lastTime == null) {
      this.lastTime = timestampMs;
      this.lastValue = value;
      this.xFilter.filter(value, 1); // primeira amostra: passa direto, nada pra suavizar ainda
      return value;
    }

    let dt = (timestampMs - this.lastTime) / 1000;
    this.lastTime = timestampMs;
    // Guarda contra dt<=0 (mensagens fora de ordem/duplicadas) ou um hiato
    // grande (aba ficou em background e o navegador atrasou os timers) —
    // nos dois casos, assume o intervalo normal de frame em vez de deixar
    // a derivada explodir ou zerar.
    if (!(dt > 0) || dt > 0.5) dt = 1 / 30;

    const rawVelocity = (value - this.lastValue) / dt;
    const smoothVelocity = this.dxFilter.filter(rawVelocity, alphaFromCutoff(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(smoothVelocity);
    const result = this.xFilter.filter(value, alphaFromCutoff(cutoff, dt));
    this.lastValue = result;
    return result;
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
    this.lastValue = 0;
  }
}
