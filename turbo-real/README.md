# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil. O projeto se inspira no ritmo e na acessibilidade dos kart racers, sem copiar personagens, pistas, assets ou identidade visual de franquias existentes.

## Fase 1 — Kart dirigível + câmera de perseguição

A Fase 1 transforma o boot técnico da Fase 0 em um protótipo realmente controlável.

### Entregue

- movimento arcade serializável fora do Three.js;
- aceleração progressiva até aproximadamente 79 km/h;
- frenagem antes de engatar ré;
- ré limitada e esterço invertido corretamente durante marcha à ré;
- desaceleração natural quando nenhum acelerador é pressionado;
- resposta de direção suavizada e dependente da velocidade;
- teclado com limpeza de estado ao perder foco da janela;
- câmera de perseguição suavizada e independente da taxa de quadros;
- leve aumento de FOV em alta velocidade;
- rodas dianteiras acompanhando visualmente o esterço;
- pista de prática de 300 unidades com referências de profundidade;
- HUD em DOM com velocidade, marcha e distância percorrida;
- suporte responsivo e `prefers-reduced-motion` preservado.

## Controles

| Ação | Teclas |
| --- | --- |
| Acelerar | `W` ou `↑` |
| Frear / Ré | `S` ou `↓` |
| Virar à esquerda | `A` ou `←` |
| Virar à direita | `D` ou `→` |

`Shift`, `Espaço` e `Esc` continuam reservados no mapa de ações para drift, item e pausa, mas essas funções ainda não são executadas nesta fase.

## Executar

Requer Node.js compatível com Vite 8.

```bash
npm install
npm run dev
```

Validação de tipos e build:

```bash
npm run typecheck
npm run build
```

## Arquitetura

```text
src/
├── input/
│   ├── actions.ts              # ações abstratas e bindings
│   └── KeyboardInput.ts        # estado físico do teclado
├── render/
│   ├── app/GameApp.ts          # loop, cena e sincronização visual
│   ├── camera/ChaseCamera.ts   # comportamento da câmera
│   └── objects/createKart.ts   # representação visual do kart
├── simulation/
│   ├── state.ts                # estado serializável do jogo
│   └── vehicle.ts              # cinemática arcade do veículo
└── ui/createHud.ts             # HUD DOM orientado pelo estado
```

A simulação continua sendo a fonte de verdade. Three.js recebe posição, direção, velocidade e esterço e apenas representa esses valores visualmente.

## Limite intencional da Fase 1

Ainda não existem física com Rapier, colisões, aderência de pneus, drift, boost, checkpoints, voltas, IA, itens ou economia interativa. O kart pode sair da pista porque limites físicos pertencem à próxima etapa.

## Próxima fase

**Fase 2: drift, aceleração refinada, colisões e física de veículo.**

O objetivo será substituir as limitações cinemáticas necessárias deste protótipo por um sistema físico arcade consistente, sem mover as regras de jogo para dentro do renderer.
