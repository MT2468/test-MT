export type GameAction =
  | 'accelerate'
  | 'brake'
  | 'steer-left'
  | 'steer-right'
  | 'drift'
  | 'use-item'
  | 'save-reserve'
  | 'withdraw-reserve'
  | 'decision-1'
  | 'decision-2'
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
  KeyE: 'save-reserve',
  KeyQ: 'withdraw-reserve',
  Digit1: 'decision-1',
  Numpad1: 'decision-1',
  Digit2: 'decision-2',
  Numpad2: 'decision-2',
  Escape: 'pause',
});
