import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// A extensão precisa de três "mundos" de execução distintos:
//   - background  -> service worker (MV3, "type": "module" no manifest)
//   - offscreen   -> documento invisível que segura a câmera + MediaPipe,
//                    carregado via <script type="module"> (offscreen.html)
//   - content     -> injetado em todas as páginas via manifest.content_scripts,
//                    que SEMPRE roda como script clássico — Chrome não
//                    suporta `import` estático nesse contexto.
//
// background e offscreen podem compartilhar chunks entre si sem problema
// (ambos são módulos ES de verdade), mas se content.js entrasse no mesmo
// build o Rollup extrairia os módulos que eles têm em comum (utils/*) para
// um chunk separado e inseriria um `import` no topo de content.js — que
// quebraria com "Cannot use import statement outside a module" assim que
// injetado numa página. Por isso o content script ganha um build à parte,
// em formato IIFE, sem nenhum `import` no arquivo final (ver
// vite.content.config.js e o script "build" do package.json).
//
// popup/ e calibration/ não importam nada de node_modules, então também
// não precisam passar pelo bundler: são copiados como estão (mantendo os
// imports relativos para utils/, também copiada — ver targets abaixo).
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome100',
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/serviceWorker.js'),
        offscreen: resolve(__dirname, 'src/background/offscreen.js')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'src/popup/*', dest: 'popup' },
        { src: 'src/calibration/*', dest: 'calibration' },
        { src: 'src/background/offscreen.html', dest: '.' },
        // popup.js e calibration.js não passam pelo bundler (não importam
        // nada de node_modules), mas usam import relativo para utils/ — por
        // isso a pasta precisa ser copiada mantendo a mesma profundidade
        // relativa (dist/popup/../utils == dist/utils).
        { src: 'src/utils/*', dest: 'utils' },
        // Wasm do MediaPipe servido localmente (em vez do CDN do exemplo
        // oficial): mantém RNF01 (nada sai da máquina do usuário) e evita
        // exigir 'unsafe-eval'/hosts externos na CSP da extensão (RNF03).
        { src: 'node_modules/@mediapipe/tasks-vision/wasm/*', dest: 'wasm' }
      ]
    })
  ]
});
