import './styles.css';
import { KartPhysics } from './physics/KartPhysics';
import { GameApp } from './render/app/GameApp';
import { createInitialGameState } from './simulation/state';
import { createHud } from './ui/createHud';

async function bootstrap(root: HTMLElement): Promise<void> {
  const state = createInitialGameState();
  const hud = createHud(document.body, state);
  const physics = await KartPhysics.create(state.vehicle);
  const game = new GameApp(root, state, physics, (nextState) => hud.update(nextState));

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
  root.innerHTML = '<div class="boot-error"><strong>Falha ao iniciar a física.</strong><span>Recarregue a página ou verifique o suporte a WebAssembly.</span></div>';
});
