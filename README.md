# EyeMouse — Controle do Cursor por Rastreamento Ocular

Extensão Chrome (Manifest V3) que permite navegar 100% hands-free usando os
olhos: mover o cursor com o olhar, clicar piscando (ou por fixação/dwell),
rolar a página e alternar Ativo/Pausado por gestos ou atalho de teclado.
Implementada a partir do PRD/especificação técnica fornecidos, com algumas
correções e melhorias de arquitetura descritas na seção **"O que mudou em
relação ao documento original"** abaixo — vale a pena ler antes de mexer no
código.

## Como rodar

```bash
npm install
npm run download-model   # baixa public/models/face_landmarker.task (~3.7MB)
npm run build
```

Se `npm run download-model` falhar por causa de bloqueio de rede/allowlist
corporativa, baixe manualmente pela URL impressa no erro e salve em
`public/models/face_landmarker.task` (veja também `public/models/README.md`).

Depois do build:

1. Abra `chrome://extensions/`.
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta `dist/`.
4. Clique no ícone da extensão e depois em **Calibrar (9 pontos)** — a
   calibração é obrigatória antes do primeiro uso (RF04.1). Ela também abre
   sozinha na primeira instalação.
5. Depois de calibrar, clique em **Ativar EyeMouse** no popup (ou use
   `Alt+E`, ou pisque Esquerdo→Direito em menos de 500ms).

Para desenvolvimento contínuo, `npm run dev` roda o Vite em modo `--watch`
(ainda assim é preciso clicar em "Atualizar" na página de extensões do
Chrome a cada rebuild).

## Arquitetura

```
manifest.json (permissions, content_scripts, commands)
        │
        ├── background.js (service worker)
        │     • cria/fecha o documento offscreen
        │     • rastreia a aba ativa
        │     • executa cliques nativos via chrome.debugger (CDP)
        │     • roteia frames de gaze cru para a aba certa
        │     • Alt+E, GET_STATE/TOGGLE_STATE/SET_SETTINGS
        │
        ├── offscreen.html + offscreen.js (chrome.offscreen)
        │     • único lugar que toca a câmera
        │     • MediaPipe FaceLandmarker (WASM/GPU, tudo local)
        │     • calcula EAR (piscada) e razão íris/olho (olhar)
        │     • detector simples de pouca luz
        │
        ├── content.js (injetado em todas as páginas)
        │     • aplica a calibração (regressão) -> fração de tela
        │     • suavização EMA, detector de piscada/wink, dwell, scroll
        │     • desenha o cursor (Shadow DOM) e pede cliques ao background
        │
        ├── popup/ (UI da extensão)
        ├── calibration/ (fluxo de calibração de 9 ou 3 pontos)
        └── utils/ (storage, matemática, constantes — sem dependências)
```

Tudo o que decide "o que fazer" com a piscada (clicar, rolar, alternar
estado) mora no **content script**, porque é ele quem conhece o pixel real
da página. O **offscreen** só entrega números crus (posição normalizada do
olhar + abertura das pálpebras). O **background** só orquestra processos e
executa ações que exigem privilégio de extensão (debugger, storage, abas).

Estado (Ativo/Pausado, configurações, calibração) mora **só** em
`chrome.storage.local`. Popup, content script e página de calibração leem o
valor atual e escutam `chrome.storage.onChanged` diretamente — não há
mensagens de "avisar todo mundo que o estado mudou" para não duplicar fonte
de verdade nem correr risco de uma aba perder um broadcast.

## O que mudou em relação ao documento original

O PRD e a especificação técnica foram o ponto de partida, mas alguns pontos
do código de exemplo tinham problemas reais que valia a pena corrigir em vez
de replicar:

- **Câmera movida para um documento offscreen.** No design original, cada
  content script (ou seja, cada aba/site) abriria sua própria captura de
  webcam. Isso pediria permissão de câmera *por site* e rodaria o
  MediaPipe várias vezes ao mesmo tempo se houvesse várias abas abertas.
  Com `chrome.offscreen`, a câmera é aberta uma única vez, sobrevive à
  troca de abas e nunca fica exposta ao código da página visitada — o que
  também é melhor para RNF01 (privacidade) e RNF03 (superfície de
  permissões).
- **WASM do MediaPipe servido localmente**, em vez do CDN
  (`cdn.jsdelivr.net`) usado no exemplo. Com a câmera isolada no contexto
  da extensão, isso também elimina a necessidade de `web_accessible_resources`
  para o modelo `.task` e para `calibration.html` — nenhum recurso interno
  fica exposto a `<all_urls>`.
- **Cálculo do EAR (Eye Aspect Ratio) corrigido.** O código de exemplo do
  documento técnico media a distância entre pontos incorretos (dois pontos
  da pálpebra superior entre si, em vez de superior-com-inferior), o que
  faria a piscada nunca ser detectada corretamente. A fórmula implementada
  aqui segue a definição clássica de Soukupová & Čech.
- **Olhar invariante a movimento de cabeça.** O exemplo original usava a
  posição absoluta da íris na imagem da webcam para mover o cursor — mover
  a cabeça (sem mover os olhos) moveria o cursor do mesmo jeito. Aqui o
  sinal usado é a posição da íris *dentro da caixa delimitadora do próprio
  olho*, que é muito mais robusta a pequenos deslocamentos de cabeça.
- **Calibração de verdade.** O RF04.1 pede uma grade de 9 pontos, mas o
  código de exemplo já ia direto de "posição da íris" para "posição do
  cursor" sem nenhuma calibração. Foi implementada uma regressão polinomial
  (mínimos quadrados, sem dependências externas) treinada nos 9 pontos, além
  de uma recalibração rápida de 3 pontos (mitigação de risco sugerida no
  próprio PRD para troca de óculos/iluminação).
- **Dwell click, wink e o gesto de alternância de estado** (RF02.4, RF03.2,
  RF04.3) não apareciam no código de exemplo — foram implementados do zero.
- **`chrome.debugger` anexado uma vez por aba**, não a cada clique. Anexar e
  desanexar em todo clique piscaria repetidamente o aviso "X começou a
  depurar este navegador" do Chrome; agora a sessão de debugger fica aberta
  enquanto o EyeMouse estiver ativo naquela aba.
- **Permissões reduzidas.** `activeTab` e `scripting` do manifest de exemplo
  não eram usados por nada no fluxo real e foram removidos; `<all_urls>` em
  `web_accessible_resources` também saiu (ver ponto do offscreen acima).
  Isso ajuda na revisão da Chrome Web Store (RNF03).

## Limitações conhecidas / próximos passos

- O clique nativo via `chrome.debugger` não funciona dentro de `chrome://`,
  da Web Store e de algumas páginas internas do Chrome — é uma limitação da
  própria API, não do código.
- Se o DevTools estiver aberto manualmente na mesma aba, o `chrome.debugger`
  não consegue anexar (Chrome só permite um debugger por aba); o content
  script mostra um aviso nesse caso.
- A calibração assume que a janela do navegador não muda de tamanho entre a
  calibração e o uso — recalibre após redimensionar bastante a janela ou
  trocar de monitor.
- Os ícones em `public/icons/` são placeholders gerados por script
  (`scripts/make_icons.py`); substitua por uma identidade visual definitiva
  antes de publicar na Chrome Web Store.
- Testado com build (`npm run build`) e carregamento automatizado da
  extensão (service worker, content script, popup e página de calibração
  sobem sem erros). Não foi possível testar o pipeline de câmera com um
  rosto real neste ambiente — teste isso na sua máquina com uma webcam de
  verdade antes de considerar o dwell/piscar "prontos".
