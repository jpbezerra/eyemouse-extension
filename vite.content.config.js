import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Build dedicado do content script: formato IIFE, um único entry point,
// sem code-splitting — o arquivo final não pode conter nenhum `import`
// porque manifest.content_scripts injeta isso como script clássico
// (ver o comentário grande em vite.config.js). emptyOutDir:false porque
// esse build roda DEPOIS do principal, no mesmo dist/.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome100',
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/index.js')
      },
      output: {
        format: 'iife',
        entryFileNames: '[name].js',
        inlineDynamicImports: true
      }
    }
  }
});
