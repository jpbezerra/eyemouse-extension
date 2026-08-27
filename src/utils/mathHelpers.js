// Funções matemáticas puras e sem dependências externas usadas pela
// engine de gaze e pela calibração.

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/**
 * Razão de abertura palpebral (Eye Aspect Ratio).
 * Espera 6 pontos na ordem hexagonal clássica de Soukupová & Čech:
 * p1 = canto externo, p2/p3 = pálpebra superior, p4 = canto interno,
 * p5/p6 = pálpebra inferior.
 *
 *        p2    p3
 *   p1 ●────●────● p4
 *        p6    p5
 *
 * EAR = (‖p2-p6‖ + ‖p3-p5‖) / (2 ‖p1-p4‖)
 */
export function calculateEAR([p1, p2, p3, p4, p5, p6]) {
  const vertical1 = dist(p2, p6);
  const vertical2 = dist(p3, p5);
  const horizontal = dist(p1, p4) || 1e-6;
  return (vertical1 + vertical2) / (2 * horizontal);
}

/**
 * Posição normalizada (0..1) da íris dentro da caixa delimitadora do olho.
 * Usar a caixa do próprio olho (em vez da posição absoluta da íris na
 * imagem) torna a leitura invariante a pequenos deslocamentos de cabeça,
 * que de outra forma seriam confundidos com movimento do olhar.
 */
export function irisRatioInEye(iris, eyeLandmarks) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of eyeLandmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const rx = (iris.x - minX) / ((maxX - minX) || 1e-6);
  const ry = (iris.y - minY) / ((maxY - minY) || 1e-6);
  return { rx: clamp(rx, -1, 2), ry: clamp(ry, -1, 2) };
}

/**
 * Expande (rx, ry) em um vetor de características polinomial de 2º grau.
 * 9 pontos de calibração (RF04.1) dão graus de liberdade suficientes para
 * resolver esses 6 coeficientes por mínimos quadrados, permitindo capturar
 * uma leve não-linearidade na relação olho -> tela (mapeamento tipo
 * "quadric" comumente usado em eye tracking baseado em regressão).
 */
export function polynomialFeatures(rx, ry) {
  return [1, rx, ry, rx * ry, rx * rx, ry * ry];
}

/**
 * Resolve o sistema de mínimos quadrados X·c = y via equações normais
 * (Xᵀ·X·c = Xᵀ·y), decompostas por eliminação de Gauss com pivô parcial.
 * Sem dependências externas — suficiente para o tamanho do nosso problema
 * (poucas dezenas de amostras, 6 coeficientes).
 */
export function solveLeastSquares(X, y) {
  const n = X.length;
  const k = X[0].length;

  // Xᵀ·X (k x k) e Xᵀ·y (k)
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty = new Array(k).fill(0);

  for (let row = 0; row < n; row++) {
    for (let i = 0; i < k; i++) {
      Xty[i] += X[row][i] * y[row];
      for (let j = 0; j < k; j++) {
        XtX[i][j] += X[row][i] * X[row][j];
      }
    }
  }

  // Regularização de Tikhonov (ridge) minúscula: evita matriz singular
  // quando há colinearidade entre amostras de calibração.
  const ridge = 1e-6;
  for (let i = 0; i < k; i++) XtX[i][i] += ridge;

  return gaussianSolve(XtX, Xty);
}

function gaussianSolve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivotRow][col])) pivotRow = row;
    }
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];

    const pivot = M[col][col] || 1e-9;
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / pivot;
      for (let c = col; c <= n; c++) M[row][c] -= factor * M[col][c];
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = M[row][n];
    for (let col = row + 1; col < n; col++) sum -= M[row][col] * x[col];
    x[row] = sum / (M[row][row] || 1e-9);
  }
  return x;
}

/** Aplica os coeficientes de calibração a um par (rx, ry) -> fração 0..1. */
export function applyCalibration(coefX, coefY, rx, ry) {
  const f = polynomialFeatures(rx, ry);
  const evalPoly = (coef) => coef.reduce((acc, c, i) => acc + c * f[i], 0);
  return {
    xFrac: clamp(evalPoly(coefX), 0, 1),
    yFrac: clamp(evalPoly(coefY), 0, 1)
  };
}
