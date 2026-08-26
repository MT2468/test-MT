import type { AIDriverProfile } from './aiProfiles';
import { AI_DRIVER_PROFILES, getRivalGridPose } from './aiProfiles';
import { createInitialRaceState, type RaceState } from './RaceController';
import type { TrackDefinition } from '../track/firstTrack';
import type { VehicleState } from './vehicle';

export interface RivalState {
  readonly id: string;
  readonly name: string;
  readonly profile: AIDriverProfile;
  race: RaceState;
  vehicle: VehicleState;
}

export interface GameState {
  phase: 'racing' | 'finished';
  balance: number;
  reserve: number;
  race: RaceState;
  vehicle: VehicleState;
  rivals: RivalState[];
}

function createVehicleState(x: number, z: number, heading: number): VehicleState {
  return {
    x,
    y: 0,
    z,
    heading,
    speed: 0,
    lateralSpeed: 0,
    steering: 0,
    distanceTravelled: 0,
    drifting: false,
    driftCharge: 0,
    boostRemaining: 0,
    impactStrength: 0,
  };
}

export function createInitialGameState(track: TrackDefinition): GameState {
  const totalRacers = AI_DRIVER_PROFILES.length + 1;
  const rivals: RivalState[] = AI_DRIVER_PROFILES.map((profile, index) => {
    const pose = getRivalGridPose(track, index);
    return {
      id: profile.id,
      name: profile.name,
      profile,
      race: createInitialRaceState(track, totalRacers),
      vehicle: createVehicleState(pose.x, pose.z, pose.heading),
    };
  });

  return {
    phase: 'racing',
    balance: 100,
    reserve: 0,
    race: createInitialRaceState(track, totalRacers),
    vehicle: createVehicleState(track.spawn.x, track.spawn.z, track.spawn.heading),
    rivals,
  };
}
