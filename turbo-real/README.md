# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil. O projeto se inspira no ritmo e na acessibilidade dos kart racers, sem copiar personagens, pistas, assets ou identidade visual de franquias existentes.

## Fase 8 - Decisões financeiras durante a corrida

A Fase 8 usa o motor financeiro da fase anterior para criar escolhas contextuais com consequência real. Não há pergunta de prova nem “resposta certa”: a corrida pausa, mostra duas alternativas e deixa o resultado aparecer no saldo, na reserva, na dívida ou no desempenho do kart.

### Como funciona

- existem três pontos de decisão na Avenida do Troco;
- a corrida inteira pausa enquanto o cartão está aberto;
- `1` escolhe a primeira opção e `2` escolhe a segunda;
- física, IA, cronômetro, itens e finanças ficam congelados durante a leitura;
- cada decisão é registrada com horário, escolha e consequência;
- decisões já resolvidas não aparecem novamente;
- o HUD mostra compromissos financeiros futuros quando existirem;
- o relatório final mostra custos gerados pelas escolhas.

### 1. Reserva Expressa

Aparece no começo da primeira volta.

**Opção 1:** separar R$20 do saldo e colocar na reserva.

**Opção 2:** manter o dinheiro no saldo.

A escolha não cria nem destrói dinheiro. Ela muda a função daquele valor: liquidez imediata ou proteção para o imprevisto de R$45 já existente no sistema financeiro.

### 2. Crédito Turbo

Aparece mais adiante na primeira volta.

**Aceitar:** recebe 7 segundos de turbo, paga R$30 imediatamente e cria duas cobranças futuras de R$12 nos fechamentos das próximas voltas.

**Recusar:** não recebe turbo e não cria compromisso financeiro.

O custo total programado é R$54. Se o saldo não conseguir cobrir uma cobrança, a diferença vira dívida e pode receber os juros simulados da corrida.

`Crédito Turbo` é um produto totalmente fictício de gameplay. Os valores não representam cartão, empréstimo, financiamento ou taxa real do mercado brasileiro.

### 3. Atalho Premium

Aparece na segunda volta.

**Pagar R$25:** recebe 4 segundos de turbo sem parcelas futuras.

**Seguir na pista:** preserva o dinheiro e abre mão da vantagem de desempenho.

Essa escolha introduz custo de oportunidade sem declarar uma alternativa universalmente melhor: o valor do turbo depende da situação da corrida e da situação financeira do jogador.

## Compromissos futuros

O estado financeiro agora aceita compromissos parcelados genéricos. Cada compromisso guarda:

- descrição;
- valor cobrado por volta;
- número de cobranças restantes.

Ao completar uma volta, o `FinanceController` cobra compromissos pendentes antes de calcular os juros simulados da dívida. Quando não há saldo suficiente, o déficit vira dívida.

O HUD exibe `Futuro` enquanto ainda existir valor programado para cobrança.

## Relatório e histórico

`DecisionState` é serializável e registra:

- decisão;
- instante da corrida;
- opção escolhida;
- texto da consequência.

O relatório final acrescenta:

- custo total provocado por decisões;
- quantidade de decisões registradas;
- saldo, reserva, dívida e patrimônio já existentes;
- valor protegido pela reserva.

## Controles

| Ação | Teclas |
| --- | --- |
| Acelerar | `W` ou `↑` |
| Frear / Ré | `S` ou `↓` |
| Virar à esquerda | `A` ou `←` |
| Virar à direita | `D` ou `→` |
| Drift | `Shift` |
| Usar item | `Espaço` |
| Guardar R$10 na reserva | `E` |
| Retirar R$10 da reserva | `Q` |
| Opção financeira 1 | `1` |
| Opção financeira 2 | `2` |

## Arquitetura

```text
src/
├── input/
├── physics/
├── render/
├── simulation/
│   ├── decisions/
│   │   ├── DecisionController.ts
│   │   └── types.ts
│   ├── finance/
│   │   ├── FinanceController.ts
│   │   └── types.ts
│   ├── items/
│   ├── AIController.ts
│   ├── RaceController.ts
│   └── state.ts
├── track/
├── ui/createHud.ts
├── decisions.css
├── finance.css
├── items.css
└── race.css
```

A separação continua intencional:

1. `DecisionController` decide quando um cartão aparece e traduz a escolha em efeitos explícitos;
2. `FinanceController` movimenta dinheiro, cria compromissos e cobra parcelas;
3. `RaceController` fornece apenas progresso validado;
4. Rapier continua responsável por movimento e colisões;
5. Three.js não contém regras de decisão;
6. o HUD apenas representa o estado.

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

## Limite intencional da Fase 8

Ainda não entram Pix, golpes, inflação, investimento, diversificação ou sistema completo de carreira. Também não há julgamento moral automático das escolhas: o jogo mostra custo e efeito para o jogador comparar.

## Próxima fase

**Fase 9: HUD e menus completos.**

O próximo passo do roadmap é consolidar a experiência em menus de início, pausa, seleção de corrida e resultados, além de melhorar a apresentação das informações financeiras e de corrida sem cobrir o playfield.
