# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil. O projeto se inspira no ritmo e na acessibilidade dos kart racers, sem copiar personagens, pistas, assets ou identidade visual de franquias existentes.

## Fase 4 - Checkpoints, voltas e colocação

A Fase 4 transforma a **Avenida do Troco** de circuito dirigível em uma corrida formal de três voltas.

### Sistema de corrida

A pista agora define sua própria configuração de prova:

- 3 voltas;
- 6 setores por volta, incluindo a linha de chegada;
- checkpoints distribuídos automaticamente pelas 120 amostras da spline;
- ordem obrigatória de passagem;
- cruzamento válido somente no sentido correto;
- progresso legal calculado entre o último setor validado e o próximo;
- colocação preparada para múltiplos competidores futuros.

Cruzar a linha de chegada sem passar pelos setores intermediários não conta volta. Cruzar um setor ao contrário também não conta.

### Entregue

- `RaceController` separado de física e renderização;
- configuração de corrida armazenada na definição da pista;
- checkpoints sequenciais com validação de cruzamento;
- três voltas completas;
- cronômetro total da corrida;
- cronômetro por volta;
- última volta e melhor volta;
- estado de chegada;
- detecção de direção errada com tolerância para drift;
- progresso de corrida normalizado para classificação futura;
- função genérica de ranking por progresso e tempo de chegada;
- marcadores visuais discretos para os cinco checkpoints intermediários;
- HUD com posição, volta, setor e tempo;
- aviso central de direção errada;
- painel de chegada com posição, tempo total e melhor volta;
- física, drift, mini-boost e circuito procedural preservados.

## Controles

| Ação | Teclas |
| --- | --- |
| Acelerar | `W` ou `↑` |
| Frear / Ré | `S` ou `↓` |
| Virar à esquerda | `A` ou `←` |
| Virar à direita | `D` ou `→` |
| Drift | `Shift` esquerdo ou direito + curva |

Para carregar turbo, entre numa curva com velocidade suficiente, segure `Shift` enquanto esterça e solte depois de acumular carga.

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

O CI da Fase 4 deve validar compilação e tipos. O playtest funcional precisa confirmar, no navegador, pelo menos: checkpoints fora de ordem não contam, ré não valida setor, a terceira passagem correta pela chegada encerra a prova e o aviso de direção errada não dispara durante um drift normal.

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
│   ├── objects/createKart.ts
│   ├── race/createRaceMarkers.ts
│   └── track/createTrackScene.ts
├── simulation/
│   ├── RaceController.ts       # regras da corrida e classificação
│   ├── state.ts
│   └── vehicle.ts
├── track/
│   └── firstTrack.ts           # geometria + configuração da prova
├── ui/createHud.ts
├── race.css
└── styles.css
```

A separação permanece deliberada:

1. Rapier resolve movimento, contato e colisões.
2. `RaceController` decide se checkpoints e voltas são válidos.
3. `firstTrack.ts` descreve geometria e configuração da prova.
4. Three.js apenas representa pista, kart e marcadores.
5. O HUD apenas lê o estado serializável.

## Detecção de direção errada

O aviso não depende apenas da orientação do kart. O sistema compara o deslocamento real do veículo com a tangente do trecho mais próximo da pista e exige movimento contrário por um pequeno intervalo antes de ativar o alerta. Isso reduz falsos positivos durante drift ou impactos.

## Limite intencional da Fase 4

A corrida formal funciona para o jogador, mas ainda existe apenas um competidor. Não há IA, itens, caixas de item, ataques, economia interativa, seleção de pilotos ou campeonato. A posição é `1º` porque o grid ainda contém somente o jogador, enquanto o sistema de ranking já aceita múltiplos progressos para a próxima etapa.

## Próxima fase

**Fase 5: sete pilotos controlados por IA.**

O próximo objetivo é preencher o grid, fazer adversários seguirem a linha de corrida, reagirem a curvas e colisões e conectar seus progressos ao sistema de classificação criado nesta fase.
