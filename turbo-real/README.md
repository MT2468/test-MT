# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil. O projeto se inspira no ritmo e na acessibilidade dos kart racers, sem copiar personagens, pistas, assets, músicas ou identidade visual de franquias existentes.

## Fase 10 - Som, partículas e polimento

A Fase 10 dá peso audiovisual ao protótipo já jogável sem alterar as regras de corrida. Simulação continua separada de apresentação: física e controladores produzem estado, enquanto áudio, partículas, câmera e iluminação apenas reagem a esse estado.

### Áudio procedural com Web Audio

Não existem MP3s ou efeitos sonoros externos nesta fase. `AudioDirector` sintetiza tudo no navegador:

- motor contínuo com pitch e filtro seguindo a velocidade;
- ruído de pneu proporcional à derrapagem;
- camada extra durante boost;
- pickup de caixa;
- assinatura diferente para Turbo Solar, Escudo Prisma, Pulso Repulsor e Faixa Grudenta;
- impacto com ruído e grave curto;
- checkpoint e fechamento de volta;
- entrada de decisão financeira;
- feedback de pausa, confirmação e retorno de menu;
- sequência curta de bandeirada.

O `AudioContext` só é criado quando o jogador inicia a corrida, respeitando as restrições de autoplay dos navegadores. Se Web Audio não puder iniciar, o jogo continua funcional sem som.

### Partículas reutilizáveis

`RaceEffects` mantém um pool fixo de partículas em Three.js, evitando criar e destruir objetos a cada frame.

O pool reage a:

- drift do jogador e dos rivais;
- boost;
- impactos;
- coleta de item;
- uso de item.

Também existem linhas de velocidade leves que aparecem apenas em velocidades maiores e ficam mais intensas durante boost. O efeito usa `BufferGeometry`, `Points` e `LineSegments`, sem texturas externas.

### Câmera refinada

A `ChaseCamera` agora possui:

- FOV progressivo pela velocidade;
- abertura adicional durante boost;
- leve inclinação durante drift;
- pequeno roll de direção fora do drift;
- shake curto orientado pelo impacto;
- look-ahead maior em alta velocidade;
- posição suavizada separada da vibração para impedir acúmulo de shake.

A intensidade foi mantida baixa para preservar leitura da pista.

### Iluminação

O circuito mantém ACES Filmic e sombras suaves, mas ganhou um passe de luz com:

- hemisférica mais equilibrada;
- luz solar principal ajustada;
- preenchimento frio pelo lado oposto;
- rim light quente discreta;
- exposição ligeiramente revisada;
- névoa e céu alinhados ao novo balanço.

### Ciclo de áudio e sessão

`AudioDirector` vive acima da sessão 3D, em `main.ts`.

Isso permite:

1. desbloquear Web Audio no clique/Enter de largada;
2. manter o contexto vivo entre reinícios;
3. zerar motor e derrapagem ao sair para o menu;
4. resetar detecção de eventos a cada corrida;
5. destruir o contexto somente ao fechar a página.

`GameApp` apenas informa estado atual ao diretor de áudio e controla os efeitos visuais da sessão.

### Recuperação de WebGL

O canvas passa a ouvir `webglcontextlost`. Se o contexto gráfico for perdido durante uma corrida, o jogo impede o comportamento padrão e entra em pausa em vez de continuar simulando sem imagem.

## Arquitetura adicionada

```text
src/
├── audio/
│   └── AudioDirector.ts
├── render/
│   ├── camera/ChaseCamera.ts
│   ├── effects/RaceEffects.ts
│   └── app/GameApp.ts
└── main.ts
```

A separação continua intencional:

1. física, corrida, IA, itens e finanças não dependem de áudio ou partículas;
2. `AudioDirector` observa `GameState` e produz som;
3. `RaceEffects` observa `GameState` e produz feedback visual;
4. `ChaseCamera` observa apenas `VehicleState`;
5. nenhum efeito visual concede velocidade, item ou vantagem.

## Controles

| Ação | Teclas |
| --- | --- |
| Acelerar | `W` ou `↑` |
| Frear / Ré | `S` ou `↓` |
| Virar | `A/D` ou `←/→` |
| Drift | `Shift` |
| Usar item | `Espaço` |
| Guardar R$10 na reserva | `E` |
| Retirar R$10 da reserva | `Q` |
| Escolhas financeiras | `1` / `2` |
| Pausar / continuar | `Esc` |
| Largar / correr novamente | `Enter` |

## Executar

```bash
npm install
npm run dev
```

Validação:

```bash
npm run typecheck
npm run build
```

## Conteúdo acumulado até a Fase 10

O protótipo já possui:

- circuito fechado Avenida do Troco;
- física arcade Rapier;
- drift e mini-turbo;
- 7 rivais de IA;
- checkpoints, 3 voltas e classificação;
- caixas e quatro itens arcade;
- saldo, reserva, dívida, custos, juros simulados e premiação;
- Reserva Expressa, Crédito Turbo e Atalho Premium;
- menu inicial, pausa, reinício, saída para menu e resultados;
- motor e efeitos procedurais;
- partículas de drift, boost, impacto e itens;
- linhas de velocidade;
- câmera e iluminação refinadas.

Os valores financeiros são fictícios de gameplay e não representam taxas, produtos ou recomendações financeiras reais.

## Limite intencional da Fase 10

Ainda não entram controles dedicados para celular/gamepad, novos circuitos, carreira/campeonato ou multiplayer. Também não há música licenciada nem arquivos de áudio externos nesta etapa.

## Próxima fase

**Fase 11: mobile e gamepad.**

O próximo passo é adaptar pilotagem e menus para toque, adicionar gamepad com mapeamento explícito, feedback de foco e layout responsivo de controles sem cobrir o playfield.
