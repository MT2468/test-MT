# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil. O projeto se inspira no ritmo e na acessibilidade dos kart racers, sem copiar personagens, pistas, assets ou identidade visual de franquias existentes.

## Fase 0 — Fundação técnica

Esta branch entrega apenas a base que as próximas fases vão usar:

- Vite + TypeScript + Three.js;
- cena WebGL mínima com iluminação, sombras, estrada e kart-placeholder;
- estado de simulação separado da renderização;
- camada de UI em DOM, fora do WebGL;
- mapa explícito de ações de entrada para teclado;
- layout responsivo e suporte a `prefers-reduced-motion`;
- `base: './'` no Vite para facilitar hospedagem estática futura;
- descarte de geometria, materiais e renderer ao encerrar.

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

## Estrutura

```text
src/
├── input/                 # ações abstratas e bindings físicos
├── render/
│   ├── app/               # renderer, scene, camera, resize e lifecycle
│   └── objects/           # objetos visuais e factories Three.js
├── simulation/            # estado e regras serializáveis, sem objetos Three.js
└── ui/                    # HUD e menus em DOM
```

Pastas de `physics/`, `audio/`, `data/`, pistas, IA e economia entram quando suas respectivas fases começarem. Evitamos criar abstrações vazias antes de existir comportamento real para elas.

## Regra arquitetural

A simulação é a fonte de verdade. Three.js desenha o estado; não é o lugar onde dinheiro, voltas, IA, progressão ou decisões financeiras devem morar.

## Estado atual

A tela de boot exibe um kart geométrico estacionado numa estrada provisória e um HUD mínimo com saldo de demonstração. Não existe dirigibilidade ainda de propósito.

### Próxima fase

**Fase 1: kart dirigível + câmera de perseguição.**

Objetivo: transformar o placeholder atual em um veículo controlável mantendo as regras de movimento fora da cena Three.js.
