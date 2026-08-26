import type { TrackDefinition } from '../track/firstTrack';

export interface TrackBalanceAnalysis {
  readonly lengthMeters: number;
  readonly averageCurvature: number;
  readonly maxCurvature: number;
  readonly technicality: number;
  readonly aiPaceScale: number;
  readonly aiLookaheadScale: number;
  readonly projectedRaceIncome: number;
  readonly projectedRaceCosts: number;
  readonly economyPressure: number;
  readonly warnings: readonly string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tangentAngle(ax: number, az: number, bx: number, bz: number): number {
  const dot = clamp(ax * bx + az * bz, -1, 1);
  return Math.acos(dot);
}

export function analyzeTrackBalance(track: TrackDefinition): TrackBalanceAnalysis {
  let lengthMeters = 0;
  let curvatureTotal = 0;
  let maxCurvature = 0;

  for (let index = 0; index < track.samples.length; index += 1) {
    const current = track.samples[index];
    const next = track.samples[(index + 1) % track.samples.length];
    lengthMeters += Math.hypot(next.x - current.x, next.z - current.z);
    const curvature = tangentAngle(current.tangentX, current.tangentZ, next.tangentX, next.tangentZ);
    curvatureTotal += curvature;
    maxCurvature = Math.max(maxCurvature, curvature);
  }

  const averageCurvature = curvatureTotal / Math.max(1, track.samples.length);
  const widthPenalty = clamp((8.6 - track.halfWidth) / 2.4, 0, 1);
  const curvatureScore = clamp(averageCurvature / 0.075, 0, 1);
  const peakScore = clamp(maxCurvature / 0.24, 0, 1);
  const technicality = clamp(curvatureScore * 0.5 + peakScore * 0.3 + widthPenalty * 0.2, 0, 1);

  const intendedDifficulty = clamp((track.content.cupOrder - 1) / 3, 0, 1);
  const aiPaceScale = clamp(0.955 + intendedDifficulty * 0.055 - technicality * 0.025, 0.93, 1.015);
  const aiLookaheadScale = 1 + technicality * 0.18;

  const paidCheckpointsPerLap = Math.max(0, track.race.checkpointSampleIndices.length - 1);
  const projectedRaceIncome = paidCheckpointsPerLap * track.race.totalLaps * track.economy.checkpointIncome;
  const projectedRaceCosts = track.race.totalLaps * track.economy.lapOperatingCost + track.economy.emergencyCost;
  const economyPressure = projectedRaceCosts / Math.max(1, projectedRaceIncome);

  const warnings: string[] = [];
  if (track.samples.length < 80) warnings.push('Poucas amostras de pista para IA/colisores.');
  if (track.halfWidth < 7.4) warnings.push('Pista muito estreita para um grid de oito karts.');
  if (maxCurvature > 0.3) warnings.push('Pico de curvatura muito alto; revisar barreiras e linha da IA.');
  if (economyPressure > 1.35) warnings.push('Custos-base superam fortemente a renda-base da corrida.');
  if (economyPressure < 0.55) warnings.push('Economia pode estar permissiva demais antes das decisões.');

  return Object.freeze({
    lengthMeters,
    averageCurvature,
    maxCurvature,
    technicality,
    aiPaceScale,
    aiLookaheadScale,
    projectedRaceIncome,
    projectedRaceCosts,
    economyPressure,
    warnings: Object.freeze(warnings),
  });
}

export function auditTrackCatalog(tracks: readonly TrackDefinition[]): readonly string[] {
  const warnings: string[] = [];
  const ids = new Set<string>();

  for (const track of tracks) {
    if (ids.has(track.id)) warnings.push(`ID de pista duplicado: ${track.id}`);
    ids.add(track.id);
    if (track.race.checkpointSampleIndices.length < 3) warnings.push(`${track.name}: poucos checkpoints.`);
    if (track.items.boxSampleIndices.length < 3) warnings.push(`${track.name}: poucas fileiras de itens.`);
    for (const warning of analyzeTrackBalance(track).warnings) warnings.push(`${track.name}: ${warning}`);
  }

  return Object.freeze(warnings);
}
