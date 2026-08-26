# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil, feito com Three.js, TypeScript, Vite e Rapier.

## Mobile Edition - versão 0.0.15

Depois do fechamento das Fases 0 a 14, o mesmo jogo ganhou uma camada mobile dedicada. Não existe uma segunda física ou uma cópia separada do projeto: desktop, gamepad e celular continuam consumindo a mesma simulação.

### Adaptação automática

`src/platform/MobileRuntime.ts` detecta toque, tamanho de tela e uma estimativa conservadora de capacidade usando `deviceMemory` e `hardwareConcurrency` quando disponíveis.

Existem três perfis de apresentação:

- `high`: desktop/aparelhos com folga, DPR até 2 e sombras 2048;
- `balanced`: celular padrão, DPR até 1.35 e sombras 1024;
- `economy`: celular mais limitado, DPR 1, sem sombras dinâmicas e sem partículas pesadas.

Física, IA, economia e regras da corrida não são simplificadas pelo perfil gráfico.

### Interface para celular

A Mobile Edition adiciona:

- `viewport-fit=cover` e suporte a safe areas/notch;
- altura baseada em `VisualViewport` para reduzir saltos causados pela barra do navegador;
- menus roláveis com touch e cartões de pista em carrossel horizontal com snap;
- HUD compacto nas bordas, preservando centro e parte inferior central da pista;
- layouts distintos para retrato, paisagem e paisagem de pouca altura;
- direção analógica por arrasto no polegar esquerdo;
- acelerador, freio/ré, drift e item independentes para multi-touch;
- botões financeiros secundários fora do centro da ação;
- escolhas financeiras com botões grandes próprios;
- pausa automática ao trocar de app/aba durante uma corrida;
- vibração curta em toque, confirmação e impacto quando o navegador permite;
- Wake Lock best-effort para evitar que a tela apague durante uma corrida;
- botão de tela cheia com tentativa de travar paisagem quando permitido;
- respeito a `prefers-reduced-motion`;
- remoção de blur/sombras CSS extras no perfil economia.

### Câmera mobile

`ChaseCamera` recebe o tamanho atual do viewport. Em retrato ela recua, sobe e abre o FOV para compensar a tela estreita. Em celular o camera shake e o roll também são reduzidos para diminuir desconforto sem remover feedback de velocidade.

### Instalável como app

`public/manifest.webmanifest`, `public/icon.svg` e `public/sw.js` transformam a build publicada em uma PWA instalável quando o navegador oferece essa capacidade.

O service worker mantém um shell mínimo e faz cache em runtime dos assets já usados. O jogo continua sendo um web game, não um APK nativo.

### URL pública

```text
https://mt2468.github.io/test-MT/turbo-real-play/
```

Modo QA:

```text
https://mt2468.github.io/test-MT/turbo-real-play/?qa=1
```

## Pipeline de produção

O workflow `.github/workflows/python-ai-pages.yml` é o deploy unificado do site do repositório.

```text
push na main
    ↓
Node 22 + npm install
    ↓
tsc --noEmit + vite build
    ↓
monta artifact do site
    ├── preserva o site existente
    └── publica turbo-real/dist em /turbo-real-play/
    ↓
GitHub Pages
```

A publicação só acontece depois de uma build bem-sucedida.

## Conteúdo acumulado

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
- balanceamento de IA baseado na geometria da pista;
- Mobile Edition responsiva e instalável.

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
