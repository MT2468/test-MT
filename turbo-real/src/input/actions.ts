export type GameAction =
  | 'accelerate'
  | 'brake'
  | 'steer-left'
  | 'steer-right'
  | 'drift'
  | 'use-item'
  | 'pause';

export const keyboardBindings: Readonly<Record<string, GameAction>> = Object.freeze({
  KeyW: 'accelerate',
  ArrowUp: 'accelerate',
  KeyS: 'brake',
  ArrowDown: 'brake',
  KeyA: 'steer-left',
  ArrowLeft: 'steer-left',
  KeyD: 'steer-right',
  ArrowRight: 'steer-right',
  ShiftLeft: 'drift',
  ShiftRight: 'drift',
  Space: 'use-item',
  Escape: 'pause',
});
