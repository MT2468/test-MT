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
        <span>Corrida financeira brasileira</span>
      </div>
    </section>

    <section class="status-chip">
      <span class="status-chip__dot" aria-hidden="true"></span>
      <div>
        <strong>Fase 1 · Direção arcade</strong>
        <span>Kart dirigível + câmera de perseguição</span>
      </div>
    </section>

    <section class="wallet-chip" aria-label="Estado financeiro de demonstração">
      <span>Saldo <strong>${brl.format(initialState.balance)}</strong></span>
      <span>Reserva <strong>${brl.format(initialState.reserve)}</strong></span>
    </section>

    <section class="controls-chip" aria-label="Controles">
      <strong>WASD / SETAS</strong>
      <span>acelerar · frear/ré · esterçar</span>
    </section>

    <section class="speed-chip" aria-label="Velocidade do kart">
      <div><strong data-speed>0</strong><span>km/h</span></div>
      <small data-direction>D · 0 m</small>
    </section>
  `;
  host.append(hud);

  const speed = hud.querySelector<HTMLElement>('[data-speed]');
  const direction = hud.querySelector<HTMLElement>('[data-direction]');
  if (!speed || !direction) throw new Error('HUD da Fase 1 incompleto.');

  const controller: HudController = {
    update(state): void {
      speed.textContent = String(Math.round(Math.abs(state.vehicle.speed) * 3.6));
      const gear = state.vehicle.speed < -0.1 ? 'R' : 'D';
      direction.textContent = `${gear} · ${Math.round(state.vehicle.distanceTravelled)} m`;
    },
    dispose(): void {
      hud.remove();
    },
  };

  controller.update(initialState);
  return controller;
}
