# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil. O projeto se inspira no ritmo e na acessibilidade dos kart racers, sem copiar personagens, pistas, assets ou identidade visual de franquias existentes.

## Fase 3 - Primeira pista completa

A Fase 3 aposenta a reta de engenharia e entrega o primeiro circuito fechado original do projeto: **Avenida do Troco**.

### Avenida do Troco

Circuito urbano-futurista brasileiro com aproximadamente 120 amostras de trajetória geradas a partir de uma spline Catmull-Rom fechada. Todo o circuito e o cenário desta fase são procedurais, sem depender de assets 3D externos.

O traçado tem:

- reta de largada larga;
- curva longa de alta velocidade;
- dois setores apropriados para carregar drift;
- sequência de curvas de raio menor;
- retorno progressivo para a reta principal;
- largura útil consistente para ultrapassagens futuras.

### Entregue

- definição da pista independente de Three.js e Rapier;
- spline fechada compartilhada por física e renderização;
- malha de asfalto construída proceduralmente;
- zebras verdes e amarelas ao longo das duas bordas;
- barreiras visuais instanciadas;
- barreiras físicas derivadas dos mesmos pontos da pista;
- um único corpo estático Rapier com centenas de colliders leves;
- grid quadriculado de largada;
- pórtico de largada em verde e amarelo;
- praça central, palmeiras e prédios low-poly procedurais;
- cenário ampliado e fog/câmera adaptados ao circuito;
- spawn alinhado automaticamente à tangente da pista;
- correção do sinal visual de rotação do kart em curvas;
- HUD atualizado para a Avenida do Troco;
- física, drift e mini-boost da Fase 2 preservados.

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

## Arquitetura

```text
src/
├── input/
│   ├── actions.ts
│   └── KeyboardInput.ts
├── physics/
│   └── KartPhysics.ts             # Rapier, kart e colliders da pista
├── render/
│   ├── app/GameApp.ts
│   ├── camera/ChaseCamera.ts
│   ├── objects/createKart.ts
│   └── track/createTrackScene.ts  # asfalto, zebras, barreiras e cenário
├── simulation/
│   ├── state.ts
│   └── vehicle.ts
├── track/
│   └── firstTrack.ts              # fonte de verdade geométrica do circuito
└── ui/createHud.ts
```

A principal regra da Fase 3 é que a pista não existe duas vezes. `firstTrack.ts` produz os mesmos pontos, tangentes, bordas e barreiras usados tanto por Three.js quanto pelo Rapier.

## Limite intencional da Fase 3

O circuito já é fechado e dirigível, mas ainda não existem checkpoints, detecção de volta completa, posição real de corrida, IA, itens ou economia interativa. Esses sistemas não foram antecipados para evitar misturar responsabilidades.

## Próxima fase

**Fase 4: checkpoints, voltas e colocação.**

O próximo objetivo é transformar o circuito fechado em uma corrida formal: validar ordem de checkpoints, contar voltas, detectar direção errada e preparar um sistema de classificação para os futuros adversários.
