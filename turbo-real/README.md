# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil. O projeto se inspira no ritmo e na acessibilidade dos kart racers, sem copiar personagens, pistas, assets ou identidade visual de franquias existentes.

## Fase 6 - Sistema de itens arcade

A Fase 6 adiciona a primeira camada de disputa por itens à corrida de oito pilotos da Avenida do Troco. Os itens desta fase são deliberadamente arcade e originais; a camada de educação financeira continua reservada para as fases seguintes.

### Caixas de item

A pista agora define cinco fileiras de caixas, cada uma com três opções de linha. No total existem 15 caixas ativas no circuito.

- a caixa só pode ser coletada por um piloto sem item no inventário;
- cada piloto possui apenas um slot;
- quando coletada, a caixa desaparece para todos;
- a caixa reaparece depois de 4,8 segundos;
- jogador e IA disputam as mesmas caixas;
- a configuração das fileiras pertence à definição da pista, não ao renderer.

### Sorteio ponderado pela colocação

O item recebido depende da posição atual na corrida. Quem está atrás recebe probabilidade maior de itens de recuperação ou ofensivos, enquanto quem está na frente recebe mais opções defensivas e de controle de pista.

O sorteio não altera diretamente velocidade, colocação ou checkpoints. Ele apenas escolhe qual item vai para o slot, preservando a disputa na pista.

### Itens

#### ☀ Turbo Solar

Converte o slot em um boost imediato de 1,7 segundo. Usa o mesmo sistema de turbo já existente no veículo, portanto continua respeitando a física arcade.

#### ◇ Escudo Prisma

Cria proteção temporária por 5,5 segundos. O primeiro Pulso Repulsor ou Faixa Grudenta recebido é absorvido e consome o escudo.

#### ◎ Pulso Repulsor

Afeta pilotos próximos em um raio curto. Alvos sem escudo recebem impulso físico radial, pequena perda de velocidade e feedback visual de impacto.

#### ▰ Faixa Grudenta

É deixada atrás do kart e permanece na pista por alguns segundos. O primeiro adversário que atravessar a faixa perde velocidade e fica temporariamente limitado em aceleração e velocidade máxima. Um escudo ativo absorve a armadilha.

### IA e itens

Os sete rivais também coletam e usam itens.

- Turbo Solar é usado quando o kart já possui velocidade suficiente;
- Escudo Prisma é ativado defensivamente;
- Pulso Repulsor prioriza momentos com adversários próximos;
- Faixa Grudenta é preferida quando existe tráfego atrás;
- itens mantidos por tempo demais também são usados para evitar inventário eternamente travado.

A IA continua decidindo pilotagem em `AIController`; a estratégia e os efeitos de itens vivem no sistema de itens.

### Física e estado

`ItemController` decide coleta, inventário, uso, escudo, hazards e temporizadores. `KartPhysics` recebe apenas efeitos físicos explícitos, como impulso, redução instantânea de velocidade e modificadores temporários de lentidão.

Isso mantém a separação:

1. sistema de itens decide o efeito;
2. Rapier executa movimento e impulso;
3. o estado serializável registra inventário, escudo, lentidão, caixas e hazards;
4. Three.js desenha caixas, hazards e feedback dos karts;
5. o HUD apenas lê o estado.

### Feedback visual

- caixas de item flutuam e giram;
- caixas coletadas desaparecem durante o cooldown;
- Faixa Grudenta aparece fisicamente sobre o asfalto;
- Escudo Prisma cria uma bolha translúcida ao redor do kart;
- lentidão cria um anel visual próximo ao solo;
- impactos de item fazem o chassi piscar;
- o HUD possui um slot dedicado com ícone, nome e estado atual.

## Controles

| Ação | Teclas |
| --- | --- |
| Acelerar | `W` ou `↑` |
| Frear / Ré | `S` ou `↓` |
| Virar à esquerda | `A` ou `←` |
| Virar à direita | `D` ou `→` |
| Drift | `Shift` esquerdo ou direito + curva |
| Usar item | `Espaço` |

`Espaço` é tratado como ação única: manter a tecla pressionada não dispara repetidamente nem consome automaticamente o próximo item coletado.

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
├── items.css
├── race.css
└── styles.css
```

## Limite intencional da Fase 6

Os itens já alteram a corrida, mas ainda não representam decisões de educação financeira. Não existem orçamento, crédito, reserva de emergência, juros, Pix, inflação ou escolhas de custo de oportunidade durante a prova. Também ainda não existem seleção de pilotos, campeonato, áudio completo ou multiplayer.

## Próxima fase

**Fase 7: sistema financeiro da corrida.**

O próximo objetivo é introduzir saldo em reais virtuais, reserva de emergência e custos/consequências persistentes de decisões financeiras, conectando finalmente a educação financeira ao loop de corrida sem transformar a partida em um questionário.
