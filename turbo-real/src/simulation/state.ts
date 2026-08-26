import type { VehicleState } from './vehicle';

export interface GameState {
  phase: 'driving';
  balance: number;
  reserve: number;
  lap: 0;
  position: 1;
  vehicle: VehicleState;
}

export function createInitialGameState(): GameState {
  return {
    phase: 'driving',
    balance: 100,
    reserve: 0,
    lap: 0,
    position: 1,
    vehicle: {
      x: 0,
      z: 18,
      heading: 0,
      speed: 0,
      steering: 0,
      distanceTravelled: 0,
    },
  };
}
