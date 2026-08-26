import RAPIER from '@dimforge/rapier3d-compat';
import type { RivalInputMap } from '../simulation/AIController';
import type { ItemPhysicsBridge, RacerItemState } from '../simulation/items/types';
import type { RivalState } from '../simulation/state';
import { moveTowards, VEHICLE_TUNING, type DrivingInput, type VehicleState } from '../simulation/vehicle';
import type { TrackDefinition } from '../track/firstTrack';

type RapierWorld = InstanceType<typeof RAPIER.World>;
type RapierRigidBody = ReturnType<RapierWorld['createRigidBody']>;

interface VehicleBodyEntry {
  readonly body: RapierRigidBody;
  readonly spawn: Readonly<{ x: number; z: number; heading: number }>;
}

const FIXED_TIMESTEP = 1 / 60;
const BODY_CENTER_HEIGHT = 0.42;
const MAX_FRAME_DELTA = 0.1;
const MAX_STEPS_PER_FRAME = 6;

let rapierReady: Promise<void> | null = null;

async function ensureRapierReady(): Promise<void> {
  rapierReady ??= RAPIER.init();
  await rapierReady;
}

function yawQuaternion(heading: number): { x: number; y: number; z: number; w: number } {
  const half = heading * 0.5;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

function quaternionYaw(rotation: { x: number; y: number; z: number; w: number }): number {
  const sinYaw = 2 * (rotation.w * rotation.y + rotation.x * rotation.z);
  const cosYaw = 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z);
  return Math.atan2(sinYaw, cosYaw);
}

function horizontalSpeed(body: RapierRigidBody): number {
  const velocity = body.linvel();
  return Math.hypot(velocity.x, velocity.z);
}

function createVehicleBody(world: RapierWorld, state: VehicleState): RapierRigidBody {
  const bodyDescription = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(state.x, BODY_CENTER_HEIGHT, state.z)
    .setRotation(yawQuaternion(state.heading))
    .setLinearDamping(0.18)
    .setAngularDamping(5.5)
    .setCanSleep(false)
    .setCcdEnabled(true)
    .enabledRotations(false, true, false);

  const body = world.createRigidBody(bodyDescription);
  const collider = RAPIER.ColliderDesc.cuboid(1.02, 0.4, 1.58)
    .setDensity(0.9)
    .setFriction(0.12)
    .setRestitution(0.08);
  world.createCollider(collider, body);
  return body;
}

export class KartPhysics implements ItemPhysicsBridge {
  private accumulator = 0;
  private readonly rivalBodies = new Map<string, VehicleBodyEntry>();

  private constructor(
    private readonly world: RapierWorld,
    private readonly player: VehicleBodyEntry,
  ) {}

  static async create(
    initialState: VehicleState,
    track: TrackDefinition,
    rivals: readonly RivalState[] = [],
  ): Promise<KartPhysics> {
    await ensureRapierReady();

    const world = new RAPIER.World({ x: 0, y: -16, z: 0 });
    world.timestep = FIXED_TIMESTEP;

    const playerBody = createVehicleBody(world, initialState);
    const physics = new KartPhysics(world, {
      body: playerBody,
      spawn: { x: initialState.x, z: initialState.z, heading: initialState.heading },
    });

    for (const rival of rivals) {
      physics.rivalBodies.set(rival.id, {
        body: createVehicleBody(world, rival.vehicle),
        spawn: {
          x: rival.vehicle.x,
          z: rival.vehicle.z,
          heading: rival.vehicle.heading,
        },
      });
    }

    physics.createTrackColliders(track);
    return physics;
  }

  advance(
    playerInput: DrivingInput,
    rivalInputs: RivalInputMap,
    frameDeltaSeconds: number,
    playerState: VehicleState,
    playerItems: RacerItemState,
    rivals: readonly RivalState[],
  ): void {
    this.accumulator += Math.min(Math.max(frameDeltaSeconds, 0), MAX_FRAME_DELTA);

    let steps = 0;
    while (this.accumulator >= FIXED_TIMESTEP && steps < MAX_STEPS_PER_FRAME) {
      this.fixedStep(playerInput, rivalInputs, playerState, playerItems, rivals, FIXED_TIMESTEP);
      this.accumulator -= FIXED_TIMESTEP;
      steps += 1;
    }

    if (steps === MAX_STEPS_PER_FRAME && this.accumulator > FIXED_TIMESTEP) this.accumulator = 0;
  }

  applyItemImpulse(racerId: string, impulseX: number, impulseZ: number): void {
    const body = this.getRacerBody(racerId);
    if (!body) return;
    body.applyImpulse({ x: impulseX, y: 0, z: impulseZ }, true);
  }

  scaleRacerSpeed(racerId: string, factor: number): void {
    const body = this.getRacerBody(racerId);
    if (!body) return;
    const velocity = body.linvel();
    const safeFactor = Math.max(0, Math.min(factor, 1));
    body.setLinvel({ x: velocity.x * safeFactor, y: velocity.y, z: velocity.z * safeFactor }, true);
  }

  dispose(): void {
    this.world.free();
  }

  private getRacerBody(racerId: string): RapierRigidBody | null {
    if (racerId === 'player') return this.player.body;
    return this.rivalBodies.get(racerId)?.body ?? null;
  }

  private fixedStep(
    playerInput: DrivingInput,
    rivalInputs: RivalInputMap,
    playerState: VehicleState,
    playerItems: RacerItemState,
    rivals: readonly RivalState[],
    dt: number,
  ): void {
    const speedBefore = new Map<RapierRigidBody, number>();
    speedBefore.set(this.player.body, horizontalSpeed(this.player.body));
    this.applyControl(this.player.body, playerState, playerInput, playerItems, dt);

    for (const rival of rivals) {
      const entry = this.rivalBodies.get(rival.id);
      if (!entry) continue;
      speedBefore.set(entry.body, horizontalSpeed(entry.body));
      this.applyControl(
        entry.body,
        rival.vehicle,
        rivalInputs[rival.id] ?? { throttle: 0, steer: 0, drift: false },
        rival.items,
        dt,
      );
    }

    this.world.timestep = dt;
    this.world.step();

    this.syncVehicle(this.player.body, playerState, speedBefore.get(this.player.body) ?? 0, dt);
    if (this.player.body.translation().y < -3) this.reset(this.player, playerState);

    for (const rival of rivals) {
      const entry = this.rivalBodies.get(rival.id);
      if (!entry) continue;
      this.syncVehicle(entry.body, rival.vehicle, speedBefore.get(entry.body) ?? 0, dt);
      if (entry.body.translation().y < -3) this.reset(entry, rival.vehicle);
    }
  }

  private applyControl(
    body: RapierRigidBody,
    state: VehicleState,
    input: DrivingInput,
    items: RacerItemState,
    dt: number,
  ): void {
    const velocity = body.linvel();
    const heading = state.heading;
    const forwardX = Math.sin(heading);
    const forwardZ = -Math.cos(heading);
    const rightX = Math.cos(heading);
    const rightZ = Math.sin(heading);

    let forwardSpeed = velocity.x * forwardX + velocity.z * forwardZ;
    let lateralSpeed = velocity.x * rightX + velocity.z * rightZ;
    const slowed = items.slowRemaining > 0;
    const accelerationScale = slowed ? 0.68 : 1;
    const speedScale = slowed ? 0.62 : 1;

    this.updateDriftAndBoost(input, state, forwardSpeed, dt);

    if (input.throttle > 0) {
      if (forwardSpeed < -0.15) {
        forwardSpeed = Math.min(0, forwardSpeed + VEHICLE_TUNING.brakingDeceleration * dt);
      } else {
        forwardSpeed += VEHICLE_TUNING.forwardAcceleration * accelerationScale * dt;
      }
    } else if (input.throttle < 0) {
      if (forwardSpeed > 0.15) {
        forwardSpeed = Math.max(0, forwardSpeed - VEHICLE_TUNING.brakingDeceleration * dt);
      } else {
        forwardSpeed -= VEHICLE_TUNING.reverseAcceleration * accelerationScale * dt;
      }
    } else {
      forwardSpeed = moveTowards(forwardSpeed, 0, VEHICLE_TUNING.rollingResistance * dt);
    }

    if (state.boostRemaining > 0 && forwardSpeed >= 0) {
      forwardSpeed += VEHICLE_TUNING.boostAcceleration * accelerationScale * dt;
    }

    const normalLimit = state.boostRemaining > 0 ? VEHICLE_TUNING.maxBoostSpeed : VEHICLE_TUNING.maxForwardSpeed;
    const speedLimit = normalLimit * speedScale;
    forwardSpeed = Math.min(speedLimit, Math.max(-VEHICLE_TUNING.maxReverseSpeed * speedScale, forwardSpeed));

    const targetSteering = input.steer * VEHICLE_TUNING.maxSteering;
    state.steering = moveTowards(state.steering, targetSteering, VEHICLE_TUNING.steeringResponse * dt);

    const grip = state.drifting ? VEHICLE_TUNING.driftLateralGrip : VEHICLE_TUNING.normalLateralGrip;
    lateralSpeed *= Math.exp(-grip * dt);

    const speedRatio = Math.min(Math.abs(forwardSpeed) / VEHICLE_TUNING.maxForwardSpeed, 1);
    const steeringAuthority = 0.32 + speedRatio * 0.68;
    const direction = forwardSpeed >= 0 ? 1 : -1;
    const driftTurn = state.drifting ? VEHICLE_TUNING.driftTurnMultiplier : 1;
    const yawVelocity = state.steering * VEHICLE_TUNING.turnRate * steeringAuthority * direction * driftTurn;

    body.setAngvel({ x: 0, y: yawVelocity, z: 0 }, true);
    body.setLinvel(
      {
        x: forwardX * forwardSpeed + rightX * lateralSpeed,
        y: velocity.y,
        z: forwardZ * forwardSpeed + rightZ * lateralSpeed,
      },
      true,
    );
  }

  private updateDriftAndBoost(input: DrivingInput, state: VehicleState, forwardSpeed: number, dt: number): void {
    state.boostRemaining = Math.max(0, state.boostRemaining - dt);
    const wantsDrift = input.drift && Math.abs(input.steer) > 0 && forwardSpeed > VEHICLE_TUNING.minimumDriftSpeed;

    if (wantsDrift) {
      state.drifting = true;
      const speedFactor = Math.min(forwardSpeed / VEHICLE_TUNING.maxForwardSpeed, 1);
      state.driftCharge = Math.min(
        1,
        state.driftCharge + VEHICLE_TUNING.driftChargeRate * (0.65 + speedFactor * 0.55) * dt,
      );
      return;
    }

    if (state.drifting && state.driftCharge >= VEHICLE_TUNING.minimumBoostCharge) {
      const normalizedCharge =
        (state.driftCharge - VEHICLE_TUNING.minimumBoostCharge) /
        (1 - VEHICLE_TUNING.minimumBoostCharge);
      state.boostRemaining =
        VEHICLE_TUNING.minimumBoostDuration +
        Math.max(0, Math.min(normalizedCharge, 1)) *
          (VEHICLE_TUNING.maximumBoostDuration - VEHICLE_TUNING.minimumBoostDuration);
    }

    state.drifting = false;
    if (!input.drift || forwardSpeed <= VEHICLE_TUNING.minimumDriftSpeed) state.driftCharge = 0;
  }

  private syncVehicle(body: RapierRigidBody, state: VehicleState, speedBeforeStep: number, dt: number): void {
    const previousX = state.x;
    const previousZ = state.z;
    const translation = body.translation();
    const velocity = body.linvel();
    const speedAfterStep = Math.hypot(velocity.x, velocity.z);
    const collisionDrop = Math.max(0, speedBeforeStep - speedAfterStep);

    state.x = translation.x;
    state.y = translation.y - BODY_CENTER_HEIGHT;
    state.z = translation.z;
    state.heading = quaternionYaw(body.rotation());

    const forwardX = Math.sin(state.heading);
    const forwardZ = -Math.cos(state.heading);
    const rightX = Math.cos(state.heading);
    const rightZ = Math.sin(state.heading);
    state.speed = velocity.x * forwardX + velocity.z * forwardZ;
    state.lateralSpeed = velocity.x * rightX + velocity.z * rightZ;
    state.impactStrength = Math.max(state.impactStrength * Math.exp(-9 * dt), Math.min(collisionDrop / 8, 1));
    state.distanceTravelled += Math.hypot(state.x - previousX, state.z - previousZ);
  }

  private reset(entry: VehicleBodyEntry, state: VehicleState): void {
    entry.body.setTranslation({ x: entry.spawn.x, y: BODY_CENTER_HEIGHT, z: entry.spawn.z }, true);
    entry.body.setRotation(yawQuaternion(entry.spawn.heading), true);
    entry.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    entry.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    state.x = entry.spawn.x;
    state.y = 0;
    state.z = entry.spawn.z;
    state.heading = entry.spawn.heading;
    state.speed = 0;
    state.lateralSpeed = 0;
    state.steering = 0;
    state.drifting = false;
    state.driftCharge = 0;
    state.boostRemaining = 0;
  }

  private createTrackColliders(track: TrackDefinition): void {
    const staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const centerX = (track.bounds.minX + track.bounds.maxX) * 0.5;
    const centerZ = (track.bounds.minZ + track.bounds.maxZ) * 0.5;
    const halfX = (track.bounds.maxX - track.bounds.minX) * 0.5 + 35;
    const halfZ = (track.bounds.maxZ - track.bounds.minZ) * 0.5 + 35;

    const ground = RAPIER.ColliderDesc.cuboid(halfX, 0.12, halfZ)
      .setTranslation(centerX, -0.12, centerZ)
      .setFriction(0.9)
      .setRestitution(0);
    this.world.createCollider(ground, staticBody);

    for (let index = 0; index < track.samples.length; index += 1) {
      const next = (index + 1) % track.samples.length;
      const a = track.samples[index];
      const b = track.samples[next];
      this.addBarrierCollider(staticBody, a.leftBarrierX, a.leftBarrierZ, b.leftBarrierX, b.leftBarrierZ);
      this.addBarrierCollider(staticBody, a.rightBarrierX, a.rightBarrierZ, b.rightBarrierX, b.rightBarrierZ);
    }
  }

  private addBarrierCollider(staticBody: RapierRigidBody, ax: number, az: number, bx: number, bz: number): void {
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const collider = RAPIER.ColliderDesc.cuboid(0.34, 0.72, length * 0.5 + 0.08)
      .setTranslation((ax + bx) * 0.5, 0.72, (az + bz) * 0.5)
      .setRotation(yawQuaternion(yaw))
      .setFriction(0.28)
      .setRestitution(0.08);
    this.world.createCollider(collider, staticBody);
  }
}
