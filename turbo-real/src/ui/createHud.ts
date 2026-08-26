import type { GameState } from '../simulation/state';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
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
        <span>Avenida do Troco</span>
      </div>
    </section>

    <section class="race-chip" aria-label="Estado da corrida">
      <strong data-position>1º</strong>
      <div>
        <span data-lap>VOLTA 1/3</span>
        <small data-race-detail>SETOR 1/6 · 00:00.000</small>
      </div>
    </section>

    <section class="wallet-chip" aria-label="Estado financeiro de demonstração">
      <span>Saldo <strong>${brl.format(initialState.balance)}</strong></span>
      <span>Reserva <strong>${brl.format(initialState.reserve)}</strong></span>
    </section>

    <section class="controls-chip" aria-label="Controles">
      <strong>WASD / SETAS + SHIFT</strong>
      <span>dirigir · segure Shift na curva para drift</span>
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

    <section class="wrong-way-chip" data-wrong-way hidden aria-live="assertive">
      <strong>↺ DIREÇÃO ERRADA</strong>
      <span>retorne ao sentido da pista</span>
    </section>

    <section class="finish-chip" data-finish hidden aria-live="polite">
      <span>🏁 CHEGADA</span>
      <strong data-finish-position>1º LUGAR</strong>
      <small data-finish-time>00:00.000</small>
      <em data-best-lap>Melhor volta · --:--.---</em>
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

  if (
    !speed ||
    !direction ||
    !driftLabel ||
    !driftValue ||
    !driftFill ||
    !driftChip ||
    !speedChip ||
    !position ||
    !lap ||
    !raceDetail ||
    !wrongWay ||
    !finish ||
    !finishPosition ||
    !finishTime ||
    !bestLap
  ) {
    throw new Error('HUD da Fase 4 incompleto.');
  }

  const controller: HudController = {
    update(state): void {
      const { vehicle, race } = state;
      speed.textContent = String(Math.round(Math.abs(vehicle.speed) * 3.6));
      const gear = vehicle.speed < -0.1 ? 'R' : 'D';
      direction.textContent = `${gear} · ${Math.round(vehicle.distanceTravelled)} m`;

      position.textContent = `${race.position}º`;
      lap.textContent = `VOLTA ${race.lap}/${race.totalLaps}`;
      const sector = race.finished ? race.checkpointCount : Math.min(race.checkpointsPassed + 1, race.checkpointCount);
      raceDetail.textContent = `SETOR ${sector}/${race.checkpointCount} · ${formatTime(race.raceTimeSeconds)}`;
      wrongWay.hidden = !race.wrongWay || race.finished;

      const chargePercent = Math.round(vehicle.driftCharge * 100);
      driftFill.style.transform = `scaleX(${vehicle.driftCharge})`;
      driftValue.textContent = `${chargePercent}%`;
      driftChip.classList.toggle('is-drifting', vehicle.drifting);
      driftChip.classList.toggle('is-boosting', vehicle.boostRemaining > 0);
      speedChip.classList.toggle('is-impact', vehicle.impactStrength > 0.28);

      if (vehicle.boostRemaining > 0) {
        driftLabel.textContent = 'TURBO';
        driftValue.textContent = `${vehicle.boostRemaining.toFixed(1)}s`;
        driftFill.style.transform = `scaleX(${Math.min(vehicle.boostRemaining / 1.2, 1)})`;
      } else if (vehicle.drifting) {
        driftLabel.textContent = 'CARREGANDO';
      } else {
        driftLabel.textContent = 'DRIFT';
      }

      finish.hidden = !race.finished;
      if (race.finished) {
        finishPosition.textContent = `${race.position}º LUGAR`;
        finishTime.textContent = formatTime(race.raceTimeSeconds);
        bestLap.textContent = `Melhor volta · ${race.bestLapTimeSeconds === null ? '--:--.---' : formatTime(race.bestLapTimeSeconds)}`;
      }
    },
    dispose(): void {
      hud.remove();
    },
  };

  controller.update(initialState);
  return controller;
}
