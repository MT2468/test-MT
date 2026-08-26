import './styles.css';
import './race.css';
import './items.css';
import { KartPhysics } from './physics/KartPhysics';
import { GameApp } from './render/app/GameApp';
import { AIFleetController } from './simulation/AIController';
import { ItemController } from './simulation/items/ItemController';
import { RaceController } from './simulation/RaceController';
import { createInitialGameState } from './simulation/state';
import { FIRST_TRACK } from './track/firstTrack';
import { createHud } from './ui/createHud';

async function bootstrap(root: HTMLElement): Promise<void> {
  const track = FIRST_TRACK;
  const state = createInitialGameState(track);
  const hud = createHud(document.body, state);
  const physics = await KartPhysics.create(state.vehicle, track, state.rivals);
  const race = new RaceController(track, state.race, state.vehicle);
  const ai = new AIFleetController(track, state.rivals);
  const items = new ItemController(track, state);
  const game = new GameApp(root, state, physics, race, ai, items, track, (nextState) => hud.update(nextState));

  game.start();

  window.addEventListener(
    'beforeunload',
    () => {
      game.dispose();
      hud.dispose();
    },
    { once: true },
  );
}

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Elemento #app não encontrado.');

void bootstrap(root).catch((error: unknown) => {
  console.error('Falha ao iniciar Turbo Real:', error);
  root.innerHTML = '<div class="boot-error"><strong>Falha ao iniciar os itens.</strong><span>Recarregue a página ou verifique o suporte a WebAssembly.</span></div>';
});
