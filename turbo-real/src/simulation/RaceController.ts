import type { TrackDefinition, TrackSample } from '../track/firstTrack';
import type { VehicleState } from './vehicle';

const WRONG_WAY_SPEED = 3;
const WRONG_WAY_DOT = -0.38;
const RIGHT_WAY_DOT = 0.12;
const WRONG_WAY_CONFIRM_SECONDS = 0.6;
const RIGHT_WAY_CONFIRM_SECONDS = 0.35;

export interface RaceState {
  lap: number;
  totalLaps: number;
  completedLaps: number;
  nextCheckpoint: number;
  checkpointsPassed: number;
  checkpointCount: number;
  position: number;
  totalRacers: number;
  wrongWay: boolean;
  finished: boolean;
  raceTimeSeconds: number;
  lapTimeSeconds: number;
  lastLapTimeSeconds: number | null;
  bestLapTimeSeconds: number | null;
  progress: number;
}

export interface RaceStandingInput {
  readonly id: string;
  readonly progress: number;
  readonly finished: boolean;
  readonly finishTimeSeconds: number | null;
}

export interface RaceStanding {
  readonly id: string;
  readonly position: number;
}

export function createInitialRaceState(track: TrackDefinition): RaceState {
  const checkpointCount = track.race.checkpointSampleIndices.length;
  return {
    lap: 1,
    totalLaps: track.race.totalLaps,
    completedLaps: 0,
    nextCheckpoint: checkpointCount > 1 ? 1 : 0,
    checkpointsPassed: 0,
    checkpointCount,
    position: 1,
    totalRacers: 1,
    wrongWay: false,
    finished: false,
    raceTimeSeconds: 0,
    lapTimeSeconds: 0,
    lastLapTimeSeconds: null,
    bestLapTimeSeconds: null,
    progress: 0,
  };
}

export function rankRaceStandings(entries: readonly RaceStandingInput[]): readonly RaceStanding[] {
  return [...entries]
    .sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) {
        return (a.finishTimeSeconds ?? Number.POSITIVE_INFINITY) - (b.finishTimeSeconds ?? Number.POSITIVE_INFINITY);
      }
      return b.progress - a.progress;
    })
    .map((entry, index) => ({ id: entry.id, position: index + 1 }));
}

function nearestSampleIndex(track: TrackDefinition, x: number, z: number): number {
  let bestIndex = 0;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;

  for (let index = 0; index < track.samples.length; index += 1) {
    const sample = track.samples[index];
    const dx = x - sample.x;
    const dz = z - sample.z;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function signedCoordinates(sample: TrackSample, x: number, z: number): { along: number; across: number } {
  const dx = x - sample.x;
  const dz = z - sample.z;
  return {
    along: dx * sample.tangentX + dz * sample.tangentZ,
    across: dx * sample.rightX + dz * sample.rightZ,
  };
}

function calculateLegalProgress(track: TrackDefinition, state: RaceState, nearestIndex: number): number {
  if (state.finished) return state.totalLaps;

  const checkpoints = track.race.checkpointSampleIndices;
  const sampleCount = track.samples.length;
  const nextListIndex = state.nextCheckpoint;
  const previousListIndex = nextListIndex === 0 ? checkpoints.length - 1 : nextListIndex - 1;
  const startSample = checkpoints[previousListIndex];
  const endSample = checkpoints[nextListIndex];
  const span = (endSample - startSample + sampleCount) % sampleCount || sampleCount;
  const offset = (nearestIndex - startSample + sampleCount) % sampleCount;
  const localProgress = Math.max(0, Math.min(offset / span, 1));
  const completedSectors = nextListIndex === 0 ? checkpoints.length - 1 : nextListIndex - 1;
  const lapProgress = (completedSectors + localProgress) / checkpoints.length;
  return state.completedLaps + lapProgress;
}

export class RaceController {
  private previousX: number;
  private previousZ: number;
  private wrongWaySeconds = 0;
  private rightWaySeconds = 0;

  constructor(
    private readonly track: TrackDefinition,
    private readonly state: RaceState,
    vehicle: VehicleState,
  ) {
    this.previousX = vehicle.x;
    this.previousZ = vehicle.z;
  }

  advance(deltaSeconds: number, vehicle: VehicleState): void {
    const dt = Math.min(Math.max(deltaSeconds, 0), 0.1);
    const nearestIndex = nearestSampleIndex(this.track, vehicle.x, vehicle.z);

    if (!this.state.finished) {
      this.state.raceTimeSeconds += dt;
      this.state.lapTimeSeconds += dt;
      this.updateWrongWay(dt, vehicle, nearestIndex);
      this.processExpectedCheckpoint(vehicle);
    }

    this.state.progress = calculateLegalProgress(this.track, this.state, nearestIndex);
    this.previousX = vehicle.x;
    this.previousZ = vehicle.z;
  }

  private processExpectedCheckpoint(vehicle: VehicleState): void {
    const checkpoints = this.track.race.checkpointSampleIndices;
    const expectedListIndex = this.state.nextCheckpoint;
    const sample = this.track.samples[checkpoints[expectedListIndex]];
    if (!this.crossedGateForward(sample, vehicle.x, vehicle.z)) return;

    if (expectedListIndex === 0) {
      this.completeLap();
      return;
    }

    this.state.checkpointsPassed = expectedListIndex;
    this.state.nextCheckpoint = expectedListIndex + 1 < checkpoints.length ? expectedListIndex + 1 : 0;
  }

  private crossedGateForward(sample: TrackSample, currentX: number, currentZ: number): boolean {
    const previous = signedCoordinates(sample, this.previousX, this.previousZ);
    const current = signedCoordinates(sample, currentX, currentZ);
    const motionX = currentX - this.previousX;
    const motionZ = currentZ - this.previousZ;
    const forwardTravel = motionX * sample.tangentX + motionZ * sample.tangentZ;
    const gateHalfWidth = this.track.halfWidth + 0.8;

    return (
      previous.along <= 0 &&
      current.along > 0 &&
      forwardTravel > 0.01 &&
      Math.abs(current.across) <= gateHalfWidth
    );
  }

  private completeLap(): void {
    const lapTime = this.state.lapTimeSeconds;
    this.state.lastLapTimeSeconds = lapTime;
    this.state.bestLapTimeSeconds =
      this.state.bestLapTimeSeconds === null ? lapTime : Math.min(this.state.bestLapTimeSeconds, lapTime);
    this.state.completedLaps += 1;
    this.state.checkpointsPassed = 0;
    this.state.lapTimeSeconds = 0;

    if (this.state.completedLaps >= this.state.totalLaps) {
      this.state.finished = true;
      this.state.lap = this.state.totalLaps;
      this.state.nextCheckpoint = 0;
      this.state.wrongWay = false;
      return;
    }

    this.state.lap = this.state.completedLaps + 1;
    this.state.nextCheckpoint = this.state.checkpointCount > 1 ? 1 : 0;
  }

  private updateWrongWay(deltaSeconds: number, vehicle: VehicleState, nearestIndex: number): void {
    const dx = vehicle.x - this.previousX;
    const dz = vehicle.z - this.previousZ;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.025 || Math.abs(vehicle.speed) < WRONG_WAY_SPEED) return;

    const sample = this.track.samples[nearestIndex];
    const dot = (dx / distance) * sample.tangentX + (dz / distance) * sample.tangentZ;

    if (dot < WRONG_WAY_DOT) {
      this.wrongWaySeconds += deltaSeconds;
      this.rightWaySeconds = 0;
      if (this.wrongWaySeconds >= WRONG_WAY_CONFIRM_SECONDS) this.state.wrongWay = true;
      return;
    }

    if (dot > RIGHT_WAY_DOT) {
      this.rightWaySeconds += deltaSeconds;
      this.wrongWaySeconds = Math.max(0, this.wrongWaySeconds - deltaSeconds * 1.5);
      if (this.rightWaySeconds >= RIGHT_WAY_CONFIRM_SECONDS) {
        this.state.wrongWay = false;
        this.wrongWaySeconds = 0;
      }
    }
  }
}
