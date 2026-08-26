import * as THREE from 'three';
import type { ItemKind } from '../../simulation/items/types';
import type { GameState } from '../../simulation/state';
import { VEHICLE_TUNING, type VehicleState } from '../../simulation/vehicle';

const PARTICLE_COUNT = 420;
const SPEED_LINE_COUNT = 22;
const HIDDEN_Y = -1000;

const DRIFT_COLOR = new THREE.Color(0xffb53d);
const BOOST_COLOR = new THREE.Color(0x62ffb2);
const IMPACT_COLOR = new THREE.Color(0xff7654);
const PICKUP_COLOR = new THREE.Color(0x76dcff);
const ITEM_COLORS: Readonly<Record<ItemKind, THREE.Color>> = Object.freeze({
  'turbo-solar': new THREE.Color(0xffd94f),
  'escudo-prisma': new THREE.Color(0x75d7ff),
  'pulso-repulsor': new THREE.Color(0xb68cff),
  'faixa-grudenta': new THREE.Color(0xff689a),
});

export class RaceEffects {
  readonly group = new THREE.Group();

  private readonly particleGeometry = new THREE.BufferGeometry();
  private readonly particleMaterial = new THREE.PointsMaterial({
    size: 0.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  private readonly particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  private readonly particleColors = new Float32Array(PARTICLE_COUNT * 3);
  private readonly particleVelocities = new Float32Array(PARTICLE_COUNT * 3);
  private readonly particleLife = new Float32Array(PARTICLE_COUNT);
  private readonly particleMaxLife = new Float32Array(PARTICLE_COUNT);
  private readonly points: THREE.Points;

  private readonly lineGeometry = new THREE.BufferGeometry();
  private readonly linePositions = new Float32Array(SPEED_LINE_COUNT * 2 * 3);
  private readonly lineMaterial = new THREE.LineBasicMaterial({
    color: 0xd8fff0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly speedLines: THREE.LineSegments;
  private readonly linePhase = new Float32Array(SPEED_LINE_COUNT);
  private readonly lineSide = new Float32Array(SPEED_LINE_COUNT);
  private readonly lineHeight = new Float32Array(SPEED_LINE_COUNT);

  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private previousBoosting = false;
  private previousImpact = 0;
  private previousHitFlash = 0;
  private previousInventory: ItemKind | null = null;
  private elapsed = 0;

  constructor() {
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      this.particlePositions[index * 3 + 1] = HIDDEN_Y;
      this.particleColors[index * 3] = 1;
      this.particleColors[index * 3 + 1] = 1;
      this.particleColors[index * 3 + 2] = 1;
    }
    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));
    this.points = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    for (let index = 0; index < SPEED_LINE_COUNT; index += 1) {
      this.linePhase[index] = Math.random();
      this.lineSide[index] = (Math.random() < 0.5 ? -1 : 1) * (2.8 + Math.random() * 5.2);
      this.lineHeight[index] = 0.55 + Math.random() * 3.9;
    }
    this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    this.speedLines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.speedLines.frustumCulled = false;
    this.group.add(this.speedLines);
  }

  reset(state: GameState): void {
    this.previousBoosting = state.vehicle.boostRemaining > 0;
    this.previousImpact = state.vehicle.impactStrength;
    this.previousHitFlash = state.items.hitFlashSeconds;
    this.previousInventory = state.items.inventory;
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      this.particleLife[index] = 0;
      this.particlePositions[index * 3 + 1] = HIDDEN_Y;
    }
    this.markParticlesDirty();
  }

  update(deltaSeconds: number, state: GameState): void {
    const dt = Math.min(Math.max(deltaSeconds, 0), 0.1);
    this.elapsed += dt;
    this.advanceParticles(dt);

    if (state.phase !== 'racing') {
      this.lineMaterial.opacity = THREE.MathUtils.lerp(this.lineMaterial.opacity, 0, 0.25);
      this.markParticlesDirty();
      return;
    }

    const vehicle = state.vehicle;
    const speedRatio = Math.min(Math.abs(vehicle.speed) / VEHICLE_TUNING.maxForwardSpeed, 1.25);
    if (vehicle.drifting && Math.abs(vehicle.lateralSpeed) > 0.7) {
      const count = speedRatio > 0.7 ? 4 : 2;
      this.emitBehind(vehicle, DRIFT_COLOR, count, 0.55, 0.8);
    }

    const boosting = vehicle.boostRemaining > 0;
    if (boosting) {
      this.emitBehind(vehicle, BOOST_COLOR, 3, 0.35, 1.65);
      if (!this.previousBoosting) this.emitBurst(vehicle, BOOST_COLOR, 24, 1.8, 0.85);
    }

    const impact = Math.max(vehicle.impactStrength, state.items.hitFlashSeconds * 1.5);
    const previousCombinedImpact = Math.max(this.previousImpact, this.previousHitFlash * 1.5);
    if (impact > 0.34 && previousCombinedImpact <= 0.34) {
      this.emitBurst(vehicle, IMPACT_COLOR, 34, 3.4, 0.75);
    }

    if (state.items.inventory !== null && this.previousInventory === null) {
      this.emitBurst(vehicle, PICKUP_COLOR, 26, 2.3, 0.9);
    }
    if (state.items.inventory === null && this.previousInventory !== null) {
      this.emitBurst(vehicle, ITEM_COLORS[this.previousInventory], 28, 2.7, 0.85);
    }

    for (const rival of state.rivals) {
      if (rival.vehicle.drifting && Math.abs(rival.vehicle.lateralSpeed) > 1.2 && Math.random() < 0.42) {
        this.emitBehind(rival.vehicle, DRIFT_COLOR, 1, 0.42, 0.7);
      }
      if (rival.vehicle.boostRemaining > 0 && Math.random() < 0.55) {
        this.emitBehind(rival.vehicle, BOOST_COLOR, 1, 0.3, 1.2);
      }
    }

    this.updateSpeedLines(vehicle, speedRatio, boosting);
    this.previousBoosting = boosting;
    this.previousImpact = vehicle.impactStrength;
    this.previousHitFlash = state.items.hitFlashSeconds;
    this.previousInventory = state.items.inventory;
    this.markParticlesDirty();
  }

  dispose(): void {
    this.particleGeometry.dispose();
    this.particleMaterial.dispose();
    this.lineGeometry.dispose();
    this.lineMaterial.dispose();
    this.group.removeFromParent();
  }

  private advanceParticles(dt: number): void {
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      if (this.particleLife[index] <= 0) continue;
      this.particleLife[index] -= dt;
      const offset = index * 3;
      if (this.particleLife[index] <= 0) {
        this.particlePositions[offset + 1] = HIDDEN_Y;
        continue;
      }
      this.particlePositions[offset] += this.particleVelocities[offset] * dt;
      this.particlePositions[offset + 1] += this.particleVelocities[offset + 1] * dt;
      this.particlePositions[offset + 2] += this.particleVelocities[offset + 2] * dt;
      this.particleVelocities[offset + 1] -= 2.2 * dt;

      const fade = Math.max(0.12, this.particleLife[index] / Math.max(0.01, this.particleMaxLife[index]));
      this.particleColors[offset] *= 0.985 + fade * 0.015;
      this.particleColors[offset + 1] *= 0.985 + fade * 0.015;
      this.particleColors[offset + 2] *= 0.985 + fade * 0.015;
    }
  }

  private emitBehind(vehicle: VehicleState, color: THREE.Color, count: number, spread: number, backwardSpeed: number): void {
    this.forward.set(Math.sin(vehicle.heading), 0, -Math.cos(vehicle.heading));
    this.right.set(Math.cos(vehicle.heading), 0, Math.sin(vehicle.heading));
    for (let index = 0; index < count; index += 1) {
      const side = (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 0.6);
      const x = vehicle.x - this.forward.x * 1.75 + this.right.x * side;
      const z = vehicle.z - this.forward.z * 1.75 + this.right.z * side;
      const vx = -this.forward.x * (backwardSpeed + Math.random() * 1.2) + (Math.random() - 0.5) * spread;
      const vz = -this.forward.z * (backwardSpeed + Math.random() * 1.2) + (Math.random() - 0.5) * spread;
      this.spawn(x, vehicle.y + 0.35 + Math.random() * 0.22, z, vx, 0.5 + Math.random() * 1.1, vz, 0.32 + Math.random() * 0.35, color);
    }
  }

  private emitBurst(vehicle: VehicleState, color: THREE.Color, count: number, speed: number, life: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radial = speed * (0.28 + Math.random() * 0.72);
      this.spawn(
        vehicle.x,
        vehicle.y + 0.75 + Math.random() * 0.7,
        vehicle.z,
        Math.cos(angle) * radial,
        0.65 + Math.random() * speed * 0.8,
        Math.sin(angle) * radial,
        life * (0.55 + Math.random() * 0.65),
        color,
      );
    }
  }

  private spawn(
    x: number,
    y: number,
    z: number,
    velocityX: number,
    velocityY: number,
    velocityZ: number,
    life: number,
    color: THREE.Color,
  ): void {
    let slot = -1;
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      if (this.particleLife[index] <= 0) {
        slot = index;
        break;
      }
    }
    if (slot < 0) slot = Math.floor(Math.random() * PARTICLE_COUNT);
    const offset = slot * 3;
    this.particlePositions[offset] = x;
    this.particlePositions[offset + 1] = y;
    this.particlePositions[offset + 2] = z;
    this.particleVelocities[offset] = velocityX;
    this.particleVelocities[offset + 1] = velocityY;
    this.particleVelocities[offset + 2] = velocityZ;
    this.particleLife[slot] = life;
    this.particleMaxLife[slot] = life;
    this.particleColors[offset] = color.r;
    this.particleColors[offset + 1] = color.g;
    this.particleColors[offset + 2] = color.b;
  }

  private updateSpeedLines(vehicle: VehicleState, speedRatio: number, boosting: boolean): void {
    const intensity = THREE.MathUtils.clamp((speedRatio - 0.42) / 0.58, 0, 1);
    this.lineMaterial.opacity = intensity * (boosting ? 0.46 : 0.26);
    if (intensity <= 0.01) return;

    this.forward.set(Math.sin(vehicle.heading), 0, -Math.cos(vehicle.heading));
    this.right.set(Math.cos(vehicle.heading), 0, Math.sin(vehicle.heading));
    const travel = this.elapsed * (10 + Math.abs(vehicle.speed) * 1.8);
    const length = 1.2 + intensity * 3.5 + (boosting ? 1.8 : 0);

    for (let index = 0; index < SPEED_LINE_COUNT; index += 1) {
      const phaseDistance = ((this.linePhase[index] * 28 + travel) % 28) - 8;
      const side = this.lineSide[index];
      const height = this.lineHeight[index];
      const startX = vehicle.x + this.forward.x * phaseDistance + this.right.x * side;
      const startZ = vehicle.z + this.forward.z * phaseDistance + this.right.z * side;
      const offset = index * 6;
      this.linePositions[offset] = startX;
      this.linePositions[offset + 1] = vehicle.y + height;
      this.linePositions[offset + 2] = startZ;
      this.linePositions[offset + 3] = startX - this.forward.x * length;
      this.linePositions[offset + 4] = vehicle.y + height;
      this.linePositions[offset + 5] = startZ - this.forward.z * length;
    }
    const position = this.lineGeometry.getAttribute('position');
    position.needsUpdate = true;
  }

  private markParticlesDirty(): void {
    this.particleGeometry.getAttribute('position').needsUpdate = true;
    this.particleGeometry.getAttribute('color').needsUpdate = true;
  }
}
