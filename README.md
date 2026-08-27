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

## Como testar

Não existe algo como "rodar os testes automatizados" aqui — é uma extensão que
depende de câmera e olhos de verdade, então o teste é majoritariamente
manual. Um roteiro razoável, na ordem:

1. **Build limpo.** `rm -rf dist && npm run build` e recarregue a extensão
   em `chrome://extensions/` (ícone de atualizar no card da extensão).
   Confira no card se não aparece "Erro" — clique em **Erros** se aparecer.
2. **Service worker sem erro.** No mesmo card, clique em **service worker**
   (ou **Inspecionar visualizações**) para abrir o DevTools do background e
   veja se o console está limpo.
3. **Calibração.** Abra o popup → **Calibrar (9 pontos)**. Autorize a
   câmera quando o Chrome pedir. Olhe para cada ponto e pisque com os dois
   olhos — o ponto muda de azul para verde quando já capturou amostras
   suficientes, e avança sozinho após a piscada confirmar. Se travar num
   ponto, geralmente é iluminação ruim ou os olhos fora do quadro da webcam.
4. **Ativação.** No popup, **Ativar EyeMouse**. Um pontinho azul deve
   aparecer seguindo o seu olhar (pausado = cinza). Teste também `Alt+E` e
   o gesto piscar Esquerdo→Direito em menos de 500ms para pausar/retomar.
5. **Clique.** Olhe para um link/botão e pisque os dois olhos por
   150–400ms — deve disparar um clique de verdade na página (não só mover o
   cursor). Duas piscadas em menos de 350ms = duplo clique.
6. **Scroll.** Olhe para o topo ou o rodapé da tela por ~400ms para rolar
   automaticamente; pisque só o olho esquerdo (Page Down) ou só o direito
   (Page Up) para saltos maiores.
7. **Modo dwell.** No popup, troque o modo de clique para "Fixação do
   olhar" e ajuste o tempo — segure o olhar parado (dentro de ~15px) pelo
   tempo configurado para clicar sem piscar. Bom para quem cansa de piscar.
8. **Casos de erro.** Negue a permissão de câmera uma vez (em
   `chrome://settings/content/camera`, revogue para testar) e confirme que
   aparece um aviso legível em vez de travar silenciosamente. Abra o
   DevTools manualmente numa aba ativa e tente clicar — deve aparecer o
   aviso de que outro depurador já está anexado.
9. **Em sites variados.** Teste em pelo menos um site com muitos iframes
   (ex.: um site de notícias) e um SPA pesado (ex.: Gmail) — o clique via
   `chrome.debugger` funciona no frame principal; cliques dentro de
   `<iframe>` de outra origem não são o foco desta primeira versão.

Se quiser automatizar a parte de "a extensão sobe sem erro" (sem testar
câmera/olhos de verdade), dá pra usar Playwright com
`--use-fake-device-for-media-stream` — isso valida que os scripts carregam,
mas não substitui testar com uma webcam e um rosto reais.

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

## Como publicar na Chrome Web Store

**Aviso honesto antes de começar:** a permissão `debugger` é de longe o
maior obstáculo. O Google restringe bastante o uso dessa API fora de
ferramentas de desenvolvedor, e ela é o único jeito confiável de gerar
cliques que a própria página aceita como reais (eventos disparados via
`element.click()`/`dispatchEvent` têm `isTrusted: false` e muitos sites
ignoram). Não há garantia de aprovação — o PRD já previa isso na tabela de
riscos, com a mitigação de gravar um vídeo demonstrando o uso. Se a loja
rejeitar, a alternativa é distribuir como "carregar sem compactação" para
uso pessoal/organizacional (política de empresa via `ExtensionInstallForcelist`)
em vez de loja pública.

Passo a passo:

1. **Conta de desenvolvedor.** Crie uma em
   https://chrome.google.com/webstore/devconsole (taxa única de US$5,
   cobrada uma vez por conta, não por extensão).
2. **Build de produção limpo.**
   ```bash
   rm -rf dist node_modules
   npm install
   npm run download-model
   npm run build
   ```
3. **Substitua os ícones placeholder.** `public/icons/icon16.png`,
   `icon48.png` e `icon128.png` foram gerados por script
   (`scripts/make_icons.py`) só para o projeto rodar — troque por uma
   identidade visual de verdade antes de submeter.
4. **Zipe a pasta `dist/`** (não o projeto inteiro — `node_modules`,
   `src/`, etc. não vão no pacote): o zip deve conter `manifest.json` na
   raiz, não dentro de uma subpasta.
5. **Suba o zip** em "Add new item" no Developer Dashboard.
6. **Preencha a ficha da loja:**
   - Descrição, categoria (Acessibilidade/Produtividade), idioma.
   - Screenshots (1280×800 ou 640×400) e um ícone de loja 128×128.
   - **Política de privacidade** (obrigatória por causa da permissão de
     câmera): hospede um texto simples explicando que o vídeo é processado
     100% localmente, nunca é gravado nem enviado a servidores (RNF01) —
     um `.html` ou até uma página no GitHub Pages serve.
   - **Justificativas de permissão** (aba "Privacy practices" do
     dashboard): explique cada uma —
     `storage` (salvar calibração/preferências localmente),
     `offscreen` (manter a câmera processando entre trocas de aba),
     `debugger` (único jeito de gerar cliques nativos aceitos pelas
     páginas — mencione que é usado exclusivamente para isso, nunca para
     inspecionar dados do usuário), `host_permissions <all_urls>`
     (o cursor e o clique precisam funcionar em qualquer site que o
     usuário visite).
   - Declare "Não vendemos nem transferimos dados do usuário" — é verdade
     aqui, já que nada sai da máquina.
7. **Vídeo de demonstração.** Grave um vídeo curto mostrando calibração +
   clique real numa página comum, deixando claro por que `debugger` é
   necessário — anexe no campo de justificativa ou como um link
   (YouTube não-listado). Isso é exatamente a mitigação que o PRD sugeriu
   para esse risco.
8. **Envie para revisão.** Extensões com `debugger` costumam levar mais
   tempo (a revisão manual pode levar de alguns dias a poucas semanas).
   Se for rejeitada, o e-mail de rejeição normalmente aponta o motivo
   exato — geralmente pedem para reduzir permissões ou detalhar melhor a
   justificativa.
9. **Atualizações depois de publicada:** suba um novo zip com `version`
   incrementado em `public/manifest.json` (ex.: `1.0.1`) pelo mesmo
   Developer Dashboard — não precisa pagar de novo.

### Distribuir sem passar pela loja pública

- **Uso pessoal/teste:** continue usando "Carregar sem compactação" — não
  expira, mas só funciona com o Modo do desenvolvedor ativado naquele
  Chrome.
- **Empresa/organização (Google Workspace):** dá pra forçar a instalação
  via política (`ExtensionInstallForcelist` no Chrome gerenciado) apontando
  para um pacote `.crx` hospedado por vocês, sem precisar da Web Store
  pública — útil se o objetivo inicial é uso interno/institucional
  (ex.: uma clínica ou universidade) em vez de público geral.

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
