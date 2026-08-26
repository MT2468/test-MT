# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil. O projeto se inspira no ritmo e na acessibilidade dos kart racers, sem copiar personagens, pistas, assets ou identidade visual de franquias existentes.

## Fase 2 - Drift, colisões e física arcade

A Fase 2 substitui o movimento puramente cinemático da etapa anterior por um corpo rígido controlado pelo Rapier, mantendo as regras de jogo separadas do Three.js.

### Entregue

- `@dimforge/rapier3d-compat` como motor de física 3D;
- simulação em timestep fixo de 60 Hz;
- corpo rígido dinâmico para o kart com CCD habilitado;
- rotações X/Z bloqueadas para estabilidade arcade, preservando rotação em Y;
- gravidade, contato com o solo e colisões físicas;
- barreiras laterais e de fim de pista;
- dois obstáculos físicos para teste de impacto;
- aceleração, frenagem, ré e resistência refinadas;
- aderência lateral independente da velocidade longitudinal;
- drift com `Shift` durante curvas acima da velocidade mínima;
- perda controlada de aderência durante drift;
- carga de drift convertida em mini-boost ao soltar `Shift`;
- velocidade máxima maior durante boost;
- feedback de impacto no HUD e câmera;
- rodas girando, inclinação visual, faíscas de drift e chamas de boost;
- câmera de perseguição adaptada a derrapagem e turbo;
- HUD com barra de carga de drift e duração do boost;
- fallback visível caso a inicialização do WebAssembly falhe;
- workflow de CI dedicado a `turbo-real/` com typecheck e build.

## Controles

| Ação | Teclas |
| --- | --- |
| Acelerar | `W` ou `↑` |
| Frear / Ré | `S` ou `↓` |
| Virar à esquerda | `A` ou `←` |
| Virar à direita | `D` ou `→` |
| Drift | `Shift` esquerdo ou direito + curva |

Para carregar turbo, entre numa curva com velocidade suficiente, segure `Shift` enquanto esterça e solte depois de acumular carga. Cargas maiores geram boosts mais longos.

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
│   └── KartPhysics.ts          # Rapier, timestep, corpo rígido e colisores
├── render/
│   ├── app/GameApp.ts          # cena e sincronização visual
│   ├── camera/ChaseCamera.ts
│   └── objects/createKart.ts
├── simulation/
│   ├── state.ts                # estado serializável
│   └── vehicle.ts              # tipos e tuning arcade
└── ui/createHud.ts
```

O Rapier pertence à camada de física, não ao renderer. Three.js continua apenas representando visualmente o estado produzido pela simulação física.

## Modelo de direção

O projeto usa um modelo híbrido de kart arcade:

1. Rapier resolve gravidade, integração, contato, obstáculos e paredes.
2. O controlador de veículo decompõe a velocidade em componentes longitudinal e lateral.
3. A aceleração atua no eixo longitudinal do kart.
4. A aderência reduz a velocidade lateral normalmente.
5. Durante drift essa aderência cai, mantendo o vetor de movimento deslizando enquanto o corpo gira.
6. Ao terminar um drift válido, a carga acumulada vira um boost temporário.

Isso evita tanto um kart preso a trilhos quanto um veículo excessivamente realista e pouco divertido.

## Limite intencional da Fase 2

Ainda não existem pista de corrida final, checkpoints, contagem de voltas, colocação real, IA, itens, economia interativa, áudio ou multiplayer. A reta atual continua sendo uma pista de engenharia para validar dirigibilidade e colisões.

## Próxima fase

**Fase 3: primeira pista completa.**

O próximo objetivo é substituir a reta de testes por um circuito fechado original, com curvas projetadas para drift, leitura de trajetória e futuras decisões financeiras.
