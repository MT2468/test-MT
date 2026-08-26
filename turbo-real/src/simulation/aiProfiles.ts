import type { TrackDefinition } from '../track/firstTrack';

export interface AIDriverProfile {
  readonly id: string;
  readonly name: string;
  readonly bodyColor: number;
  readonly accentColor: number;
  readonly pace: number;
  readonly cornerDiscipline: number;
  readonly driftSkill: number;
  readonly laneBias: number;
  readonly avoidance: number;
}

export const AI_DRIVER_PROFILES: readonly AIDriverProfile[] = Object.freeze([
  { id: 'bia-vector', name: 'Bia Vector', bodyColor: 0xff5d73, accentColor: 0xffd166, pace: 0.93, cornerDiscipline: 0.86, driftSkill: 0.68, laneBias: -1.25, avoidance: 2.0 },
  { id: 'caio-giro', name: 'Caio Giro', bodyColor: 0x4cc9f0, accentColor: 0x0b6e99, pace: 0.98, cornerDiscipline: 0.72, driftSkill: 0.78, laneBias: 1.1, avoidance: 1.7 },
  { id: 'luna-prisma', name: 'Luna Prisma', bodyColor: 0x9b5de5, accentColor: 0xf15bb5, pace: 0.95, cornerDiscipline: 0.94, driftSkill: 0.55, laneBias: -0.45, avoidance: 2.4 },
  { id: 'nando-faisca', name: 'Nando Faísca', bodyColor: 0xff9f1c, accentColor: 0xe71d36, pace: 0.96, cornerDiscipline: 0.76, driftSkill: 0.94, laneBias: 0.65, avoidance: 1.8 },
  { id: 'teo-pulso', name: 'Téo Pulso', bodyColor: 0x2ec4b6, accentColor: 0xcbf3f0, pace: 0.91, cornerDiscipline: 0.9, driftSkill: 0.48, laneBias: 1.55, avoidance: 2.6 },
  { id: 'maya-fluxo', name: 'Maya Fluxo', bodyColor: 0x4361ee, accentColor: 0x90e0ef, pace: 0.94, cornerDiscipline: 0.88, driftSkill: 0.62, laneBias: -1.7, avoidance: 2.9 },
  { id: 'rafa-vento', name: 'Rafa Vento', bodyColor: 0xef476f, accentColor: 0x06d6a0, pace: 1.0, cornerDiscipline: 0.7, driftSkill: 0.82, laneBias: 0.15, avoidance: 1.6 },
]);

export interface GridPose {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

export function getRivalGridPose(track: TrackDefinition, rivalIndex: number): GridPose {
  const start = track.samples[0];
  const row = Math.floor(rivalIndex / 2) + 1;
  const side = rivalIndex % 2 === 0 ? -1 : 1;
  const across = side * (2.35 + (row % 2) * 0.22);
  const along = -3.25 * row;

  return {
    x: start.x + start.rightX * across + start.tangentX * along,
    z: start.z + start.rightZ * across + start.tangentZ * along,
    heading: track.spawn.heading,
  };
}
