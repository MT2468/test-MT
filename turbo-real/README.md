# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil. O projeto se inspira no ritmo e na acessibilidade dos kart racers, sem copiar personagens, pistas, assets ou identidade visual de franquias existentes.

## Fase 7 - Sistema financeiro da corrida

A Fase 7 conecta finalmente a educação financeira ao loop jogável. Ainda não existem perguntas, respostas certas ou telas de quiz: esta etapa cria o motor financeiro que a Fase 8 usará para decisões guiadas.

O objetivo é fazer dinheiro ter consequências mecânicas sem interromper a pilotagem.

### Estado financeiro

O jogador começa cada corrida com:

- saldo: R$120;
- reserva de emergência: R$20;
- dívida: R$0.

O estado financeiro é serializável e separado de física, itens e renderização. Ele registra saldo, reserva, dívida, renda total, despesas, juros simulados, valor protegido pela reserva e um extrato das últimas transações.

### Fluxo de dinheiro durante a prova

#### Renda por setor

Cada checkpoint intermediário validado rende R$6. A renda só é concedida quando o `RaceController` confirma progresso legal, portanto cortar caminho não produz dinheiro.

#### Custo operacional

Ao completar cada volta, a corrida cobra R$18 de custo operacional.

Esse é um gasto rotineiro. O sistema tenta pagar pelo saldo normal e **não usa a reserva automaticamente**. Se o saldo for insuficiente, a parte não paga vira dívida.

#### Imprevisto

No segundo setor da segunda volta ocorre um reparo inesperado de R$45.

Para esse evento o fluxo é diferente:

1. usa a reserva de emergência disponível;
2. depois usa o saldo;
3. somente o restante vira dívida.

O jogo registra quanto desse imprevisto foi absorvido pela reserva e mostra esse valor no relatório final.

#### Dívida e juros simulados

Se houver dívida ao concluir uma volta, ela recebe 5% de juros **simulados da corrida**.

Essa taxa é puramente uma regra de gameplay para demonstrar crescimento de dívida. Ela não representa Selic, taxa bancária, cartão de crédito ou qualquer taxa real do mercado brasileiro.

#### Premiação

Ao terminar a prova, o saldo recebe prêmio conforme a posição:

| Posição | Prêmio |
| --- | ---: |
| 1º | R$80 |
| 2º | R$68 |
| 3º | R$58 |
| 4º | R$48 |
| 5º | R$40 |
| 6º | R$34 |
| 7º | R$28 |
| 8º | R$24 |

### Reserva durante a corrida

O jogador pode administrar a própria liquidez sem abrir menus:

- `E`: move R$10 do saldo para a reserva;
- `Q`: move R$10 da reserva para o saldo.

As ações são tratadas como eventos únicos de teclado, então segurar a tecla não transfere dinheiro repetidamente.

A mecânica cria um pequeno conflito real de planejamento: guardar demais pode deixar pouco saldo para despesas rotineiras; guardar de menos deixa o imprevisto menos protegido.

### HUD e relatório final

O HUD agora mostra valores reais do sistema:

- saldo;
- reserva;
- dívida;
- mensagens temporárias de renda, custo, imprevisto, transferência e juros.

Na chegada, além de posição e tempo, aparece um resumo com:

- saldo final;
- reserva final;
- dívida final;
- patrimônio líquido de jogo (`saldo + reserva - dívida`);
- quanto do imprevisto foi coberto pela reserva.

### Extrato

`FinancialState.transactions` mantém até 24 registros recentes. Cada transação guarda:

- tipo;
- descrição;
- instante da corrida;
- valor;
- saldo depois da operação;
- reserva depois da operação;
- dívida depois da operação.

A interface de extrato completo ficará para uma fase posterior, mas os dados já existem para relatórios e progressão.

### Base pedagógica

A mecânica foi desenhada em torno de três ideias centrais de educação financeira no Brasil: organização do orçamento, formação de poupança/resiliência financeira e prevenção do endividamento excessivo. A reserva é tratada como proteção para imprevistos, enquanto despesas previsíveis devem ser planejadas no fluxo normal.

Os números da corrida são deliberadamente pequenos e fictícios. O objetivo não é ensinar uma taxa específica ou sugerir produto financeiro.

## Controles

| Ação | Teclas |
| --- | --- |
| Acelerar | `W` ou `↑` |
| Frear / Ré | `S` ou `↓` |
| Virar à esquerda | `A` ou `←` |
| Virar à direita | `D` ou `→` |
| Drift | `Shift` esquerdo ou direito + curva |
| Usar item | `Espaço` |
| Guardar R$10 na reserva | `E` |
| Retirar R$10 da reserva | `Q` |

## Executar

Requer Node.js compatível com Vite 8.

```bash
npm install
npm run dev
```

Validação:

```bash
npm run typecheck
npm run build
```

## Arquitetura

```text
src/
├── input/
│   ├── actions.ts
│   └── KeyboardInput.ts
├── physics/
│   └── KartPhysics.ts
├── render/
│   ├── app/GameApp.ts
│   ├── camera/ChaseCamera.ts
│   ├── items/createItemScene.ts
│   ├── objects/createKart.ts
│   ├── race/createRaceMarkers.ts
│   └── track/createTrackScene.ts
├── simulation/
│   ├── finance/
│   │   ├── FinanceController.ts
│   │   └── types.ts
│   ├── items/
│   │   ├── ItemController.ts
│   │   └── types.ts
│   ├── AIController.ts
│   ├── aiProfiles.ts
│   ├── RaceController.ts
│   ├── state.ts
│   └── vehicle.ts
├── track/
│   └── firstTrack.ts
├── ui/createHud.ts
├── finance.css
├── items.css
├── race.css
└── styles.css
```

A separação continua deliberada:

1. `FinanceController` decide renda, despesas, reserva, dívida, juros e prêmio;
2. `RaceController` fornece apenas progresso e posição validados;
3. Rapier continua responsável exclusivamente por movimento e colisões;
4. Three.js não contém regras financeiras;
5. o HUD apenas lê o estado financeiro serializável.

## Limite intencional da Fase 7

Ainda não há cartões de decisão, crédito turbo, parcelamento, Pix, golpes, inflação, investimento ou escolha de custo de oportunidade. Esses sistemas dependem do motor financeiro criado aqui e serão adicionados gradualmente sem transformar a corrida em questionário.

## Próxima fase

**Fase 8: decisões financeiras durante a corrida.**

O próximo objetivo é introduzir pontos de decisão rápidos e contextuais, como reservar dinheiro, aceitar crédito para ganhar desempenho imediato ou pagar custos futuros, sempre mostrando consequência depois da escolha em vez de pedir respostas de prova.
