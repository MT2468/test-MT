import type { GameState } from '../simulation/state';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

export function createHud(host: HTMLElement, state: GameState): () => void {
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

    <section class="status-chip" aria-live="polite">
      <span class="status-chip__dot" aria-hidden="true"></span>
      <div>
        <strong>Fase 0 · Boot técnico</strong>
        <span>Three.js + TypeScript + Vite</span>
      </div>
    </section>

    <section class="wallet-chip" aria-label="Estado financeiro de demonstração">
      <span>Saldo <strong>${brl.format(state.balance)}</strong></span>
      <span>Reserva <strong>${brl.format(state.reserve)}</strong></span>
    </section>
  `;
  host.append(hud);

  return () => hud.remove();
}
