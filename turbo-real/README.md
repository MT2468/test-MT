# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil, feito com Three.js, TypeScript, Vite e Rapier.

## Fase 14 - Publicação final

A Fase 14 fecha o primeiro roadmap técnico do Turbo Real. O jogo deixa de depender do launcher de desenvolvimento que transpila TypeScript no navegador e passa a ser publicado como uma build Vite de produção no GitHub Pages.

### URL pública

```text
https://mt2468.github.io/test-MT/turbo-real-play/
```

O modo de diagnóstico da Fase 13 continua disponível:

```text
https://mt2468.github.io/test-MT/turbo-real-play/?qa=1
```

## Pipeline de produção

O workflow `.github/workflows/python-ai-pages.yml` virou o deploy unificado do site do repositório.

Fluxo:

```text
push na main
    ↓
checkout
    ↓
Node 22 + npm install
    ↓
tsc --noEmit + vite build
    ↓
monta artifact do site
    ├── preserva o site existente / python-ai
    └── substitui /turbo-real-play/ por turbo-real/dist
    ↓
GitHub Pages artifact
    ↓
deploy-pages
```

A publicação só acontece depois de uma build bem-sucedida. Se TypeScript ou Vite falharem, o deploy não substitui a versão pública anterior.

## Bundle

`vite.config.ts` mantém caminhos relativos para que o jogo funcione dentro de `/test-MT/turbo-real-play/` e separa dependências maiores em chunks próprios:

- `three`;
- `@dimforge/rapier3d-compat`;
- código do Turbo Real.

Source maps de produção ficam desativados. O código-fonte continua disponível no GitHub, mas `turbo-real/src/` não é copiado para o artifact publicado.

O antigo `turbo-real-play/index.html` permanece no repositório apenas como fallback informativo. No Pages ele é substituído pelo `index.html` gerado pelo Vite.

## Site unificado

O repositório já tinha outra aplicação publicada em `python-ai/web/`. Para impedir workflows diferentes de disputarem a mesma instalação do GitHub Pages, existe agora um único pipeline de deploy.

O artifact preserva o `index.html` da raiz, que continua redirecionando para `python-ai/web/`, e publica Turbo Real em sua subpasta própria.

## Conteúdo do jogo

A versão publicada inclui o conteúdo acumulado das Fases 0 a 13:

- Copa Primeiro Salário com 4 circuitos;
- 8 pilotos, sendo 7 rivais de IA;
- física arcade com Rapier;
- drift, mini-turbo e colisões;
- quatro itens arcade;
- checkpoints, voltas e classificação;
- saldo, reserva, dívida e custos simulados;
- decisões financeiras durante a corrida;
- menus, pausa, reinício e resultados;
- áudio procedural;
- partículas e feedback de velocidade;
- teclado, gamepad e controles touch;
- cenários procedurais por pista;
- economia específica por circuito;
- telemetria QA e relatório copiável;
- balanceamento de IA baseado na geometria da pista.

Todos os valores financeiros são fictícios de gameplay. Eles não representam taxas, preços, produtos financeiros ou recomendação financeira real.

## Desenvolvimento local

```bash
cd turbo-real
npm install
npm run dev
```

Validação:

```bash
npm run typecheck
npm run build
npm run preview
```

## Arquitetura de publicação

```text
turbo-real/src
      ↓
TypeScript + Vite
      ↓
turbo-real/dist
      ↓
Pages artifact/turbo-real-play
      ↓
GitHub Pages
```

A simulação continua separada de Three.js e da camada DOM. A Fase 14 altera distribuição e entrega, não regras de corrida.

## Estado do roadmap

As Fases 0 a 14 formam o primeiro protótipo público completo. Expansões futuras podem adicionar novas copas, carreira persistente, novos conjuntos de decisões, acessibilidade avançada, multiplayer ou um ciclo adicional de playtest, mas deixam de ser pré-requisitos para publicar a versão atual.
