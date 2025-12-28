# Agente TurboWarp AI

Exemplo completo de um agente em Node.js que controla o editor TurboWarp/Scratch
via Puppeteer, monta blocos para sprites e estágio, integra conectividade com um
servidor WebSocket (estilo CloudLink) e salva o projeto final em `.sb3`.

## Pré-requisitos
- Node.js 18+
- Acesso à internet para carregar o editor do TurboWarp

## Como executar
1. Instale as dependências:
   ```bash
   npm install
   ```
2. Rode o agente:
   ```bash
   npm start
   ```
3. O script abrirá o TurboWarp, montará o jogo e salvará o arquivo em
   `dist/space-runner.sb3`.

## O que o agente faz
- Sobe um servidor WebSocket local simulando o protocolo do CloudLink.
- Carrega o editor TurboWarp, registra uma extensão customizada de WebSocket e
  cria variáveis globais de pontuação e sessão.
- Gera blocos para um sprite **Jogador** (movimento e coleta), um sprite
  **Gema** (reposicionamento ao ser tocado) e lógica de vitória no palco.
- Executa a bandeira verde, mantém comunicação com o servidor via blocos e
  exporta o projeto final.
