import type { TrackDefinition } from '../../track/firstTrack';

export type ItemKind = 'turbo-solar' | 'escudo-prisma' | 'pulso-repulsor' | 'faixa-grudenta';

export interface ItemDefinition {
  readonly id: ItemKind;
  readonly name: string;
  readonly shortName: string;
  readonly icon: string;
}

export const ITEM_DEFINITIONS: Readonly<Record<ItemKind, ItemDefinition>> = Object.freeze({
  'turbo-solar': Object.freeze({ id: 'turbo-solar', name: 'Turbo Solar', shortName: 'TURBO', icon: '☀' }),
  'escudo-prisma': Object.freeze({ id: 'escudo-prisma', name: 'Escudo Prisma', shortName: 'ESCUDO', icon: '◇' }),
  'pulso-repulsor': Object.freeze({ id: 'pulso-repulsor', name: 'Pulso Repulsor', shortName: 'PULSO', icon: '◎' }),
  'faixa-grudenta': Object.freeze({ id: 'faixa-grudenta', name: 'Faixa Grudenta', shortName: 'FAIXA', icon: '▰' }),
});

export interface RacerItemState {
  inventory: ItemKind | null;
  inventoryAgeSeconds: number;
  shieldRemaining: number;
  slowRemaining: number;
  hitFlashSeconds: number;
}

export interface ItemBoxState {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  respawnRemaining: number;
}

export interface StickyHazardState {
  readonly id: string;
  readonly ownerId: string;
  readonly x: number;
  readonly z: number;
  lifetimeRemaining: number;
}

export interface ItemWorldState {
  boxes: ItemBoxState[];
  hazards: StickyHazardState[];
  nextHazardId: number;
}

export interface ItemPhysicsBridge {
  applyItemImpulse(racerId: string, impulseX: number, impulseZ: number): void;
  scaleRacerSpeed(racerId: string, factor: number): void;
}

export function createRacerItemState(): RacerItemState {
  return {
    inventory: null,
    inventoryAgeSeconds: 0,
    shieldRemaining: 0,
    slowRemaining: 0,
    hitFlashSeconds: 0,
  };
}

export function createInitialItemWorld(track: TrackDefinition): ItemWorldState {
  const boxes: ItemBoxState[] = [];
  for (const sampleIndex of track.items.boxSampleIndices) {
    const sample = track.samples[sampleIndex % track.samples.length];
    for (const laneOffset of track.items.laneOffsets) {
      boxes.push({
        id: `box-${sampleIndex}-${laneOffset}`,
        x: sample.x + sample.rightX * laneOffset,
        z: sample.z + sample.rightZ * laneOffset,
        respawnRemaining: 0,
      });
    }
  }
  return { boxes, hazards: [], nextHazardId: 1 };
}

export function getItemDefinition(kind: ItemKind | null): ItemDefinition | null {
  return kind === null ? null : ITEM_DEFINITIONS[kind];
}
