# 🗺️ EyeMouse — Roadmap & Visão de Futuro

Este documento detalha o planejamento de melhorias, visões de longo prazo e ideias de funcionalidades para as próximas versões do **EyeMouse**, com foco em **Tecnologia Assistiva, Inteligência Artificial Preditiva e Acessibilidade Avançada**.

---

## 🔮 Visão Geral: IA Assistiva e Inferência de Intenção

O objetivo central das próximas versões é evoluir o EyeMouse de uma ferramenta de controle de cursor passivo para um **Assistente Assistivo Inteligente**. Pessoas com limitações motoras severas ou movimentos oculares restritos frequentemente encontram dificuldades em atingir alvos pequenos na tela ou realizar múltiplos cliques sequenciais.

A IA atuará identificando a **intenção do usuário** a partir do contexto da tela e de micro-movimentos oculares, antecipando ações e sugerindo atalhos automáticos.

---

## 📌 Milestones & Funcionalidades Planejadas

### 🧠 Versão 2.0 — IA Preditiva e Interação Adaptativa

#### 1. Inferência de Intenção por Movimento Ocular Limitado
- **Reconhecimento de Hesitação / Dwell Preditivo**: Quando o olhar do usuário paira próximo a uma área com múltiplos elementos interativos (ex: links pequenos, botões próximos), a IA analisa a estrutura da página (DOM) e identifica o alvo mais provável.
- **Atração Magnética do Cursor (*Target Snap*)**: Atração suave do pontinho do cursor para o centro do botão/link mais próximo ao detectar intenção de clique, reduzindo a fadiga ocular.
- **Magnificação Visual e Lupa por Esforço Ocular (*Smart Zoom por Squinting / Flexão Ocular*)**:
  - **Detecção de Olhos Semicerrados (*Squint Detection*)**: Monitoramento da taxa de abertura palpebral (EAR). Quando o usuário "flexiona" ou estreita os olhos involuntariamente tentando enxergar um detalhe ou texto pequeno, o MediaPipe identifica a redução parcial mantida do EAR sem piscada completa.
  - **Lupa Instantânea Automatizada**: O sistema aciona instantaneamente um zoom/ampliação magnética focada exatamente na região para onde o olhar está direcionado, facilitando a leitura e a precisão do clique sem necessitar de comandos manuais.

#### 2. Menu Radial de Ações Preditivas (*Contextual Action Wheel*)
- Ao detectar que o usuário está navegando em formulários, listas ou artigos, um menu discreto pode surgir com sugestões contextuais acionáveis por um único olhar ou piscada:
  - *Em formulários*: "Preencher campo", "Avançar", "Limpar".
  - *Em artigos/vídeos*: "Rolar para o próximo capítulo", "Dar Play/Pause", "Alternar Modo Leitura".
  - *Em modais/popups*: "Fechar aviso", "Aceitar cookies".

---

### 🧬 Versão 3.0 — Modelos de IA On-Device e Interação Multimodal

#### 1. Integração com IA Generativa Local (Chrome Built-in AI / WebLLM)
- Uso da **Prompt API (Gemini Nano local)** integrada ao navegador para entender o conteúdo da página web ativa.
- **Completamento de Ações Complexas**: A IA interpreta o contexto visual e sugere respostas rápidas ou preenchimentos em sistemas web, bastando a confirmação visual do usuário.

#### 2. Interação Multimodal (Olhar + Voz)
- Combinação de rastreamento ocular com comandos de voz de baixa latência (Web Speech API / Whisper WASM local).
- Exemplo: Olhar para um campo de texto e dizer *"digitar olá mundo"* ou olhar para uma imagem e dizer *"salvar"*.

#### 3. Aprendizado Contínuo e Perfil Motor Personalizado
- **Calibração Dinâmica e Passiva**: O sistema ajusta continuamente a matriz de regressão conforme o uso diário, eliminando a necessidade de refazer a tela de calibração de 9 pontos.
- **Filtros Adaptativos de Tremor**: Algoritmos de filtragem espacial inteligentes (ex: Filtro de Kalman adaptativo) para suavizar variações bruscas de movimento causadas por condições neuromusculares (ex: Parkinson, ELA, Paralisia Cerebral).

---

### 🌐 Melhorias de Experiência e Infraestrutura

- [ ] **Suporte Multi-Monitor**: Extensão da calibração e do overlay para configurações de múltiplos displays.
- [ ] **Modo de Baixa Luminosidade**: Compensação automática por software da iluminação da webcam para uso noturno.
- [ ] **Painel de Análise de Fadiga Ocular**: Alertas amigáveis sugerindo pausas quando detectar padrões de piscada lenta ou fadiga visual contínua.
- [ ] **Perfis de Usuário Exportáveis**: Salvar e carregar configurações de sensibilidade e mapas de calibração em arquivos JSON locais.

---

## 💡 Como Contribuir ou Sugerir Ideias

Tens ideias de funcionalidades ou necessidades específicas de acessibilidade? 
Abra uma **Issue** ou **Discussion** no repositório descrevendo o cenário de uso!
