import { calculateNetWorth, calculateOutstandingCommitments } from '../simulation/finance/types';
import { getItemDefinition } from '../simulation/items/types';
import type { GameState } from '../simulation/state';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

function formatTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.floor((safeSeconds % 1) * 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

export interface HudController {
  update(state: GameState): void;
  dispose(): void;
}

export function createHud(host: HTMLElement, initialState: GameState): HudController {
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <section class="brand-chip" aria-label="Identidade do jogo">
      <span class="brand-chip__flag" aria-hidden="true">◆</span>
      <div>
        <strong>TURBO REAL</strong>
        <span>Avenida do Troco · escolhas financeiras</span>
      </div>
    </section>

    <section class="race-chip" aria-label="Estado da corrida">
      <strong data-position>1º/8</strong>
      <div>
        <span data-lap>VOLTA 1/3</span>
        <small data-race-detail>SETOR 1/6 · 00:00.000</small>
      </div>
    </section>

    <section class="wallet-chip" aria-label="Estado financeiro">
      <span>Saldo <strong data-balance>${brl.format(initialState.finance.balance)}</strong></span>
      <span>Reserva <strong data-reserve>${brl.format(initialState.finance.reserve)}</strong></span>
      <span class="wallet-chip__debt" data-debt-row>Dívida <strong data-debt>${brl.format(initialState.finance.debt)}</strong></span>
      <span class="wallet-chip__future" data-commitment-row hidden>Futuro <strong data-commitments>R$0</strong></span>
    </section>

    <section class="controls-chip" aria-label="Controles">
      <strong>WASD · SHIFT · ESPAÇO · E/Q</strong>
      <span>dirigir · drift · item · reserva · 1/2 nas decisões</span>
    </section>

    <section class="item-chip" aria-label="Item atual">
      <strong data-item-icon>?</strong>
      <div>
        <span data-item-name>SEM ITEM</span>
        <small data-item-hint>passe por uma caixa</small>
      </div>
    </section>

    <section class="drift-chip" aria-label="Carga de drift">
      <div class="drift-chip__heading">
        <strong data-drift-label>DRIFT</strong>
        <span data-drift-value>0%</span>
      </div>
      <div class="drift-chip__track"><span data-drift-fill></span></div>
    </section>

    <section class="speed-chip" aria-label="Velocidade do kart">
      <div><strong data-speed>0</strong><span>km/h</span></div>
      <small data-direction>D · 0 m</small>
    </section>

    <section class="finance-toast" data-finance-toast aria-live="polite" hidden>
      <strong>R$</strong><span data-finance-message></span>
    </section>

    <section class="decision-outcome" data-decision-outcome hidden aria-live="polite"></section>

    <section class="decision-card" data-decision-card hidden aria-live="assertive">
      <span class="decision-card__kicker" data-decision-kicker>DECISÃO</span>
      <h2 data-decision-title>Escolha financeira</h2>
      <p data-decision-context></p>
      <div class="decision-card__options">
        <article class="decision-option" data-decision-option-1>
          <span class="decision-option__key">1</span>
          <strong data-decision-option-1-title></strong>
          <span data-decision-option-1-detail></span>
        </article>
        <article class="decision-option" data-decision-option-2>
          <span class="decision-option__key">2</span>
          <strong data-decision-option-2-title></strong>
          <span data-decision-option-2-detail></span>
        </article>
      </div>
      <small class="decision-card__hint">A corrida está pausada · pressione 1 ou 2</small>
    </section>

    <section class="wrong-way-chip" data-wrong-way hidden aria-live="assertive">
      <strong>↺ DIREÇÃO ERRADA</strong>
      <span>retorne ao sentido da pista</span>
    </section>

    <section class="finish-chip" data-finish hidden aria-live="polite">
      <span>🏁 CHEGADA</span>
      <strong data-finish-position>1º DE 8</strong>
      <small data-finish-time>00:00.000</small>
      <em data-best-lap>Melhor volta · --:--.---</em>
      <div class="finance-result">
        <span>Saldo <strong data-final-balance>R$0</strong></span>
        <span>Reserva <strong data-final-reserve>R$0</strong></span>
        <span>Dívida <strong data-final-debt>R$0</strong></span>
        <span>Patrimônio <strong data-final-net-worth>R$0</strong></span>
        <span>Custos de escolhas <strong data-final-decision-costs>R$0</strong></span>
        <small data-final-protected>Reserva protegeu R$0</small>
        <small data-final-decisions>0 de 3 decisões registradas</small>
      </div>
    </section>
  `;
  host.append(hud);

  const get = (selector: string): HTMLElement | null => hud.querySelector<HTMLElement>(selector);
  const speed = get('[data-speed]');
  const direction = get('[data-direction]');
  const driftLabel = get('[data-drift-label]');
  const driftValue = get('[data-drift-value]');
  const driftFill = get('[data-drift-fill]');
  const driftChip = get('.drift-chip');
  const speedChip = get('.speed-chip');
  const position = get('[data-position]');
  const lap = get('[data-lap]');
  const raceDetail = get('[data-race-detail]');
  const wrongWay = get('[data-wrong-way]');
  const finish = get('[data-finish]');
  const finishPosition = get('[data-finish-position]');
  const finishTime = get('[data-finish-time]');
  const bestLap = get('[data-best-lap]');
  const itemChip = get('.item-chip');
  const itemIcon = get('[data-item-icon]');
  const itemName = get('[data-item-name]');
  const itemHint = get('[data-item-hint]');
  const balance = get('[data-balance]');
  const reserve = get('[data-reserve]');
  const debt = get('[data-debt]');
  const debtRow = get('[data-debt-row]');
  const commitmentRow = get('[data-commitment-row]');
  const commitments = get('[data-commitments]');
  const financeToast = get('[data-finance-toast]');
  const financeMessage = get('[data-finance-message]');
  const decisionOutcome = get('[data-decision-outcome]');
  const decisionCard = get('[data-decision-card]');
  const decisionKicker = get('[data-decision-kicker]');
  const decisionTitle = get('[data-decision-title]');
  const decisionContext = get('[data-decision-context]');
  const decisionOption1 = get('[data-decision-option-1]');
  const decisionOption2 = get('[data-decision-option-2]');
  const decisionOption1Title = get('[data-decision-option-1-title]');
  const decisionOption1Detail = get('[data-decision-option-1-detail]');
  const decisionOption2Title = get('[data-decision-option-2-title]');
  const decisionOption2Detail = get('[data-decision-option-2-detail]');
  const finalBalance = get('[data-final-balance]');
  const finalReserve = get('[data-final-reserve]');
  const finalDebt = get('[data-final-debt]');
  const finalNetWorth = get('[data-final-net-worth]');
  const finalDecisionCosts = get('[data-final-decision-costs]');
  const finalProtected = get('[data-final-protected]');
  const finalDecisions = get('[data-final-decisions]');

  const required = [
    speed, direction, driftLabel, driftValue, driftFill, driftChip, speedChip, position, lap, raceDetail, wrongWay,
    finish, finishPosition, finishTime, bestLap, itemChip, itemIcon, itemName, itemHint, balance, reserve, debt,
    debtRow, commitmentRow, commitments, financeToast, financeMessage, decisionOutcome, decisionCard, decisionKicker,
    decisionTitle, decisionContext, decisionOption1, decisionOption2, decisionOption1Title, decisionOption1Detail,
    decisionOption2Title, decisionOption2Detail, finalBalance, finalReserve, finalDebt, finalNetWorth,
    finalDecisionCosts, finalProtected, finalDecisions,
  ];
  if (required.some((element) => element === null)) throw new Error('HUD da Fase 8 incompleto.');

  const controller: HudController = {
    update(state): void {
      const { vehicle, race, items, finance, decisions } = state;
      speed!.textContent = String(Math.round(Math.abs(vehicle.speed) * 3.6));
      const gear = vehicle.speed < -0.1 ? 'R' : 'D';
      direction!.textContent = `${gear} · ${Math.round(vehicle.distanceTravelled)} m`;

      position!.textContent = `${race.position}º/${race.totalRacers}`;
      lap!.textContent = `VOLTA ${race.lap}/${race.totalLaps}`;
      const sector = race.finished ? race.checkpointCount : Math.min(race.checkpointsPassed + 1, race.checkpointCount);
      raceDetail!.textContent = `SETOR ${sector}/${race.checkpointCount} · ${formatTime(race.raceTimeSeconds)}`;
      wrongWay!.hidden = !race.wrongWay || race.finished || decisions.active !== null;

      balance!.textContent = brl.format(finance.balance);
      reserve!.textContent = brl.format(finance.reserve);
      debt!.textContent = brl.format(finance.debt);
      debtRow!.classList.toggle('has-debt', finance.debt > 0);
      const futureTotal = calculateOutstandingCommitments(finance);
      commitmentRow!.hidden = futureTotal <= 0;
      commitments!.textContent = brl.format(futureTotal);
      financeToast!.hidden = finance.messageRemaining <= 0 || race.finished || decisions.active !== null;
      financeMessage!.textContent = finance.lastMessage;

      const item = getItemDefinition(items.inventory);
      itemIcon!.textContent = item?.icon ?? '?';
      itemName!.textContent = item?.shortName ?? 'SEM ITEM';
      if (items.shieldRemaining > 0) itemHint!.textContent = `escudo · ${items.shieldRemaining.toFixed(1)}s`;
      else if (items.slowRemaining > 0) itemHint!.textContent = `lentidão · ${items.slowRemaining.toFixed(1)}s`;
      else itemHint!.textContent = item ? 'ESPAÇO para usar' : 'passe por uma caixa';
      itemChip!.classList.toggle('has-item', item !== null);
      itemChip!.classList.toggle('has-shield', items.shieldRemaining > 0);
      itemChip!.classList.toggle('is-slowed', items.slowRemaining > 0);

      const chargePercent = Math.round(vehicle.driftCharge * 100);
      driftFill!.style.transform = `scaleX(${vehicle.driftCharge})`;
      driftValue!.textContent = `${chargePercent}%`;
      driftChip!.classList.toggle('is-drifting', vehicle.drifting);
      driftChip!.classList.toggle('is-boosting', vehicle.boostRemaining > 0);
      speedChip!.classList.toggle('is-impact', vehicle.impactStrength > 0.28 || items.hitFlashSeconds > 0);

      if (vehicle.boostRemaining > 0) {
        driftLabel!.textContent = 'TURBO';
        driftValue!.textContent = `${vehicle.boostRemaining.toFixed(1)}s`;
        driftFill!.style.transform = `scaleX(${Math.min(vehicle.boostRemaining / 7, 1)})`;
      } else if (vehicle.drifting) {
        driftLabel!.textContent = 'CARREGANDO';
      } else {
        driftLabel!.textContent = 'DRIFT';
      }

      const active = decisions.active;
      decisionCard!.hidden = active === null;
      if (active !== null) {
        decisionKicker!.textContent = active.kicker;
        decisionTitle!.textContent = active.title;
        decisionContext!.textContent = active.context;
        const [first, second] = active.options;
        decisionOption1!.dataset.accent = first.accent;
        decisionOption1Title!.textContent = first.title;
        decisionOption1Detail!.textContent = first.detail;
        decisionOption2!.dataset.accent = second.accent;
        decisionOption2Title!.textContent = second.title;
        decisionOption2Detail!.textContent = second.detail;
      }

      decisionOutcome!.hidden = decisions.outcomeRemaining <= 0 || active !== null || race.finished;
      decisionOutcome!.textContent = decisions.lastOutcome;

      finish!.hidden = !race.finished;
      if (race.finished) {
        finishPosition!.textContent = `${race.position}º DE ${race.totalRacers}`;
        finishTime!.textContent = formatTime(race.raceTimeSeconds);
        bestLap!.textContent = `Melhor volta · ${race.bestLapTimeSeconds === null ? '--:--.---' : formatTime(race.bestLapTimeSeconds)}`;
        finalBalance!.textContent = brl.format(finance.balance);
        finalReserve!.textContent = brl.format(finance.reserve);
        finalDebt!.textContent = brl.format(finance.debt);
        finalNetWorth!.textContent = brl.format(calculateNetWorth(finance));
        finalDecisionCosts!.textContent = brl.format(finance.totalDecisionCosts);
        finalProtected!.textContent = `Reserva protegeu ${brl.format(finance.protectedByReserve)} do imprevisto`;
        finalDecisions!.textContent = `${decisions.history.length} de 3 decisões registradas`;
      }
    },
    dispose(): void {
      hud.remove();
    },
  };

  controller.update(initialState);
  return controller;
}
