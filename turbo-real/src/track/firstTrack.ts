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

export interface TrackItemConfig {
  readonly boxSampleIndices: readonly number[];
  readonly laneOffsets: readonly number[];
}

export type TrackTheme = 'urban' | 'market' | 'budget' | 'month-end';

export interface TrackVisualConfig {
  readonly theme: TrackTheme;
  readonly skyColor: number;
  readonly fogColor: number;
  readonly groundColor: number;
  readonly curbPrimary: number;
  readonly curbSecondary: number;
  readonly barrierColor: number;
  readonly accentColor: number;
  readonly ambientSkyColor: number;
  readonly ambientGroundColor: number;
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly exposure: number;
}

export interface TrackEconomyConfig {
  readonly checkpointIncome: number;
  readonly lapOperatingCost: number;
  readonly emergencyCost: number;
  readonly emergencyLabel: string;
  readonly debtInterestRate: number;
}

export interface TrackContentConfig {
  readonly cupId: string;
  readonly cupName: string;
  readonly cupOrder: number;
  readonly difficulty: 'Fácil' | 'Médio' | 'Difícil';
  readonly concept: string;
  readonly financialHook: string;
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
  readonly items: TrackItemConfig;
  readonly visuals: TrackVisualConfig;
  readonly economy: TrackEconomyConfig;
  readonly content: TrackContentConfig;
}

export interface TrackBlueprint {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly controlPoints: readonly TrackPoint[];
  readonly halfWidth?: number;
  readonly barrierOffset?: number;
  readonly totalLaps?: number;
  readonly checkpointCount?: number;
  readonly itemBoxRowCount?: number;
  readonly laneOffsets?: readonly number[];
  readonly visuals: TrackVisualConfig;
  readonly economy: TrackEconomyConfig;
  readonly content: TrackContentConfig;
}

const SAMPLES_PER_SEGMENT = 10;

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

function buildSamples(
  controlPoints: readonly TrackPoint[],
  halfWidth: number,
  barrierOffset: number,
): readonly TrackSample[] {
  const samples: TrackSample[] = [];
  const count = controlPoints.length;

  for (let segment = 0; segment < count; segment += 1) {
    const p0 = controlPoints[(segment - 1 + count) % count];
    const p1 = controlPoints[segment];
    const p2 = controlPoints[(segment + 1) % count];
    const p3 = controlPoints[(segment + 2) % count];

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
        leftEdgeX: position.x - rightX * halfWidth,
        leftEdgeZ: position.z - rightZ * halfWidth,
        rightEdgeX: position.x + rightX * halfWidth,
        rightEdgeZ: position.z + rightZ * halfWidth,
        leftBarrierX: position.x - rightX * barrierOffset,
        leftBarrierZ: position.z - rightZ * barrierOffset,
        rightBarrierX: position.x + rightX * barrierOffset,
        rightBarrierZ: position.z + rightZ * barrierOffset,
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

function buildCheckpointIndices(sampleCount: number, checkpointCount: number): readonly number[] {
  return Object.freeze(
    Array.from({ length: checkpointCount }, (_, index) => Math.floor((index * sampleCount) / checkpointCount)),
  );
}

function buildItemBoxIndices(sampleCount: number, rowCount: number): readonly number[] {
  return Object.freeze(
    Array.from(
      { length: rowCount },
      (_, index) => Math.floor(((index + 0.62) * sampleCount) / rowCount) % sampleCount,
    ),
  );
}

export function createTrackDefinition(blueprint: TrackBlueprint): TrackDefinition {
  const halfWidth = blueprint.halfWidth ?? 8.4;
  const barrierOffset = blueprint.barrierOffset ?? halfWidth + 0.65;
  const totalLaps = blueprint.totalLaps ?? 3;
  const checkpointCount = blueprint.checkpointCount ?? 6;
  const itemBoxRowCount = blueprint.itemBoxRowCount ?? 5;
  const laneOffsets = blueprint.laneOffsets ?? [-3.1, 0, 3.1];
  const samples = buildSamples(blueprint.controlPoints, halfWidth, barrierOffset);
  const start = samples[0];

  return Object.freeze({
    id: blueprint.id,
    name: blueprint.name,
    subtitle: blueprint.subtitle,
    halfWidth,
    barrierOffset,
    samples,
    spawn: Object.freeze({
      x: start.x,
      z: start.z,
      heading: Math.atan2(start.tangentX, -start.tangentZ),
    }),
    bounds: Object.freeze(calculateBounds(samples)),
    race: Object.freeze({
      totalLaps,
      checkpointSampleIndices: buildCheckpointIndices(samples.length, checkpointCount),
    }),
    items: Object.freeze({
      boxSampleIndices: buildItemBoxIndices(samples.length, itemBoxRowCount),
      laneOffsets: Object.freeze([...laneOffsets]),
    }),
    visuals: Object.freeze({ ...blueprint.visuals }),
    economy: Object.freeze({ ...blueprint.economy }),
    content: Object.freeze({ ...blueprint.content }),
  });
}

const AVENIDA_POINTS: readonly TrackPoint[] = [
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

export const FIRST_TRACK: TrackDefinition = createTrackDefinition({
  id: 'avenida-do-troco',
  name: 'Avenida do Troco',
  subtitle: 'Circuito urbano-futurista brasileiro',
  controlPoints: AVENIDA_POINTS,
  visuals: {
    theme: 'urban',
    skyColor: 0x84d2fb,
    fogColor: 0x84d2fb,
    groundColor: 0x237b45,
    curbPrimary: 0x1ba65a,
    curbSecondary: 0xf7c948,
    barrierColor: 0xe9edf0,
    accentColor: 0xf7c948,
    ambientSkyColor: 0xf0fbff,
    ambientGroundColor: 0x16482a,
    sunColor: 0xffffff,
    sunIntensity: 3.15,
    exposure: 1.08,
  },
  economy: {
    checkpointIncome: 6,
    lapOperatingCost: 18,
    emergencyCost: 45,
    emergencyLabel: 'Reparo inesperado',
    debtInterestRate: 0.05,
  },
  content: {
    cupId: 'primeiro-salario',
    cupName: 'Copa Primeiro Salário',
    cupOrder: 1,
    difficulty: 'Fácil',
    concept: 'Troco, caixa e reserva',
    financialHook: 'Equilíbrio básico entre dinheiro disponível e proteção.',
  },
});
