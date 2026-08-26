import type { AIDriverProfile } from './aiProfiles';
import { AI_DRIVER_PROFILES, getRivalGridPose } from './aiProfiles';
import { createInitialDecisionState, type DecisionState } from './decisions/types';
import { createInitialFinancialState, type FinancialState } from './finance/types';
import {
  createInitialItemWorld,
  createRacerItemState,
  type ItemWorldState,
  type RacerItemState,
} from './items/types';
import { createInitialRaceState, type RaceState } from './RaceController';
import type { TrackDefinition } from '../track/firstTrack';
import type { VehicleState } from './vehicle';

export interface RivalState {
  readonly id: string;
  readonly name: string;
  readonly profile: AIDriverProfile;
  race: RaceState;
  vehicle: VehicleState;
  items: RacerItemState;
}

export interface GameState {
  phase: 'racing' | 'decision' | 'finished';
  finance: FinancialState;
  decisions: DecisionState;
  race: RaceState;
  vehicle: VehicleState;
  items: RacerItemState;
  itemWorld: ItemWorldState;
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
      items: createRacerItemState(),
    };
  });

  return {
    phase: 'racing',
    finance: createInitialFinancialState(),
    decisions: createInitialDecisionState(),
    race: createInitialRaceState(track, totalRacers),
    vehicle: createVehicleState(track.spawn.x, track.spawn.z, track.spawn.heading),
    items: createRacerItemState(),
    itemWorld: createInitialItemWorld(track),
    rivals,
  };
}
