# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil. O projeto usa Three.js, TypeScript, Vite e Rapier, sem copiar personagens, pistas, assets, músicas ou identidade visual de franquias existentes.

## Fase 12 - Expansão de conteúdo

A Fase 12 transforma a antiga pista única em uma pequena copa jogável. Física, IA, itens, áudio, decisões e controles continuam sendo os mesmos sistemas; pistas passam a ser dados de catálogo com traçado, tema visual e contexto financeiro próprios.

## Copa Primeiro Salário

A primeira copa agora possui quatro circuitos selecionáveis:

| # | Circuito | Dificuldade | Conceito | Renda por setor | Custo por volta | Imprevisto |
| --- | --- | --- | --- | ---: | ---: | ---: |
| 1 | Avenida do Troco | Fácil | Troco, caixa e reserva | R$6 | R$18 | R$45 |
| 2 | Feira Central | Médio | Renda variável e pequenos custos | R$7 | R$20 | R$38 |
| 3 | Circuito do Orçamento | Difícil | Planejamento de despesas | R$8 | R$24 | R$55 |
| 4 | Corrida do Fim do Mês | Difícil | Pressão de caixa e reserva | R$5 | R$26 | R$60 |

Todos os valores acima são fictícios de gameplay. Eles não representam preços, taxas, produtos financeiros ou recomendações reais.

### Avenida do Troco

Circuito urbano-futurista original que continua sendo a porta de entrada da copa. Tem pista larga, cenário de praça, palmeiras e prédios coloridos. A economia é a referência de equilíbrio da campanha.

### Feira Central

Traçado mais estreito e movimentado, com fileiras de barracas, toldos coloridos e curvas mais fechadas. A renda por setor cresce, mas o custo operacional também aumenta.

### Circuito do Orçamento

Distrito financeiro estilizado com torres procedurais e uma sequência técnica de curvas. É a pista que mais explicita que receita maior não elimina a necessidade de planejar despesas.

### Corrida do Fim do Mês

Circuito mais longo e crepuscular, com iluminação quente, postes e cenário de fim de expediente. A entrada por setor é menor, os custos sobem e a reserva passa a ter peso maior no resultado financeiro.

## Catálogo de pistas

`src/track/firstTrack.ts` continua exportando `TrackDefinition`, mas agora também contém o gerador genérico `createTrackDefinition`.

`src/track/catalog.ts` concentra o conteúdo da copa:

```text
TrackBlueprint
  ├── controlPoints
  ├── largura / barreira
  ├── visuals
  ├── economy
  └── content
       ↓
createTrackDefinition
       ↓
TrackDefinition
```

Cada pista gera automaticamente:

- amostras Catmull-Rom;
- tangentes e vetores laterais;
- bordas da pista;
- barreiras;
- spawn e heading;
- bounds;
- 6 checkpoints;
- 5 fileiras de caixas de item;
- 3 voltas.

Isso permite criar novas pistas sem duplicar RaceController, IA, Rapier ou ItemController.

## Cenários temáticos

`createTrackScene` deixou de ter Avenida do Troco hardcoded. Agora recebe `track.visuals.theme` e monta um cenário procedural apropriado:

- `urban`: praça, palmeiras e prédios;
- `market`: barracas e toldos de feira;
- `budget`: torres e escultura de barras;
- `month-end`: iluminação de crepúsculo, postes e prédios baixos.

Cores de céu, névoa, chão, zebra, barreira, arco de largada, exposição e iluminação também vêm dos dados da pista.

Nenhum novo modelo 3D ou arquivo de textura externo foi adicionado nesta fase.

## Economia por circuito

`FinanceController` agora recebe `TrackEconomyConfig`.

Cada circuito pode definir:

- renda por checkpoint;
- custo operacional por volta;
- custo e rótulo do imprevisto;
- taxa fictícia de juros da dívida.

A lógica financeira continua centralizada no controller. O renderizador e a física não conhecem essas regras.

A taxa simulada de dívida permanece em 5% por volta nos quatro circuitos da Fase 12. Ela existe apenas para tornar o efeito de dívida perceptível em uma corrida curta e não representa taxa real de banco, cartão, Selic ou mercado.

## Seleção de circuito

O menu ganhou uma faixa própria da Copa Primeiro Salário com quatro cartões. Cada cartão mostra:

- ordem na copa;
- nome;
- dificuldade;
- conceito financeiro;
- renda por setor;
- custo por volta.

Mouse, toque e gamepad podem selecionar os cartões. O sistema de navegação de gamepad da Fase 11 detecta os novos botões automaticamente.

Ao largar, a pista selecionada é copiada para a sessão atual. `Reiniciar Corrida` mantém a mesma pista, enquanto voltar ao menu permite escolher outra.

## Arquitetura acumulada

```text
src/
├── track/
│   ├── firstTrack.ts       # contrato + gerador genérico + Avenida do Troco
│   └── catalog.ts          # quatro pistas da Copa Primeiro Salário
├── render/track/
│   └── createTrackScene.ts # cenário procedural por tema
├── simulation/finance/
│   └── FinanceController.ts
├── ui/
│   ├── createGameUi.ts
│   └── createTrackSelector.ts
├── content.css
└── main.ts
```

A separação continua intencional:

1. pista é dado;
2. corrida e IA consomem `TrackDefinition`;
3. Rapier cria colisores a partir das mesmas amostras;
4. Three.js apenas renderiza o tema;
5. FinanceController recebe somente a configuração econômica;
6. UI seleciona qual definição será usada na próxima sessão.

## Controles

Teclado, gamepad e toque continuam disponíveis.

### Teclado

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

Validação esperada:

```bash
npm run typecheck
npm run build
```

## Conteúdo acumulado até a Fase 12

O protótipo possui:

- 4 circuitos na Copa Primeiro Salário;
- física arcade Rapier;
- drift e mini-turbo;
- 7 rivais de IA;
- checkpoints, voltas e classificação;
- quatro itens arcade;
- saldo, reserva, dívida, custos, juros simulados e premiação;
- decisões Reserva Expressa, Crédito Turbo e Atalho Premium;
- menu, pausa, reinício e resultados;
- áudio procedural;
- partículas e linhas de velocidade;
- câmera e iluminação refinadas;
- teclado, gamepad e controles touch;
- cenário e pressão econômica diferentes por circuito.

## Limite intencional da Fase 12

Ainda não entram as Copas Pix, Crédito, Reserva e Futuro, carreira/campeonato persistente ou multiplayer. As quatro pistas desta fase usam as três decisões financeiras já existentes; novas famílias de decisões ficam para expansão posterior.

## Próxima fase

**Fase 13: playtest e balanceamento.**

O próximo passo é validar a copa inteira, medir IA, tempos de volta, frequência/força dos itens, economia das quatro pistas, legibilidade mobile e dificuldade relativa antes de aumentar novamente o conteúdo.
