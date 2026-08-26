import type { GameState } from '../simulation/state';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

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

    <section class="status-chip">
      <span class="status-chip__dot" aria-hidden="true"></span>
      <div>
        <strong>Fase 3 · Circuito completo</strong>
        <span>pista fechada + curvas de drift</span>
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
  `;
  host.append(hud);

  const speed = hud.querySelector<HTMLElement>('[data-speed]');
  const direction = hud.querySelector<HTMLElement>('[data-direction]');
  const driftLabel = hud.querySelector<HTMLElement>('[data-drift-label]');
  const driftValue = hud.querySelector<HTMLElement>('[data-drift-value]');
  const driftFill = hud.querySelector<HTMLElement>('[data-drift-fill]');
  const driftChip = hud.querySelector<HTMLElement>('.drift-chip');
  const speedChip = hud.querySelector<HTMLElement>('.speed-chip');
  if (!speed || !direction || !driftLabel || !driftValue || !driftFill || !driftChip || !speedChip) {
    throw new Error('HUD da Fase 3 incompleto.');
  }

  const controller: HudController = {
    update(state): void {
      const { vehicle } = state;
      speed.textContent = String(Math.round(Math.abs(vehicle.speed) * 3.6));
      const gear = vehicle.speed < -0.1 ? 'R' : 'D';
      direction.textContent = `${gear} · ${Math.round(vehicle.distanceTravelled)} m`;

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
    },
    dispose(): void {
      hud.remove();
    },
  };

  controller.update(initialState);
  return controller;
}
