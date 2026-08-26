export interface GameState {
  readonly phase: 'boot';
  readonly balance: number;
  readonly reserve: number;
  readonly lap: 0;
  readonly position: 1;
}

export const initialGameState: GameState = Object.freeze({
  phase: 'boot',
  balance: 100,
  reserve: 0,
  lap: 0,
  position: 1,
});
