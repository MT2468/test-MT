import './styles.css';
import './race.css';
import './items.css';
import './finance.css';
import './decisions.css';
import './menus.css';
import { KartPhysics } from './physics/KartPhysics';
import { GameApp } from './render/app/GameApp';
import { AIFleetController } from './simulation/AIController';
import { DecisionController } from './simulation/decisions/DecisionController';
import { FinanceController } from './simulation/finance/FinanceController';
import { ItemController } from './simulation/items/ItemController';
import { RaceController } from './simulation/RaceController';
import { createInitialGameState } from './simulation/state';
import { FIRST_TRACK } from './track/firstTrack';
import { createGameUi, type GameUiController } from './ui/createGameUi';
import { createHud, type HudController } from './ui/createHud';

interface ActiveSession {
  readonly game: GameApp;
  readonly hud: HudController;
}

async function bootstrap(root: HTMLElement): Promise<void> {
  const track = FIRST_TRACK;
  let activeSession: ActiveSession | null = null;
  let starting = false;
  let ui: GameUiController;

  function disposeSession(): void {
    if (activeSession !== null) {
      activeSession.game.dispose();
      activeSession.hud.dispose();
      activeSession = null;
    }
    root.replaceChildren();
  }

  async function startSession(): Promise<void> {
    if (starting) return;
    starting = true;
    ui.setBusy(true);
    disposeSession();

    const state = createInitialGameState(track);
    const hud = createHud(document.body, state);
    let physics: KartPhysics | null = null;

    try {
      physics = await KartPhysics.create(state.vehicle, track, state.rivals);
      const race = new RaceController(track, state.race, state.vehicle);
      const ai = new AIFleetController(track, state.rivals);
      const items = new ItemController(track, state);
      const finance = new FinanceController(state.finance, state.race);
      const decisions = new DecisionController(state.decisions);
      const game = new GameApp(
        root,
        state,
        physics,
        race,
        ai,
        items,
        finance,
        decisions,
        track,
        (nextState) => {
          hud.update(nextState);
          ui.update(nextState);
        },
      );
      physics = null;
      activeSession = { game, hud };
      game.start();
    } catch (error) {
      physics?.dispose();
      hud.dispose();
      root.replaceChildren();
      ui.showMenu();
      throw error;
    } finally {
      starting = false;
      ui.setBusy(false);
    }
  }

  function exitToMenu(): void {
    disposeSession();
    ui.showMenu();
  }

  ui = createGameUi(document.body, track, {
    onStart: startSession,
    onResume: () => activeSession?.game.resume(),
    onRestart: startSession,
    onExitToMenu: exitToMenu,
  });
  ui.showMenu();

  window.addEventListener(
    'beforeunload',
    () => {
      disposeSession();
      ui.dispose();
    },
    { once: true },
  );
}

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Elemento #app não encontrado.');

void bootstrap(root).catch((error: unknown) => {
  console.error('Falha ao iniciar Turbo Real:', error);
  root.innerHTML = '<div class="boot-error"><strong>Falha ao iniciar o jogo.</strong><span>Recarregue a página ou verifique o suporte a WebAssembly.</span></div>';
});
