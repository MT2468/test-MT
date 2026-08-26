# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil. O projeto se inspira no ritmo e na acessibilidade dos kart racers, sem copiar personagens, pistas, assets ou identidade visual de franquias existentes.

## Fase 5 - Sete pilotos controlados por IA

A Fase 5 transforma a corrida solitária da etapa anterior em um grid completo de **8 karts**: o jogador e sete rivais controlados por IA.

### Pilotos rivais

- Bia Vector
- Caio Giro
- Luna Prisma
- Nando Faísca
- Téo Pulso
- Maya Fluxo
- Rafa Vento

Cada rival tem um perfil próprio de ritmo, disciplina de curva, frequência de drift, linha preferida e intensidade de evasão. As diferenças são de pilotagem, não de estereótipos financeiros ou sociais.

### IA de pilotagem

A IA não move os karts diretamente pela spline. Cada rival recebe comandos abstratos de aceleração, frenagem, esterço e drift, que são executados pelo mesmo modelo físico usado pelo jogador.

O controlador observa:

- trecho mais próximo da pista;
- ponto de mira à frente, variável com a velocidade;
- severidade da próxima curva;
- posição lateral desejada;
- velocidade alvo para a curva;
- distância para outros karts à frente;
- distância do centro da pista para recuperação.

Quando encontra trânsito próximo, o rival reduz a velocidade alvo e tenta trocar de linha. Quando sai demais do traçado, abandona a linha preferida e prioriza retornar ao centro.

### Física compartilhada

Todos os oito karts são corpos rígidos dinâmicos no mesmo mundo Rapier. Isso significa que:

- jogador e rivais colidem entre si;
- impactos podem alterar velocidade e trajetória dos dois envolvidos;
- IA não atravessa o jogador;
- rivais continuam sujeitos a gravidade, barreiras e limites do circuito;
- drift e mini-boost também funcionam nos rivais.

### Classificação

Cada rival possui seu próprio `RaceController` e precisa obedecer os mesmos checkpoints da Fase 4.

O ranking é recalculado continuamente usando:

1. pilotos que já terminaram, ordenados pelo tempo de chegada;
2. pilotos ainda correndo, ordenados pelo progresso legal na prova.

O HUD agora mostra a colocação como `posição/8`, e a tela final mostra a posição real entre os oito competidores.

### Entregue

- sete pilotos originais de IA;
- grid de largada em quatro fileiras atrás do jogador;
- perfis distintos de ritmo e comportamento;
- leitura de curva e velocidade alvo;
- lookahead variável conforme velocidade;
- linhas laterais preferidas;
- evasão simples de tráfego;
- recuperação quando o kart se afasta do centro da pista;
- drift controlado pela IA;
- mini-boost dos rivais;
- oito corpos rígidos dinâmicos no Rapier;
- colisão kart contra kart;
- um `RaceController` por rival;
- classificação em tempo real entre 8 pilotos;
- correção do progresso legal para karts posicionados atrás da linha de largada;
- karts rivais com paletas visuais próprias;
- HUD atualizado para `1º/8`, `2º/8` etc.;
- física, circuito, checkpoints, voltas e direção errada das fases anteriores preservados.

## Controles

| Ação | Teclas |
| --- | --- |
| Acelerar | `W` ou `↑` |
| Frear / Ré | `S` ou `↓` |
| Virar à esquerda | `A` ou `←` |
| Virar à direita | `D` ou `→` |
| Drift | `Shift` esquerdo ou direito + curva |

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
├── physics/
│   └── KartPhysics.ts          # jogador + 7 corpos rivais + pista
├── render/
│   ├── app/GameApp.ts
│   ├── camera/ChaseCamera.ts
│   ├── objects/createKart.ts   # aparência parametrizada por piloto
│   ├── race/createRaceMarkers.ts
│   └── track/createTrackScene.ts
├── simulation/
│   ├── AIController.ts         # percepção, decisão e ranking da frota
│   ├── aiProfiles.ts           # perfis dos sete rivais + grid
│   ├── RaceController.ts       # checkpoints e progresso legal
│   ├── state.ts                # jogador + rivais serializáveis
│   └── vehicle.ts
├── track/
│   └── firstTrack.ts
└── ui/createHud.ts
```

A separação continua intencional: a IA decide entradas, Rapier executa a física, `RaceController` valida a corrida e Three.js apenas mostra o resultado.

## Limite intencional da Fase 5

Os rivais já dirigem, colidem e disputam posição, mas ainda não existem caixas de item, ataques, economia interativa durante a corrida, seleção de pilotos ou campeonato. A IA também não usa itens porque esse sistema ainda não existe.

## Próxima fase

**Fase 6: sistema de itens arcade.**

O próximo objetivo é adicionar caixas de item, inventário de um slot, seleção ponderada pela posição na corrida e os primeiros itens originais do Turbo Real, antes de conectar a camada financeira nas fases seguintes.
