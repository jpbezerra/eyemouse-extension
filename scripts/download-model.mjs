// Baixa o modelo do MediaPipe Face Landmarker para public/models/.
// Rode isso na SUA máquina (fora de qualquer sandbox/proxy restrito):
//   npm run download-model
//
// Se a rede da sua máquina também bloquear storage.googleapis.com (redes
// corporativas costumam ter allowlist), baixe manualmente pela URL abaixo
// e salve o arquivo em public/models/face_landmarker.task.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '..', 'public', 'models', 'face_landmarker.task');

async function main() {
  console.log(`Baixando modelo de:\n  ${MODEL_URL}`);
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    throw new Error(`Falha ao baixar o modelo: HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buffer);
  console.log(`Modelo salvo em: ${outPath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(err.message);
  console.error(`\nSe o download falhar, baixe manualmente pela URL acima e salve como:\n  ${outPath}`);
  process.exit(1);
});
