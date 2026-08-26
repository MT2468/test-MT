import './styles.css';
import { GameApp } from './render/app/GameApp';
import { initialGameState } from './simulation/state';
import { createHud } from './ui/createHud';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Elemento #app não encontrado.');

const game = new GameApp(root);
const disposeHud = createHud(document.body, initialGameState);

game.start();

window.addEventListener(
  'beforeunload',
  () => {
    game.dispose();
    disposeHud();
  },
  { once: true },
);
