import './styles.css';
import './race.css';
import './items.css';
import './finance.css';
import './decisions.css';
import './menus.css';
import './controls.css';
import './content.css';
import './qa.css';
import { AudioDirector } from './audio/AudioDirector';
import { auditTrackCatalog } from './diagnostics/trackAnalysis';
import { KartPhysics } from './physics/KartPhysics';
import { GameApp } from './render/app/GameApp';
import { AIFleetController } from './simulation/AIController';
import { DecisionController } from './simulation/decisions/DecisionController';
import { FinanceController } from './simulation/finance/FinanceController';
import { ItemController } from './simulation/items/ItemController';
import { RaceController } from './simulation/RaceController';
import { createInitialGameState } from './simulation/state';
import { TRACK_CATALOG } from './track/catalog';
import type { TrackDefinition } from './track/firstTrack';
import { createGameUi, type GameUiController } from './ui/createGameUi';
import { createHud, type HudController } from './ui/createHud';
import { createTrackSelector, type TrackSelectorController } from './ui/createTrackSelector';

interface ActiveSession {
  readonly game: GameApp;
  readonly hud: HudController;
}

async function bootstrap(root: HTMLElement): Promise<void> {
  const catalogWarnings = auditTrackCatalog(TRACK_CATALOG);
  if (catalogWarnings.length > 0) console.warn('Auditoria de balanceamento da Copa Primeiro Salário:', catalogWarnings);

  const audio = new AudioDirector();
  let selectedTrack = TRACK_CATALOG[0];
  let sessionTrack = selectedTrack;
  let activeSession: ActiveSession | null = null;
  let starting = false;
  let ui: GameUiController;
  let trackSelector: TrackSelectorController;

  function disposeSession(): void {
    if (activeSession !== null) {
      activeSession.game.dispose();
      activeSession.hud.dispose();
      activeSession = null;
    }
    audio.stopSession();
    root.replaceChildren();
  }

  async function startSession(track: TrackDefinition): Promise<void> {
    if (starting) return;
    starting = true;
    ui.setBusy(true);

    try {
      try {
        await audio.unlock();
        audio.playUi('confirm');
      } catch (error) {
        console.warn('Web Audio indisponível; iniciando corrida sem som.', error);
      }

      disposeSession();
      const state = createInitialGameState(track);
      audio.resetSession(state);
      const hud = createHud(document.body, state);
      const hudTrackLabel = document.querySelector<HTMLElement>('.brand-chip div span');
      if (hudTrackLabel) hudTrackLabel.textContent = track.name;
      let physics: KartPhysics | null = null;

      try {
        physics = await KartPhysics.create(state.vehicle, track, state.rivals);
        const race = new RaceController(track, state.race, state.vehicle);
        const ai = new AIFleetController(track, state.rivals);
        const items = new ItemController(track, state);
        const finance = new FinanceController(state.finance, state.race, track.economy);
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
          audio,
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
        audio.stopSession();
        root.replaceChildren();
        ui.showMenu();
        throw error;
      }
    } finally {
      starting = false;
      ui.setBusy(false);
    }
  }

  function startSelectedTrack(): Promise<void> {
    sessionTrack = selectedTrack;
    return startSession(sessionTrack);
  }

  function restartSession(): Promise<void> {
    return startSession(sessionTrack);
  }

  function exitToMenu(): void {
    audio.playUi('back');
    disposeSession();
    ui.showMenu();
  }

  ui = createGameUi(document.body, selectedTrack, {
    onStart: startSelectedTrack,
    onResume: () => activeSession?.game.resume(),
    onRestart: restartSession,
    onExitToMenu: exitToMenu,
  });
  trackSelector = createTrackSelector(document.body, TRACK_CATALOG, selectedTrack, (track) => {
    selectedTrack = track;
  });
  ui.showMenu();

  window.addEventListener(
    'beforeunload',
    () => {
      disposeSession();
      trackSelector.dispose();
      ui.dispose();
      audio.dispose();
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
