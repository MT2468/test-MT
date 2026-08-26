export interface TrackPoint {
  readonly x: number;
  readonly z: number;
}

export interface TrackSpawn extends TrackPoint {
  readonly heading: number;
}

export interface TrackSample extends TrackPoint {
  readonly tangentX: number;
  readonly tangentZ: number;
  readonly rightX: number;
  readonly rightZ: number;
  readonly leftEdgeX: number;
  readonly leftEdgeZ: number;
  readonly rightEdgeX: number;
  readonly rightEdgeZ: number;
  readonly leftBarrierX: number;
  readonly leftBarrierZ: number;
  readonly rightBarrierX: number;
  readonly rightBarrierZ: number;
}

export interface TrackBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface TrackRaceConfig {
  readonly totalLaps: number;
  readonly checkpointSampleIndices: readonly number[];
}

export interface TrackDefinition {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly halfWidth: number;
  readonly barrierOffset: number;
  readonly samples: readonly TrackSample[];
  readonly spawn: TrackSpawn;
  readonly bounds: TrackBounds;
  readonly race: TrackRaceConfig;
}

const CONTROL_POINTS: readonly TrackPoint[] = [
  { x: -30, z: 72 },
  { x: 22, z: 72 },
  { x: 58, z: 55 },
  { x: 76, z: 20 },
  { x: 70, z: -18 },
  { x: 48, z: -52 },
  { x: 10, z: -70 },
  { x: -35, z: -66 },
  { x: -68, z: -42 },
  { x: -78, z: -5 },
  { x: -68, z: 34 },
  { x: -48, z: 60 },
];

const SAMPLES_PER_SEGMENT = 10;
const HALF_WIDTH = 8.4;
const BARRIER_OFFSET = 9.05;
const CHECKPOINT_COUNT = 6;
const TOTAL_LAPS = 3;

function catmullRom(p0: TrackPoint, p1: TrackPoint, p2: TrackPoint, p3: TrackPoint, t: number): TrackPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z:
      0.5 *
      (2 * p1.z +
        (-p0.z + p2.z) * t +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

function catmullRomTangent(
  p0: TrackPoint,
  p1: TrackPoint,
  p2: TrackPoint,
  p3: TrackPoint,
  t: number,
): TrackPoint {
  const t2 = t * t;
  const x =
    0.5 *
    ((-p0.x + p2.x) +
      2 * (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t +
      3 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t2);
  const z =
    0.5 *
    ((-p0.z + p2.z) +
      2 * (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t +
      3 * (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t2);
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

function buildSamples(): readonly TrackSample[] {
  const samples: TrackSample[] = [];
  const count = CONTROL_POINTS.length;

  for (let segment = 0; segment < count; segment += 1) {
    const p0 = CONTROL_POINTS[(segment - 1 + count) % count];
    const p1 = CONTROL_POINTS[segment];
    const p2 = CONTROL_POINTS[(segment + 1) % count];
    const p3 = CONTROL_POINTS[(segment + 2) % count];

    for (let step = 0; step < SAMPLES_PER_SEGMENT; step += 1) {
      const t = step / SAMPLES_PER_SEGMENT;
      const position = catmullRom(p0, p1, p2, p3, t);
      const tangent = catmullRomTangent(p0, p1, p2, p3, t);
      const rightX = -tangent.z;
      const rightZ = tangent.x;

      samples.push({
        x: position.x,
        z: position.z,
        tangentX: tangent.x,
        tangentZ: tangent.z,
        rightX,
        rightZ,
        leftEdgeX: position.x - rightX * HALF_WIDTH,
        leftEdgeZ: position.z - rightZ * HALF_WIDTH,
        rightEdgeX: position.x + rightX * HALF_WIDTH,
        rightEdgeZ: position.z + rightZ * HALF_WIDTH,
        leftBarrierX: position.x - rightX * BARRIER_OFFSET,
        leftBarrierZ: position.z - rightZ * BARRIER_OFFSET,
        rightBarrierX: position.x + rightX * BARRIER_OFFSET,
        rightBarrierZ: position.z + rightZ * BARRIER_OFFSET,
      });
    }
  }

  return samples;
}

function calculateBounds(samples: readonly TrackSample[]): TrackBounds {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const sample of samples) {
    minX = Math.min(minX, sample.leftBarrierX, sample.rightBarrierX);
    maxX = Math.max(maxX, sample.leftBarrierX, sample.rightBarrierX);
    minZ = Math.min(minZ, sample.leftBarrierZ, sample.rightBarrierZ);
    maxZ = Math.max(maxZ, sample.leftBarrierZ, sample.rightBarrierZ);
  }

  return { minX, maxX, minZ, maxZ };
}

function buildCheckpointIndices(sampleCount: number): readonly number[] {
  return Object.freeze(
    Array.from({ length: CHECKPOINT_COUNT }, (_, index) => Math.floor((index * sampleCount) / CHECKPOINT_COUNT)),
  );
}

const samples = buildSamples();
const start = samples[0];

export const FIRST_TRACK: TrackDefinition = Object.freeze({
  id: 'avenida-do-troco',
  name: 'Avenida do Troco',
  subtitle: 'Circuito urbano-futurista brasileiro',
  halfWidth: HALF_WIDTH,
  barrierOffset: BARRIER_OFFSET,
  samples,
  spawn: Object.freeze({
    x: start.x,
    z: start.z,
    heading: Math.atan2(start.tangentX, -start.tangentZ),
  }),
  bounds: Object.freeze(calculateBounds(samples)),
  race: Object.freeze({
    totalLaps: TOTAL_LAPS,
    checkpointSampleIndices: buildCheckpointIndices(samples.length),
  }),
});
