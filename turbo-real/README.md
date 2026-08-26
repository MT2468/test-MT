# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil. O projeto se inspira no ritmo e na acessibilidade dos kart racers, sem copiar personagens, pistas, assets, músicas ou identidade visual de franquias existentes.

## Fase 11 - Mobile e gamepad

A Fase 11 transforma a camada de entrada em um sistema multiplataforma. Teclado, controle físico e toque agora alimentam o mesmo `PlayerInput`, enquanto física, IA e regras de corrida continuam recebendo apenas comandos abstratos de direção, aceleração, drift e ações.

### PlayerInput unificado

`src/input/PlayerInput.ts` combina três fontes sem acoplar a simulação ao dispositivo:

- teclado;
- Gamepad API;
- Pointer Events para toque.

A saída continua sendo `DrivingInput` e eventos de borda já usados pelo jogo. Isso evita criar versões separadas da física para PC, controle e celular.

O sistema também limpa entradas ao perder foco, ocultar a aba, pausar ou trocar de contexto, reduzindo aceleração presa, drift fantasma e escolhas disparadas por botão antigo.

### Mapeamento de gamepad

O primeiro controle conectado com mapeamento `standard` é priorizado. Se não existir, o primeiro controle disponível é usado.

| Ação | Gamepad |
| --- | --- |
| Virar | Analógico esquerdo ou D-pad |
| Acelerar | RT / R2 |
| Frear / Ré | LT / L2 |
| Drift | A / Cross |
| Usar item | X / Square |
| Guardar R$10 na reserva | Y / Triangle |
| Retirar R$10 da reserva | B / Circle |
| Pausar / continuar | Start / Menu |
| Decisão financeira opção 1 | A / Cross |
| Decisão financeira opção 2 | B / Circle |

O analógico possui deadzone e os botões que devem acontecer uma única vez usam detecção de borda. Conectar um controle com um botão já segurado não dispara item ou pausa automaticamente.

### Menus com gamepad

`createGameUi.ts` também passa a observar Gamepad API enquanto os menus estão abertos.

- D-pad ou analógico vertical muda o foco;
- `A` ativa o botão em foco;
- `B` funciona como voltar em pausa/resultados;
- `Start` larga pelo menu e corre novamente pelos resultados;
- foco de gamepad recebe contorno visual próprio;
- mouse/toque remove o destaque de gamepad ao assumir a interação.

A navegação de menu é separada da pilotagem para não transformar o renderer ou a simulação em gerenciadores de foco DOM.

### Controles de toque

Telas com toque recebem uma camada DOM própria apenas durante a corrida.

A disposição protege o centro da pista:

- esquerda: dois botões de direção;
- direita: acelerar e frear/ré;
- acima dos pedais: drift e item;
- acima da direção: guardar/retirar reserva;
- topo: pausa;
- decisões financeiras: dois botões grandes dedicados na parte inferior.

Os controles usam Pointer Events e aceitam múltiplos dedos ao mesmo tempo. É possível, por exemplo, acelerar, esterçar e segurar drift simultaneamente.

Também são aplicados:

- `touch-action: none` nos controles;
- prevenção de seleção de texto e menu de contexto;
- `safe-area-inset-*` para aparelhos com recortes/bordas;
- layout reduzido em telas baixas;
- aviso discreto de que a corrida fica melhor em horizontal quando o telefone está em retrato;
- HUD levantado alguns pixels em aparelhos touch para não colidir com os pedais.

Os controles desaparecem em pausa, menu e resultados. Durante uma decisão, direção/pedais somem e ficam apenas os botões de escolha.

### Arquitetura

```text
src/
├── input/
│   ├── actions.ts
│   ├── KeyboardInput.ts   # legado das fases anteriores
│   └── PlayerInput.ts     # teclado + gamepad + toque
├── ui/createGameUi.ts     # navegação de menu por teclado/toque/gamepad
├── render/app/GameApp.ts  # consome PlayerInput
└── controls.css           # controles touch + foco de gamepad
```

Fluxo de entrada:

```text
teclado ─┐
gamepad ─┼─> PlayerInput ─> DrivingInput / ações ─> GameApp ─> física/controladores
toque ───┘
```

Nenhuma regra financeira, item, IA ou física consulta `navigator.getGamepads()` ou eventos de ponteiro diretamente.

## Controles de teclado

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

### Checklist funcional da Fase 11

- teclado continua funcionando como antes;
- gamepad pode ser conectado antes ou durante a sessão;
- RT/LT têm resposta analógica;
- D-pad funciona como fallback de direção;
- Start pausa e continua;
- A/B selecionam decisões sem repetir ao manter pressionado;
- menu e resultados podem ser navegados sem mouse;
- dois ou mais controles touch podem ser pressionados simultaneamente;
- pausar enquanto acelera não deixa acelerador preso;
- controles touch não cobrem o centro da pista;
- retrato continua utilizável, mas sugere orientação horizontal.

## Conteúdo acumulado até a Fase 11

O protótipo já possui:

- circuito fechado Avenida do Troco;
- física arcade Rapier;
- drift e mini-turbo;
- 7 rivais de IA;
- checkpoints, 3 voltas e classificação;
- caixas e quatro itens arcade;
- saldo, reserva, dívida, custos, juros simulados e premiação;
- Reserva Expressa, Crédito Turbo e Atalho Premium;
- menu inicial, pausa, reinício, saída para menu e resultados;
- motor e efeitos procedurais;
- partículas de drift, boost, impacto e itens;
- linhas de velocidade;
- câmera e iluminação refinadas;
- teclado, gamepad e controles touch.

Os valores financeiros são fictícios de gameplay e não representam taxas, produtos ou recomendações financeiras reais.

## Limite intencional da Fase 11

Ainda existe apenas um circuito e um modo principal de corrida. Não entram nesta etapa remapeamento personalizado de botões, vibração/haptics, multiplayer, carreira ou campeonato. O suporte touch prioriza navegadores móveis modernos com Pointer Events.

## Próxima fase

**Fase 12: expansão de conteúdo.**

O próximo passo é usar a fundação já completa para adicionar mais circuitos, copas, variações de cenário e conteúdo financeiro, reaproveitando física, IA, itens, decisões, menus e o novo sistema de entrada multiplataforma.
