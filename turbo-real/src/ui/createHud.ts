import { calculateNetWorth } from '../simulation/finance/types';
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
        <span>Avenida do Troco · corrida financeira</span>
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
    </section>

    <section class="controls-chip" aria-label="Controles">
      <strong>WASD · SHIFT · ESPAÇO · E/Q</strong>
      <span>dirigir · drift · item · guardar/retirar R$10</span>
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
        <small data-final-protected>Reserva protegeu R$0</small>
      </div>
    </section>
  `;
  host.append(hud);

  const speed = hud.querySelector<HTMLElement>('[data-speed]');
  const direction = hud.querySelector<HTMLElement>('[data-direction]');
  const driftLabel = hud.querySelector<HTMLElement>('[data-drift-label]');
  const driftValue = hud.querySelector<HTMLElement>('[data-drift-value]');
  const driftFill = hud.querySelector<HTMLElement>('[data-drift-fill]');
  const driftChip = hud.querySelector<HTMLElement>('.drift-chip');
  const speedChip = hud.querySelector<HTMLElement>('.speed-chip');
  const position = hud.querySelector<HTMLElement>('[data-position]');
  const lap = hud.querySelector<HTMLElement>('[data-lap]');
  const raceDetail = hud.querySelector<HTMLElement>('[data-race-detail]');
  const wrongWay = hud.querySelector<HTMLElement>('[data-wrong-way]');
  const finish = hud.querySelector<HTMLElement>('[data-finish]');
  const finishPosition = hud.querySelector<HTMLElement>('[data-finish-position]');
  const finishTime = hud.querySelector<HTMLElement>('[data-finish-time]');
  const bestLap = hud.querySelector<HTMLElement>('[data-best-lap]');
  const itemChip = hud.querySelector<HTMLElement>('.item-chip');
  const itemIcon = hud.querySelector<HTMLElement>('[data-item-icon]');
  const itemName = hud.querySelector<HTMLElement>('[data-item-name]');
  const itemHint = hud.querySelector<HTMLElement>('[data-item-hint]');
  const balance = hud.querySelector<HTMLElement>('[data-balance]');
  const reserve = hud.querySelector<HTMLElement>('[data-reserve]');
  const debt = hud.querySelector<HTMLElement>('[data-debt]');
  const debtRow = hud.querySelector<HTMLElement>('[data-debt-row]');
  const financeToast = hud.querySelector<HTMLElement>('[data-finance-toast]');
  const financeMessage = hud.querySelector<HTMLElement>('[data-finance-message]');
  const finalBalance = hud.querySelector<HTMLElement>('[data-final-balance]');
  const finalReserve = hud.querySelector<HTMLElement>('[data-final-reserve]');
  const finalDebt = hud.querySelector<HTMLElement>('[data-final-debt]');
  const finalNetWorth = hud.querySelector<HTMLElement>('[data-final-net-worth]');
  const finalProtected = hud.querySelector<HTMLElement>('[data-final-protected]');

  if (
    !speed || !direction || !driftLabel || !driftValue || !driftFill || !driftChip || !speedChip ||
    !position || !lap || !raceDetail || !wrongWay || !finish || !finishPosition || !finishTime || !bestLap ||
    !itemChip || !itemIcon || !itemName || !itemHint || !balance || !reserve || !debt || !debtRow ||
    !financeToast || !financeMessage || !finalBalance || !finalReserve || !finalDebt || !finalNetWorth || !finalProtected
  ) {
    throw new Error('HUD da Fase 7 incompleto.');
  }

  const controller: HudController = {
    update(state): void {
      const { vehicle, race, items, finance } = state;
      speed.textContent = String(Math.round(Math.abs(vehicle.speed) * 3.6));
      const gear = vehicle.speed < -0.1 ? 'R' : 'D';
      direction.textContent = `${gear} · ${Math.round(vehicle.distanceTravelled)} m`;

      position.textContent = `${race.position}º/${race.totalRacers}`;
      lap.textContent = `VOLTA ${race.lap}/${race.totalLaps}`;
      const sector = race.finished ? race.checkpointCount : Math.min(race.checkpointsPassed + 1, race.checkpointCount);
      raceDetail.textContent = `SETOR ${sector}/${race.checkpointCount} · ${formatTime(race.raceTimeSeconds)}`;
      wrongWay.hidden = !race.wrongWay || race.finished;

      balance.textContent = brl.format(finance.balance);
      reserve.textContent = brl.format(finance.reserve);
      debt.textContent = brl.format(finance.debt);
      debtRow.classList.toggle('has-debt', finance.debt > 0);
      financeToast.hidden = finance.messageRemaining <= 0 || race.finished;
      financeMessage.textContent = finance.lastMessage;

      const item = getItemDefinition(items.inventory);
      itemIcon.textContent = item?.icon ?? '?';
      itemName.textContent = item?.shortName ?? 'SEM ITEM';
      if (items.shieldRemaining > 0) itemHint.textContent = `escudo · ${items.shieldRemaining.toFixed(1)}s`;
      else if (items.slowRemaining > 0) itemHint.textContent = `lentidão · ${items.slowRemaining.toFixed(1)}s`;
      else itemHint.textContent = item ? 'ESPAÇO para usar' : 'passe por uma caixa';
      itemChip.classList.toggle('has-item', item !== null);
      itemChip.classList.toggle('has-shield', items.shieldRemaining > 0);
      itemChip.classList.toggle('is-slowed', items.slowRemaining > 0);

      const chargePercent = Math.round(vehicle.driftCharge * 100);
      driftFill.style.transform = `scaleX(${vehicle.driftCharge})`;
      driftValue.textContent = `${chargePercent}%`;
      driftChip.classList.toggle('is-drifting', vehicle.drifting);
      driftChip.classList.toggle('is-boosting', vehicle.boostRemaining > 0);
      speedChip.classList.toggle('is-impact', vehicle.impactStrength > 0.28 || items.hitFlashSeconds > 0);

      if (vehicle.boostRemaining > 0) {
        driftLabel.textContent = 'TURBO';
        driftValue.textContent = `${vehicle.boostRemaining.toFixed(1)}s`;
        driftFill.style.transform = `scaleX(${Math.min(vehicle.boostRemaining / 1.7, 1)})`;
      } else if (vehicle.drifting) {
        driftLabel.textContent = 'CARREGANDO';
      } else {
        driftLabel.textContent = 'DRIFT';
      }

      finish.hidden = !race.finished;
      if (race.finished) {
        finishPosition.textContent = `${race.position}º DE ${race.totalRacers}`;
        finishTime.textContent = formatTime(race.raceTimeSeconds);
        bestLap.textContent = `Melhor volta · ${race.bestLapTimeSeconds === null ? '--:--.---' : formatTime(race.bestLapTimeSeconds)}`;
        finalBalance.textContent = brl.format(finance.balance);
        finalReserve.textContent = brl.format(finance.reserve);
        finalDebt.textContent = brl.format(finance.debt);
        finalNetWorth.textContent = brl.format(calculateNetWorth(finance));
        finalProtected.textContent = `Reserva protegeu ${brl.format(finance.protectedByReserve)} do imprevisto`;
      }
    },
    dispose(): void {
      hud.remove();
    },
  };

  controller.update(initialState);
  return controller;
}
