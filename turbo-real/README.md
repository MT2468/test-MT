# Turbo Real 🇧🇷🏎️💸

Kart racer arcade 3D original sobre educação financeira no Brasil, feito com Three.js, TypeScript, Vite e Rapier.

## Fase 13 - Playtest e balanceamento

A Fase 13 transforma o protótipo em uma versão mensurável. Em vez de ajustar IA, economia e desempenho apenas por sensação, o jogo passa a coletar telemetria e analisar automaticamente as quatro pistas da Copa Primeiro Salário.

### Modo QA

Abra o launcher com `?qa=1` para ativar o painel de telemetria:

```text
https://mt2468.github.io/test-MT/turbo-real-play/?qa=1
```

O painel mede durante a corrida:

- FPS médio;
- frame time médio e pior frame;
- quantidade de frames acima de 33 ms;
- pico de draw calls;
- pico de triângulos;
- velocidade média e máxima;
- tempo em direção errada;
- tempo total em boost;
- impactos;
- itens coletados e usados;
- lentidões recebidas;
- escudos consumidos;
- decisões financeiras resolvidas;
- posição e tempo final;
- saldo, reserva, dívida e valor protegido pela reserva.

O botão `COPIAR RELATÓRIO` gera um bloco de texto curto para comparar corridas entre dispositivos, pistas e versões.

### Análise de pista

`src/diagnostics/trackAnalysis.ts` calcula automaticamente:

- comprimento estimado do circuito;
- curvatura média;
- pico de curvatura;
- tecnicidade combinando curvas e largura;
- escala de ritmo da IA;
- escala de look-ahead da IA;
- renda-base projetada da corrida;
- custos-base projetados;
- pressão econômica;
- avisos de configuração fora da faixa esperada.

O catálogo também é auditado no boot para detectar IDs duplicados, poucos checkpoints, poucas fileiras de itens, pista excessivamente estreita ou economia muito fora da faixa.

### Balanceamento da IA

A personalidade dos sete rivais continua vindo de `aiProfiles.ts`, mas o ritmo agora também considera a geometria da pista.

Em pistas mais técnicas:

- a IA olha mais à frente;
- o drift começa um pouco mais cedo;
- o ritmo recebe pequena compensação para evitar que curvas apertadas aumentem a dificuldade de forma descontrolada.

A posição da pista dentro da Copa Primeiro Salário continua influenciando a dificuldade pretendida. Portanto, Feira Central, Circuito do Orçamento e Corrida do Fim do Mês não ficam artificialmente iguais à Avenida do Troco.

### Separação de responsabilidades

```text
TrackDefinition
      ↓
trackAnalysis ────────┐
      ↓               │
AIFleetController     │
                      ↓
GameState ──> PlaytestTelemetry ──> painel QA / relatório
                      ↑
Three renderer.info ──┘
```

A telemetria observa o jogo. Ela não concede velocidade, dinheiro, item ou vantagem.

## Copa Primeiro Salário

1. Avenida do Troco
2. Feira Central
3. Circuito do Orçamento
4. Corrida do Fim do Mês

Cada pista mantém cenário, traçado e economia próprios. Todos os valores financeiros são fictícios de gameplay e não representam taxas, preços ou recomendações reais.

## Controles

### Teclado

| Ação | Tecla |
| --- | --- |
| Acelerar | `W` / `↑` |
| Frear / Ré | `S` / `↓` |
| Virar | `A/D` / `←/→` |
| Drift | `Shift` |
| Item | `Espaço` |
| Guardar R$10 | `E` |
| Retirar R$10 | `Q` |
| Decisões | `1` / `2` |
| Pausa | `Esc` |

Gamepad e controles touch continuam disponíveis desde a Fase 11.

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

## Checklist de playtest da Fase 13

Para cada uma das quatro pistas:

1. largar e confirmar grid de 8 pilotos;
2. completar pelo menos uma volta;
3. observar se IA evita barreiras nas curvas principais;
4. coletar e usar itens;
5. provocar ou receber pelo menos um impacto;
6. confirmar decisões financeiras;
7. testar pausa e retomada;
8. conferir HUD em desktop/mobile;
9. concluir a corrida quando possível;
10. copiar o relatório QA.

### Metas iniciais de diagnóstico

Estas metas são guardrails, não garantias de desempenho em todo aparelho:

- nenhum alerta estrutural crítico do catálogo;
- FPS médio próximo da taxa de atualização em hardware compatível;
- poucos frames acima de 33 ms em desktop moderno;
- IA capaz de completar a pista sem depender de teleporte;
- diferença de dificuldade progressiva entre as quatro pistas;
- economia mais pressionada no fim da copa sem tornar a corrida matematicamente impossível.

## Limite desta fase

O CI valida TypeScript e build, mas não substitui playtest visual. Como este projeto usa WebGL, uma validação completa ainda requer abrir o jogo em navegador real, pilotar as quatro pistas e revisar screenshots/telemetria. A Fase 13 fornece a instrumentação para esse processo ser reproduzível.

## Próxima fase

**Fase 14: publicação final e GitHub Pages.**

O próximo passo é consolidar o launcher provisório em uma build de produção do Vite, publicar o jogo sem transpilar TypeScript no navegador e fechar a primeira versão pública jogável.
