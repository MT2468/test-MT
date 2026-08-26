import { calculateNetWorth } from '../simulation/finance/types';
import type { GameState } from '../simulation/state';
import type { TrackDefinition } from '../track/firstTrack';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });

function formatTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.floor((safeSeconds % 1) * 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

function getConnectedGamepad(): Gamepad | null {
  if (typeof navigator.getGamepads !== 'function') return null;
  const pads = Array.from(navigator.getGamepads()).filter((pad): pad is Gamepad => pad !== null && pad.connected);
  return pads.find((pad) => pad.mapping === 'standard') ?? pads[0] ?? null;
}

export interface GameUiActions {
  readonly onStart: () => void | Promise<void>;
  readonly onResume: () => void;
  readonly onRestart: () => void | Promise<void>;
  readonly onExitToMenu: () => void;
}

export interface GameUiController {
  showMenu(): void;
  update(state: GameState): void;
  setBusy(busy: boolean): void;
  dispose(): void;
}

export function createGameUi(host: HTMLElement, track: TrackDefinition, actions: GameUiActions): GameUiController {
  const shell = document.createElement('div');
  shell.className = 'game-shell';
  shell.innerHTML = `
    <section class="game-menu game-surface" data-main-menu aria-label="Menu principal">
      <div class="game-menu__glow" aria-hidden="true"></div>
      <div class="game-menu__panel">
        <div class="game-logo"><span class="game-logo__mark">◆</span><div><small>CORRIDA FINANCEIRA BRASILEIRA</small><h1>TURBO REAL</h1></div></div>
        <div class="menu-copy"><span class="menu-kicker">FASE 11 · MOBILE + GAMEPAD</span><h2>Velocidade agora. Consequência depois.</h2><p>Corra três voltas administrando reserva, custos, itens e escolhas financeiras.</p></div>
        <article class="race-select-card"><div class="race-select-card__top"><span>SELECIONADO</span><strong data-track-name></strong></div><p data-track-subtitle></p><div class="race-select-card__stats"><span><strong data-track-laps></strong> voltas</span><span><strong>8</strong> pilotos</span><span><strong>4</strong> itens</span><span><strong>3</strong> decisões</span></div></article>
        <button class="menu-primary" type="button" data-start-race><span>LARGAR</span><small>Enter / A</small></button>
        <details class="controls-drawer"><summary>Controles por dispositivo</summary><div class="input-guide">
          <div class="input-guide__row"><strong>TECLADO</strong><span>WASD/setas dirigir · Shift drift · Espaço item · E/Q reserva · 1/2 decisões · Esc pausa.</span></div>
          <div class="input-guide__row"><strong>GAMEPAD</strong><span>Analógico/D-pad direção · RT acelera · LT freia · A drift · X item · Y/B reserva · Start pausa. Em decisões, A/B escolhem 1/2.</span></div>
          <div class="input-guide__row"><strong>TOQUE</strong><span>Controles aparecem automaticamente em telas touch. Direção à esquerda, pedais à direita, drift/item acima e escolhas em botões próprios.</span></div>
        </div></details>
      </div>
      <footer class="menu-footer">Protótipo jogável · valores financeiros fictícios de gameplay</footer>
    </section>

    <section class="pause-menu game-surface" data-pause-menu hidden aria-label="Jogo pausado"><div class="pause-panel"><span class="menu-kicker">CORRIDA CONGELADA</span><h2>PAUSA</h2><p data-pause-status></p><div class="pause-actions"><button class="menu-primary" type="button" data-resume>CONTINUAR <small>Esc / Start</small></button><button class="menu-secondary" type="button" data-restart>REINICIAR CORRIDA</button><button class="menu-ghost" type="button" data-exit-menu>VOLTAR AO MENU</button></div><div class="pause-controls">Teclado: Esc · Controle: Start/A · Toque: botões deste menu</div></div></section>

    <section class="results-menu game-surface" data-results-menu hidden aria-label="Resultados da corrida"><div class="results-panel">
      <header class="results-hero"><div><span class="menu-kicker">BANDEIRADA</span><h2 data-result-position></h2><p data-result-time></p></div><div class="results-best"><small>MELHOR VOLTA</small><strong data-result-best></strong></div></header>
      <div class="results-columns"><section class="results-card"><h3>CLASSIFICAÇÃO</h3><ol class="standings-list" data-standings></ol></section><section class="results-card"><h3>FECHAMENTO FINANCEIRO</h3><div class="finance-summary"><span>Saldo <strong data-result-balance></strong></span><span>Reserva <strong data-result-reserve></strong></span><span>Dívida <strong data-result-debt></strong></span><span>Patrimônio <strong data-result-net-worth></strong></span><span>Custos das escolhas <strong data-result-decision-costs></strong></span><small data-result-protected></small></div></section></div>
      <section class="decision-recap"><h3>SUAS ESCOLHAS</h3><div data-decision-history></div></section>
      <div class="results-actions"><button class="menu-primary" type="button" data-race-again>CORRER DE NOVO <small>Enter / A</small></button><button class="menu-secondary" type="button" data-results-menu-button>MENU PRINCIPAL</button></div>
    </div></section>
  `;
  host.append(shell);

  const get = <T extends HTMLElement>(selector: string): T | null => shell.querySelector<T>(selector);
  const mainMenu = get<HTMLElement>('[data-main-menu]');
  const pauseMenu = get<HTMLElement>('[data-pause-menu]');
  const resultsMenu = get<HTMLElement>('[data-results-menu]');
  const startButton = get<HTMLButtonElement>('[data-start-race]');
  const resumeButton = get<HTMLButtonElement>('[data-resume]');
  const restartButton = get<HTMLButtonElement>('[data-restart]');
  const exitButton = get<HTMLButtonElement>('[data-exit-menu]');
  const raceAgainButton = get<HTMLButtonElement>('[data-race-again]');
  const resultMenuButton = get<HTMLButtonElement>('[data-results-menu-button]');
  const pauseStatus = get<HTMLElement>('[data-pause-status]');
  const resultPosition = get<HTMLElement>('[data-result-position]');
  const resultTime = get<HTMLElement>('[data-result-time]');
  const resultBest = get<HTMLElement>('[data-result-best]');
  const standings = get<HTMLOListElement>('[data-standings]');
  const resultBalance = get<HTMLElement>('[data-result-balance]');
  const resultReserve = get<HTMLElement>('[data-result-reserve]');
  const resultDebt = get<HTMLElement>('[data-result-debt]');
  const resultNetWorth = get<HTMLElement>('[data-result-net-worth]');
  const resultDecisionCosts = get<HTMLElement>('[data-result-decision-costs]');
  const resultProtected = get<HTMLElement>('[data-result-protected]');
  const decisionHistory = get<HTMLElement>('[data-decision-history]');
  const trackName = get<HTMLElement>('[data-track-name]');
  const trackSubtitle = get<HTMLElement>('[data-track-subtitle]');
  const trackLaps = get<HTMLElement>('[data-track-laps]');

  const required = [mainMenu, pauseMenu, resultsMenu, startButton, resumeButton, restartButton, exitButton, raceAgainButton, resultMenuButton, pauseStatus, resultPosition, resultTime, resultBest, standings, resultBalance, resultReserve, resultDebt, resultNetWorth, resultDecisionCosts, resultProtected, decisionHistory, trackName, trackSubtitle, trackLaps];
  if (required.some((element) => element === null)) throw new Error('UI da Fase 11 incompleta.');

  trackName!.textContent = track.name;
  trackSubtitle!.textContent = track.subtitle;
  trackLaps!.textContent = String(track.race.totalLaps);

  let surface: 'menu' | 'race' | 'pause' | 'results' = 'menu';
  let busy = false;
  let gamepadFrame = 0;
  let previousUiButtons: boolean[] = [];
  let analogLatch = 0;

  function run(action: () => void | Promise<void>): void {
    if (busy) return;
    void Promise.resolve(action()).catch((error: unknown) => console.error('Falha em ação de menu:', error));
  }

  function clearGamepadFocus(): void {
    for (const button of shell.querySelectorAll<HTMLButtonElement>('button.is-gamepad-focused')) {
      button.classList.remove('is-gamepad-focused');
    }
  }

  function activeSurface(): HTMLElement | null {
    if (surface === 'menu') return mainMenu;
    if (surface === 'pause') return pauseMenu;
    if (surface === 'results') return resultsMenu;
    return null;
  }

  function activeButtons(): HTMLButtonElement[] {
    const container = activeSurface();
    if (container === null) return [];
    return Array.from(container.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  }

  function focusRelative(direction: number): void {
    const buttons = activeButtons();
    if (buttons.length === 0) return;
    const currentIndex = buttons.findIndex((button) => button.classList.contains('is-gamepad-focused'));
    const nextIndex = currentIndex < 0
      ? direction < 0 ? buttons.length - 1 : 0
      : (currentIndex + direction + buttons.length) % buttons.length;
    clearGamepadFocus();
    const target = buttons[nextIndex];
    target.classList.add('is-gamepad-focused');
    target.focus({ preventScroll: true });
  }

  function activateFocused(): void {
    const buttons = activeButtons();
    if (buttons.length === 0) return;
    const focused = buttons.find((button) => button.classList.contains('is-gamepad-focused')) ?? buttons[0];
    clearGamepadFocus();
    focused.classList.add('is-gamepad-focused');
    focused.focus({ preventScroll: true });
    focused.click();
  }

  function setSurface(next: typeof surface): void {
    surface = next;
    mainMenu!.hidden = next !== 'menu';
    pauseMenu!.hidden = next !== 'pause';
    resultsMenu!.hidden = next !== 'results';
    shell.classList.toggle('is-racing', next === 'race');
    clearGamepadFocus();
  }

  function renderResults(state: GameState): void {
    const { race, finance, decisions } = state;
    resultPosition!.textContent = `${race.position}º LUGAR`;
    resultTime!.textContent = formatTime(race.raceTimeSeconds);
    resultBest!.textContent = race.bestLapTimeSeconds === null ? '--:--.---' : formatTime(race.bestLapTimeSeconds);
    resultBalance!.textContent = brl.format(finance.balance);
    resultReserve!.textContent = brl.format(finance.reserve);
    resultDebt!.textContent = brl.format(finance.debt);
    resultNetWorth!.textContent = brl.format(calculateNetWorth(finance));
    resultDecisionCosts!.textContent = brl.format(finance.totalDecisionCosts);
    resultProtected!.textContent = `Reserva protegeu ${brl.format(finance.protectedByReserve)} do imprevisto`;

    standings!.replaceChildren();
    const racers = [{ name: 'VOCÊ', position: race.position, finished: race.finished, time: race.raceTimeSeconds }, ...state.rivals.map((rival) => ({ name: rival.name, position: rival.race.position, finished: rival.race.finished, time: rival.race.raceTimeSeconds }))].sort((a, b) => a.position - b.position);
    for (const racer of racers) {
      const row = document.createElement('li');
      if (racer.name === 'VOCÊ') row.classList.add('is-player');
      const place = document.createElement('strong');
      place.textContent = `${racer.position}º`;
      const name = document.createElement('span');
      name.textContent = racer.name;
      const time = document.createElement('small');
      time.textContent = racer.finished ? formatTime(racer.time) : 'na pista';
      row.append(place, name, time);
      standings!.append(row);
    }

    decisionHistory!.replaceChildren();
    if (decisions.history.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'Nenhuma decisão financeira foi registrada.';
      decisionHistory!.append(empty);
    } else {
      for (const record of decisions.history) {
        const card = document.createElement('article');
        const choice = document.createElement('span');
        choice.textContent = record.optionTitle;
        const outcome = document.createElement('small');
        outcome.textContent = record.outcome;
        card.append(choice, outcome);
        decisionHistory!.append(card);
      }
    }
  }

  function pollGamepadUi(): void {
    const pad = getConnectedGamepad();
    if (pad === null) {
      previousUiButtons = [];
      analogLatch = 0;
      gamepadFrame = window.requestAnimationFrame(pollGamepadUi);
      return;
    }

    const currentButtons = pad.buttons.map((button) => button.pressed || button.value >= 0.55);
    const hasHistory = previousUiButtons.length === currentButtons.length && currentButtons.length > 0;
    const justPressed = (index: number): boolean => hasHistory && currentButtons[index] === true && previousUiButtons[index] !== true;

    if (surface !== 'race' && !busy) {
      const digitalUp = justPressed(12) || justPressed(14);
      const digitalDown = justPressed(13) || justPressed(15);
      const axisY = pad.axes[1] ?? 0;
      const analogDirection = axisY < -0.65 ? -1 : axisY > 0.65 ? 1 : 0;

      if (digitalUp) focusRelative(-1);
      else if (digitalDown) focusRelative(1);
      else if (analogDirection !== 0 && analogLatch === 0) focusRelative(analogDirection);

      if (Math.abs(axisY) < 0.35) analogLatch = 0;
      else if (analogDirection !== 0) analogLatch = analogDirection;

      if (justPressed(0)) activateFocused();
      if (justPressed(9)) {
        if (surface === 'menu') run(actions.onStart);
        else if (surface === 'results') run(actions.onRestart);
      }
      if (justPressed(1)) {
        if (surface === 'pause') actions.onResume();
        else if (surface === 'results') actions.onExitToMenu();
      }
    }

    previousUiButtons = currentButtons;
    gamepadFrame = window.requestAnimationFrame(pollGamepadUi);
  }

  startButton!.addEventListener('click', () => run(actions.onStart));
  resumeButton!.addEventListener('click', actions.onResume);
  restartButton!.addEventListener('click', () => run(actions.onRestart));
  exitButton!.addEventListener('click', actions.onExitToMenu);
  raceAgainButton!.addEventListener('click', () => run(actions.onRestart));
  resultMenuButton!.addEventListener('click', actions.onExitToMenu);
  shell.addEventListener('pointerdown', clearGamepadFocus);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target) || event.repeat || event.code !== 'Enter') return;
    if (surface === 'menu') {
      event.preventDefault();
      run(actions.onStart);
    } else if (surface === 'results') {
      event.preventDefault();
      run(actions.onRestart);
    }
  };
  window.addEventListener('keydown', onKeyDown);
  gamepadFrame = window.requestAnimationFrame(pollGamepadUi);

  return {
    showMenu(): void {
      setSurface('menu');
    },
    update(state): void {
      if (state.phase === 'paused') {
        pauseStatus!.textContent = `Volta ${state.race.lap}/${state.race.totalLaps} · ${state.race.position}º/${state.race.totalRacers} · ${formatTime(state.race.raceTimeSeconds)}`;
        if (surface !== 'pause') setSurface('pause');
        return;
      }
      if (state.phase === 'finished') {
        if (surface !== 'results') {
          renderResults(state);
          setSurface('results');
        }
        return;
      }
      if (surface !== 'race') setSurface('race');
    },
    setBusy(nextBusy): void {
      busy = nextBusy;
      for (const button of shell.querySelectorAll<HTMLButtonElement>('button')) button.disabled = busy;
      startButton!.classList.toggle('is-loading', busy && surface === 'menu');
    },
    dispose(): void {
      window.cancelAnimationFrame(gamepadFrame);
      window.removeEventListener('keydown', onKeyDown);
      shell.remove();
    },
  };
}
