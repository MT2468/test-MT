import type { TrackDefinition } from '../../track/firstTrack';
import type { GameState, RivalState } from '../state';
import type { RaceState } from '../RaceController';
import type { VehicleState } from '../vehicle';
import { type ItemKind, type ItemPhysicsBridge, type RacerItemState } from './types';

const BOX_RESPAWN_SECONDS = 4.8;
const PICKUP_RADIUS_SQUARED = 2.15 * 2.15;
const HAZARD_RADIUS_SQUARED = 1.65 * 1.65;
const HAZARD_LIFETIME_SECONDS = 11;
const PULSE_RADIUS = 10.5;

interface RacerRef {
  readonly id: string;
  readonly vehicle: VehicleState;
  readonly race: RaceState;
  readonly items: RacerItemState;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function chooseWeightedItem(position: number, totalRacers: number, random = Math.random): ItemKind {
  const denominator = Math.max(1, totalRacers - 1);
  const catchup = clamp((position - 1) / denominator, 0, 1);
  const weighted: ReadonlyArray<readonly [ItemKind, number]> = [
    ['turbo-solar', 20 + catchup * 38],
    ['escudo-prisma', 34 - catchup * 15],
    ['pulso-repulsor', 18 + catchup * 24],
    ['faixa-grudenta', 28 - catchup * 14],
  ];
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [kind, weight] of weighted) {
    roll -= weight;
    if (roll <= 0) return kind;
  }
  return weighted[weighted.length - 1][0];
}

export class ItemController {
  constructor(
    private readonly track: TrackDefinition,
    private readonly state: GameState,
  ) {}

  advance(deltaSeconds: number, playerUseRequested: boolean, physics: ItemPhysicsBridge): void {
    if (this.track.samples.length === 0) return;
    const dt = Math.min(Math.max(deltaSeconds, 0), 0.1);
    const racers = this.getRacers();
    this.updateTimers(dt, racers);
    this.updateBoxes(dt, racers);
    this.updateHazards(dt, racers, physics);

    if (playerUseRequested && !this.state.race.finished) {
      const player = racers[0];
      this.useHeldItem(player, racers, physics);
    }

    for (const rival of this.state.rivals) {
      if (rival.race.finished || rival.items.inventory === null || rival.items.inventoryAgeSeconds < 0.7) continue;
      const racer = this.rivalRef(rival);
      if (this.shouldAIUseItem(racer, racers)) this.useHeldItem(racer, racers, physics);
    }
  }

  private getRacers(): RacerRef[] {
    return [
      { id: 'player', vehicle: this.state.vehicle, race: this.state.race, items: this.state.items },
      ...this.state.rivals.map((rival) => this.rivalRef(rival)),
    ];
  }

  private rivalRef(rival: RivalState): RacerRef {
    return { id: rival.id, vehicle: rival.vehicle, race: rival.race, items: rival.items };
  }

  private updateTimers(dt: number, racers: readonly RacerRef[]): void {
    for (const racer of racers) {
      const items = racer.items;
      if (items.inventory !== null) items.inventoryAgeSeconds += dt;
      else items.inventoryAgeSeconds = 0;
      items.shieldRemaining = Math.max(0, items.shieldRemaining - dt);
      items.slowRemaining = Math.max(0, items.slowRemaining - dt);
      items.hitFlashSeconds = Math.max(0, items.hitFlashSeconds - dt);
    }
  }

  private updateBoxes(dt: number, racers: readonly RacerRef[]): void {
    for (const box of this.state.itemWorld.boxes) {
      box.respawnRemaining = Math.max(0, box.respawnRemaining - dt);
      if (box.respawnRemaining > 0) continue;

      let winner: RacerRef | null = null;
      let bestDistance = PICKUP_RADIUS_SQUARED;
      for (const racer of racers) {
        if (racer.race.finished || racer.items.inventory !== null) continue;
        const dx = racer.vehicle.x - box.x;
        const dz = racer.vehicle.z - box.z;
        const distance = dx * dx + dz * dz;
        if (distance <= bestDistance) {
          bestDistance = distance;
          winner = racer;
        }
      }

      if (!winner) continue;
      winner.items.inventory = chooseWeightedItem(winner.race.position, winner.race.totalRacers);
      winner.items.inventoryAgeSeconds = 0;
      box.respawnRemaining = BOX_RESPAWN_SECONDS;
    }
  }

  private updateHazards(dt: number, racers: readonly RacerRef[], physics: ItemPhysicsBridge): void {
    const survivors = [] as typeof this.state.itemWorld.hazards;
    for (const hazard of this.state.itemWorld.hazards) {
      hazard.lifetimeRemaining -= dt;
      if (hazard.lifetimeRemaining <= 0) continue;

      let consumed = false;
      for (const racer of racers) {
        if (racer.id === hazard.ownerId || racer.race.finished) continue;
        const dx = racer.vehicle.x - hazard.x;
        const dz = racer.vehicle.z - hazard.z;
        if (dx * dx + dz * dz > HAZARD_RADIUS_SQUARED) continue;

        this.applyHit(racer, () => {
          physics.scaleRacerSpeed(racer.id, 0.48);
          racer.items.slowRemaining = Math.max(racer.items.slowRemaining, 1.8);
        });
        consumed = true;
        break;
      }
      if (!consumed) survivors.push(hazard);
    }
    this.state.itemWorld.hazards = survivors;
  }

  private shouldAIUseItem(racer: RacerRef, racers: readonly RacerRef[]): boolean {
    const kind = racer.items.inventory;
    if (kind === null) return false;
    const age = racer.items.inventoryAgeSeconds;

    if (kind === 'turbo-solar') return racer.vehicle.speed > 5 && (racer.race.position > 1 || age > 2.4);
    if (kind === 'escudo-prisma') return racer.items.shieldRemaining <= 0 && age > 1.2;

    let nearest = Number.POSITIVE_INFINITY;
    let hasRacerBehind = false;
    const heading = racer.vehicle.heading;
    const forwardX = Math.sin(heading);
    const forwardZ = -Math.cos(heading);
    for (const other of racers) {
      if (other.id === racer.id) continue;
      const dx = other.vehicle.x - racer.vehicle.x;
      const dz = other.vehicle.z - racer.vehicle.z;
      const distance = Math.hypot(dx, dz);
      nearest = Math.min(nearest, distance);
      const along = dx * forwardX + dz * forwardZ;
      if (along < 0 && distance < 11) hasRacerBehind = true;
    }

    if (kind === 'pulso-repulsor') return nearest < PULSE_RADIUS * 0.92 || age > 2.8;
    return hasRacerBehind || age > 3.1;
  }

  private useHeldItem(racer: RacerRef, racers: readonly RacerRef[], physics: ItemPhysicsBridge): void {
    const kind = racer.items.inventory;
    if (kind === null) return;
    racer.items.inventory = null;
    racer.items.inventoryAgeSeconds = 0;

    if (kind === 'turbo-solar') {
      racer.vehicle.boostRemaining = Math.max(racer.vehicle.boostRemaining, 1.7);
      return;
    }

    if (kind === 'escudo-prisma') {
      racer.items.shieldRemaining = Math.max(racer.items.shieldRemaining, 5.5);
      return;
    }

    if (kind === 'pulso-repulsor') {
      for (const target of racers) {
        if (target.id === racer.id || target.race.finished) continue;
        const dx = target.vehicle.x - racer.vehicle.x;
        const dz = target.vehicle.z - racer.vehicle.z;
        const distance = Math.hypot(dx, dz);
        if (distance > PULSE_RADIUS) continue;
        const safeDistance = Math.max(distance, 0.25);
        this.applyHit(target, () => {
          const strength = 8.8 * (1 - distance / (PULSE_RADIUS * 1.35));
          physics.applyItemImpulse(target.id, (dx / safeDistance) * strength, (dz / safeDistance) * strength);
          physics.scaleRacerSpeed(target.id, 0.8);
          target.items.slowRemaining = Math.max(target.items.slowRemaining, 0.55);
        });
      }
      return;
    }

    const forwardX = Math.sin(racer.vehicle.heading);
    const forwardZ = -Math.cos(racer.vehicle.heading);
    const hazardId = this.state.itemWorld.nextHazardId;
    this.state.itemWorld.nextHazardId += 1;
    this.state.itemWorld.hazards.push({
      id: `sticky-${hazardId}`,
      ownerId: racer.id,
      x: racer.vehicle.x - forwardX * 2.8,
      z: racer.vehicle.z - forwardZ * 2.8,
      lifetimeRemaining: HAZARD_LIFETIME_SECONDS,
    });
  }

  private applyHit(target: RacerRef, applyEffect: () => void): void {
    if (target.items.shieldRemaining > 0) {
      target.items.shieldRemaining = 0;
      target.items.hitFlashSeconds = Math.max(target.items.hitFlashSeconds, 0.25);
      return;
    }
    applyEffect();
    target.items.hitFlashSeconds = Math.max(target.items.hitFlashSeconds, 0.42);
  }
}
