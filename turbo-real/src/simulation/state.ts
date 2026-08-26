import { createInitialRaceState, type RaceState } from './RaceController';
import type { TrackDefinition } from '../track/firstTrack';
import type { VehicleState } from './vehicle';

export interface GameState {
  phase: 'racing' | 'finished';
  balance: number;
  reserve: number;
  race: RaceState;
  vehicle: VehicleState;
}

export function createInitialGameState(track: TrackDefinition): GameState {
  const spawn = track.spawn;
  return {
    phase: 'racing',
    balance: 100,
    reserve: 0,
    race: createInitialRaceState(track),
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
