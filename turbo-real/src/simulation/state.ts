import type { VehicleState } from './vehicle';

export interface SpawnPose {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

export interface GameState {
  phase: 'driving';
  balance: number;
  reserve: number;
  lap: 0;
  position: 1;
  vehicle: VehicleState;
}

const DEFAULT_SPAWN: SpawnPose = Object.freeze({ x: 0, z: 18, heading: 0 });

export function createInitialGameState(spawn: SpawnPose = DEFAULT_SPAWN): GameState {
  return {
    phase: 'driving',
    balance: 100,
    reserve: 0,
    lap: 0,
    position: 1,
    vehicle: {
      x: spawn.x,
      y: 0,
      z: spawn.z,
      heading: spawn.heading,
      speed: 0,
      lateralSpeed: 0,
      steering: 0,
      distanceTravelled: 0,
      drifting: false,
      driftCharge: 0,
      boostRemaining: 0,
      impactStrength: 0,
    },
  };
}
