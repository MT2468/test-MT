import type { GameState } from '../simulation/state';
import type { PlaytestTelemetry } from './PlaytestTelemetry';

function formatNumber(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '0';
}

export interface QaPanelController {
  readonly enabled: boolean;
  update(state: GameState): void;
  dispose(): void;
}

export function isQaModeEnabled(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('qa') === '1' || window.location.hash === '#qa';
}

export function createQaPanel(host: HTMLElement, telemetry: PlaytestTelemetry): QaPanelController {
  const enabled = isQaModeEnabled();
  if (!enabled) return { enabled: false, update: () => {}, dispose: () => {} };

  const panel = document.createElement('aside');
  panel.className = 'qa-panel';
  panel.setAttribute('aria-label', 'Telemetria de playtest');
  panel.innerHTML = `
    <header><span>QA · FASE 13</span><strong data-qa-track></strong></header>
    <div class="qa-grid">
      <span>FPS <strong data-qa-fps>0</strong></span>
      <span>Frame <strong data-qa-frame>0 ms</strong></span>
      <span>Pior <strong data-qa-worst>0 ms</strong></span>
      <span>Lentos <strong data-qa-slow>0</strong></span>
      <span>Calls <strong data-qa-calls>0</strong></span>
      <span>Tris <strong data-qa-tris>0</strong></span>
      <span>Vel. média <strong data-qa-speed>0</strong></span>
      <span>Pico <strong data-qa-peak>0</strong></span>
      <span>Impactos <strong data-qa-impacts>0</strong></span>
      <span>Errado <strong data-qa-wrong>0 s</strong></span>
      <span>Itens <strong data-qa-items>0/0</strong></span>
      <span>Boost <strong data-qa-boost>0 s</strong></span>
    </div>
    <div class="qa-balance" data-qa-balance></div>
    <button type="button" data-qa-copy>COPIAR RELATÓRIO</button>
    <small data-qa-copy-status>Use ?qa=1 para comparar corridas.</small>
  `;
  host.append(panel);

  const find = (selector: string): HTMLElement => {
    const element = panel.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Elemento QA ausente: ${selector}`);
    return element;
  };
  const track = find('[data-qa-track]');
  const fps = find('[data-qa-fps]');
  const frame = find('[data-qa-frame]');
  const worst = find('[data-qa-worst]');
  const slow = find('[data-qa-slow]');
  const calls = find('[data-qa-calls]');
  const tris = find('[data-qa-tris]');
  const speed = find('[data-qa-speed]');
  const peak = find('[data-qa-peak]');
  const impacts = find('[data-qa-impacts]');
  const wrong = find('[data-qa-wrong]');
  const items = find('[data-qa-items]');
  const boost = find('[data-qa-boost]');
  const balance = find('[data-qa-balance]');
  const copyButton = find('[data-qa-copy]') as HTMLButtonElement;
  const copyStatus = find('[data-qa-copy-status]');
  let lastState: GameState | null = null;
  let lastPaint = 0;

  copyButton.addEventListener('click', () => {
    if (lastState === null) return;
    const report = telemetry.formatReport(lastState);
    void navigator.clipboard?.writeText(report).then(
      () => { copyStatus.textContent = 'Relatório copiado.'; },
      () => { copyStatus.textContent = 'Não foi possível acessar a área de transferência.'; },
    );
    console.info(report);
  });

  const analysis = telemetry.analysis;
  const warningText = analysis.warnings.length > 0 ? ` · ⚠ ${analysis.warnings.join(' | ')}` : '';
  balance.textContent = `Pista ${formatNumber(analysis.lengthMeters, 0)} m · técnica ${formatNumber(analysis.technicality, 2)} · IA ×${formatNumber(analysis.aiPaceScale, 3)} · pressão R$ ${formatNumber(analysis.economyPressure, 2)}${warningText}`;

  return {
    enabled: true,
    update(state): void {
      lastState = state;
      const now = performance.now();
      if (now - lastPaint < 180 && state.phase !== 'finished') return;
      lastPaint = now;
      const snapshot = telemetry.snapshot(state);
      track.textContent = snapshot.trackName;
      fps.textContent = formatNumber(snapshot.averageFps, 1);
      frame.textContent = `${formatNumber(snapshot.averageFrameMs, 1)} ms`;
      worst.textContent = `${formatNumber(snapshot.worstFrameMs, 1)} ms`;
      slow.textContent = String(snapshot.slowFrames);
      calls.textContent = String(snapshot.maxDrawCalls);
      tris.textContent = String(snapshot.maxTriangles);
      speed.textContent = `${formatNumber(snapshot.averageSpeedKmh, 0)} km/h`;
      peak.textContent = `${formatNumber(snapshot.peakSpeedKmh, 0)} km/h`;
      impacts.textContent = String(snapshot.impacts);
      wrong.textContent = `${formatNumber(snapshot.wrongWaySeconds, 1)} s`;
      items.textContent = `${snapshot.itemPickups}/${snapshot.itemUses}`;
      boost.textContent = `${formatNumber(snapshot.boostSeconds, 1)} s`;
      panel.classList.toggle('is-finished', state.phase === 'finished');
    },
    dispose(): void {
      panel.remove();
    },
  };
}
