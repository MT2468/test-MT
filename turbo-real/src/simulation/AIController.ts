import type { TrackDefinition, TrackSample } from '../track/firstTrack';
import { rankRaceStandings, RaceController, type RaceState } from './RaceController';
import type { RivalState } from './state';
import { VEHICLE_TUNING, type DrivingInput, type VehicleState } from './vehicle';

const ZERO_INPUT: DrivingInput = Object.freeze({ throttle: 0, steer: 0, drift: false });

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
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

function curveSeverity(track: TrackDefinition, sampleIndex: number, lookahead: number): number {
  const current = track.samples[sampleIndex];
  const ahead = track.samples[(sampleIndex + lookahead) % track.samples.length];
  const dot = clamp(current.tangentX * ahead.tangentX + current.tangentZ * ahead.tangentZ, -1, 1);
  return clamp((1 - dot) * 6.5, 0, 1);
}

function lateralCoordinate(sample: TrackSample, x: number, z: number): number {
  const dx = x - sample.x;
  const dz = z - sample.z;
  return dx * sample.rightX + dz * sample.rightZ;
}

export type RivalInputMap = Readonly<Record<string, DrivingInput>>;

export class AIFleetController {
  private readonly raceControllers = new Map<string, RaceController>();

  constructor(
    private readonly track: TrackDefinition,
    private readonly rivals: readonly RivalState[],
  ) {
    for (const rival of rivals) {
      this.raceControllers.set(rival.id, new RaceController(track, rival.race, rival.vehicle));
    }
  }

  readInputs(player: VehicleState): RivalInputMap {
    const inputs: Record<string, DrivingInput> = {};
    const traffic: readonly VehicleState[] = [player, ...this.rivals.map((rival) => rival.vehicle)];

    for (const rival of this.rivals) {
      if (rival.race.finished) {
        inputs[rival.id] = ZERO_INPUT;
        continue;
      }

      const vehicle = rival.vehicle;
      const nearestIndex = nearestSampleIndex(this.track, vehicle.x, vehicle.z);
      const nearest = this.track.samples[nearestIndex];
      const speed = Math.max(0, vehicle.speed);
      const lookahead = 5 + Math.round(clamp(speed / 4.5, 0, 5));
      const severity = curveSeverity(this.track, nearestIndex, lookahead + 3);

      let laneTarget = rival.profile.laneBias;
      let trafficFactor = 1;
      const currentAcross = lateralCoordinate(nearest, vehicle.x, vehicle.z);
      const farFromCenter = Math.abs(currentAcross) > this.track.halfWidth * 0.7;

      for (const other of traffic) {
        if (other === vehicle) continue;
        const dx = other.x - vehicle.x;
        const dz = other.z - vehicle.z;
        const along = dx * nearest.tangentX + dz * nearest.tangentZ;
        const across = dx * nearest.rightX + dz * nearest.rightZ;
        if (along > 0.4 && along < 8.5 && Math.abs(across) < 2.7) {
          laneTarget += across >= 0 ? -rival.profile.avoidance : rival.profile.avoidance;
          trafficFactor = Math.min(trafficFactor, 0.76 + along * 0.018);
        }
      }

      if (farFromCenter) laneTarget = 0;
      const laneLimit = Math.max(0, this.track.halfWidth - 2.1);
      laneTarget = clamp(laneTarget, -laneLimit, laneLimit);

      const targetIndex = (nearestIndex + lookahead) % this.track.samples.length;
      const target = this.track.samples[targetIndex];
      const targetX = target.x + target.rightX * laneTarget;
      const targetZ = target.z + target.rightZ * laneTarget;
      const dx = targetX - vehicle.x;
      const dz = targetZ - vehicle.z;
      const desiredHeading = Math.atan2(dx, -dz);
      const headingError = wrapAngle(desiredHeading - vehicle.heading);
      const steer = clamp(headingError / (0.5 + severity * 0.12), -1, 1);

      const curvePenalty = severity * (0.36 + rival.profile.cornerDiscipline * 0.2);
      let targetSpeed = VEHICLE_TUNING.maxForwardSpeed * rival.profile.pace * (1 - curvePenalty);
      targetSpeed *= trafficFactor;
      if (farFromCenter) targetSpeed = Math.min(targetSpeed, 11.5);
      targetSpeed = Math.max(8.5, targetSpeed);

      const throttle = speed < targetSpeed - 0.6 ? 1 : speed > targetSpeed + 1.1 ? -1 : 0;
      const driftThreshold = 0.31 - rival.profile.driftSkill * 0.13;
      const drift =
        severity > driftThreshold &&
        rival.profile.driftSkill > 0.45 &&
        Math.abs(steer) > 0.28 &&
        speed > VEHICLE_TUNING.minimumDriftSpeed;

      inputs[rival.id] = { throttle, steer, drift };
    }

    return inputs;
  }

  advanceRace(deltaSeconds: number, playerRace: RaceState): void {
    for (const rival of this.rivals) {
      this.raceControllers.get(rival.id)?.advance(deltaSeconds, rival.vehicle);
    }

    const standings = rankRaceStandings([
      {
        id: 'player',
        progress: playerRace.progress,
        finished: playerRace.finished,
        finishTimeSeconds: playerRace.finished ? playerRace.raceTimeSeconds : null,
      },
      ...this.rivals.map((rival) => ({
        id: rival.id,
        progress: rival.race.progress,
        finished: rival.race.finished,
        finishTimeSeconds: rival.race.finished ? rival.race.raceTimeSeconds : null,
      })),
    ]);

    for (const standing of standings) {
      if (standing.id === 'player') {
        playerRace.position = standing.position;
        continue;
      }
      const rival = this.rivals.find((entry) => entry.id === standing.id);
      if (rival) rival.race.position = standing.position;
    }
  }
}
