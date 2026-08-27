// Índices dos 478 pontos do MediaPipe Face Landmarker usados pela engine.
// Ambas as listas seguem a mesma ordem hexagonal (ver mathHelpers.calculateEAR):
// [cantoExterno, pálpebraSup1, pálpebraSup2, cantoInterno, pálpebraInf2, pálpebraInf1]

export const LEFT_EYE_IDX = [33, 160, 158, 133, 153, 144];
export const RIGHT_EYE_IDX = [263, 387, 385, 362, 380, 373];

// Centros da íris (o modelo face_landmarker já inclui os 10 pontos de íris
// além dos 468 pontos base — attention mesh).
export const LEFT_IRIS_CENTER_IDX = 468;
export const RIGHT_IRIS_CENTER_IDX = 473;
