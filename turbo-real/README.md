# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil. O projeto se inspira no ritmo e na acessibilidade dos kart racers, sem copiar personagens, pistas, assets ou identidade visual de franquias existentes.

## Fase 9 - HUD e menus completos

A Fase 9 transforma o protótipo das fases anteriores em uma sessão de jogo completa. Agora existe um fluxo claro de menu → corrida → pausa → resultados, sem recarregar a página para reiniciar.

### Menu principal

Ao abrir o jogo, a física ainda não é criada. O jogador vê primeiro uma tela de corrida rápida com:

- identidade do Turbo Real;
- Avenida do Troco selecionada;
- 3 voltas;
- 8 pilotos;
- 4 itens arcade;
- 3 decisões financeiras;
- gaveta compacta de controles;
- botão de largada e atalho `Enter`.

A seleção já é estruturada como uma superfície própria para receber novas pistas e modos nas fases futuras, embora nesta fase exista apenas a Avenida do Troco.

### Sessão reiniciável

`main.ts` passa a controlar a vida útil da corrida.

Cada largada cria do zero:

- `GameState`;
- mundo Rapier;
- IA;
- `RaceController`;
- `ItemController`;
- `FinanceController`;
- `DecisionController`;
- HUD;
- renderer Three.js.

Ao reiniciar ou voltar ao menu, a sessão anterior é descartada e seus recursos são liberados. Não existe `location.reload()` como parte do fluxo normal.

### Pausa real

`Esc` alterna a pausa durante a pilotagem.

Enquanto a corrida está pausada:

- física não avança;
- IAs não avançam;
- cronômetro não avança;
- itens e hazards não avançam;
- finanças não avançam;
- animações de mundo ficam congeladas;
- o menu mostra volta, posição e tempo atuais.

O menu de pausa oferece:

1. continuar;
2. reiniciar corrida;
3. voltar ao menu principal.

Decisões financeiras continuam sendo modais próprias e não competem com o menu de pausa.

### Resultado de corrida

Quando o jogador cruza a chegada final, a simulação também congela. A antiga caixa simples de chegada foi substituída por uma tela de resultados com:

- colocação do jogador;
- tempo total;
- melhor volta;
- classificação dos 8 pilotos;
- saldo final;
- reserva final;
- dívida final;
- patrimônio líquido de jogo;
- custos gerados pelas decisões;
- valor do imprevisto absorvido pela reserva;
- histórico das escolhas financeiras;
- botão para correr novamente;
- botão para voltar ao menu.

`Enter` inicia uma nova corrida a partir dos resultados.

### HUD reorganizado

Durante a pilotagem, o HUD volta a se concentrar apenas em informação que muda em tempo real:

- posição, volta, setor e cronômetro;
- saldo, reserva, dívida e compromissos futuros;
- item atual;
- drift/turbo;
- velocidade;
- avisos temporários;
- cartão de decisão somente quando necessário.

A lista permanente de controles foi removida do playfield e movida para menu/pausa. A tela de chegada também saiu do HUD e virou uma superfície própria de resultados.

### Arquitetura de UI

```text
src/
├── ui/
│   ├── createGameUi.ts   # menu, pausa e resultados
│   └── createHud.ts      # telemetria da corrida
├── render/app/GameApp.ts # simulação, pause/resume e render
├── simulation/state.ts   # racing | paused | decision | finished
└── menus.css             # superfícies de interface da Fase 9
```

A divisão fica assim:

1. `GameApp` é responsável pelo loop e por congelar/descongelar a sessão;
2. `createGameUi` é responsável por navegação, botões e resultados;
3. `createHud` exibe somente telemetria e decisões contextuais;
4. `main.ts` cria e destrói sessões completas;
5. física, corrida, itens e finanças continuam independentes do DOM.

## Controles

| Ação | Teclas |
| --- | --- |
| Acelerar | `W` ou `↑` |
| Frear / Ré | `S` ou `↓` |
| Virar | `A/D` ou `←/→` |
| Drift | `Shift` |
| Usar item | `Espaço` |
| Guardar R$10 na reserva | `E` |
| Retirar R$10 da reserva | `Q` |
| Escolhas financeiras | `1` / `2` |
| Pausar / continuar | `Esc` |
| Largar / correr novamente | `Enter` |

## Executar

```bash
npm install
npm run dev
```

Validação:

```bash
npm run typecheck
npm run build
```

## Conteúdo acumulado até a Fase 9

O protótipo já possui:

- circuito fechado Avenida do Troco;
- física arcade Rapier;
- drift e mini-turbo;
- 7 rivais de IA;
- checkpoints, 3 voltas e classificação;
- caixas e quatro itens arcade;
- saldo, reserva, dívida, custos, juros simulados e premiação;
- Reserva Expressa, Crédito Turbo e Atalho Premium;
- menu inicial, pausa, reinício, saída para menu e resultados.

Os valores financeiros são fictícios de gameplay e não representam taxas, produtos ou recomendações financeiras reais.

## Limite intencional da Fase 9

Ainda não entram áudio completo, partículas/polimento final, suporte dedicado a gamepad/mobile, novos circuitos, carreira/campeonato ou multiplayer. O menu já deixa a arquitetura pronta para essas expansões, sem fingir que conteúdo ainda inexistente está disponível.

## Próxima fase

**Fase 10: som, partículas e polimento.**

O próximo passo é dar peso audiovisual ao que já existe: motor, drift, impactos, itens, feedback de UI, partículas de velocidade e acabamento de câmera/iluminação, preservando desempenho e legibilidade.
