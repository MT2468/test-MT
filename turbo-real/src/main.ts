import './styles.css';
import { GameApp } from './render/app/GameApp';
import { createInitialGameState } from './simulation/state';
import { createHud } from './ui/createHud';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Elemento #app não encontrado.');

const state = createInitialGameState();
const hud = createHud(document.body, state);
const game = new GameApp(root, state, (nextState) => hud.update(nextState));

game.start();

window.addEventListener(
  'beforeunload',
  () => {
    game.dispose();
    hud.dispose();
  },
  { once: true },
);
