import RAPIER from '@dimforge/rapier3d-compat';
import { moveTowards, VEHICLE_TUNING, type DrivingInput, type VehicleState } from '../simulation/vehicle';

type RapierWorld = InstanceType<typeof RAPIER.World>;
type RapierRigidBody = ReturnType<RapierWorld['createRigidBody']>;

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

export class KartPhysics {
  private accumulator = 0;

  private constructor(
    private readonly world: RapierWorld,
    private readonly body: RapierRigidBody,
    private readonly spawn: Readonly<{ x: number; z: number; heading: number }>,
  ) {}

  static async create(initialState: VehicleState): Promise<KartPhysics> {
    await ensureRapierReady();

    const world = new RAPIER.World({ x: 0, y: -16, z: 0 });
    world.timestep = FIXED_TIMESTEP;

    const bodyDescription = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(initialState.x, BODY_CENTER_HEIGHT, initialState.z)
      .setRotation(yawQuaternion(initialState.heading))
      .setLinearDamping(0.18)
      .setAngularDamping(5.5)
      .setCanSleep(false)
      .setCcdEnabled(true)
      .enabledRotations(false, true, false);

    const body = world.createRigidBody(bodyDescription);
    const kartCollider = RAPIER.ColliderDesc.cuboid(1.02, 0.4, 1.58)
      .setDensity(0.9)
      .setFriction(0.12)
      .setRestitution(0.08);
    world.createCollider(kartCollider, body);

    const physics = new KartPhysics(world, body, {
      x: initialState.x,
      z: initialState.z,
      heading: initialState.heading,
    });
    physics.createPracticeTrackColliders();
    return physics;
  }

  advance(input: DrivingInput, frameDeltaSeconds: number, state: VehicleState): void {
    this.accumulator += Math.min(Math.max(frameDeltaSeconds, 0), MAX_FRAME_DELTA);

    let steps = 0;
    while (this.accumulator >= FIXED_TIMESTEP && steps < MAX_STEPS_PER_FRAME) {
      this.fixedStep(input, state, FIXED_TIMESTEP);
      this.accumulator -= FIXED_TIMESTEP;
      steps += 1;
    }

    if (steps === MAX_STEPS_PER_FRAME && this.accumulator > FIXED_TIMESTEP) {
      this.accumulator = 0;
    }
  }

  dispose(): void {
    this.world.free();
  }

  private fixedStep(input: DrivingInput, state: VehicleState, dt: number): void {
    const velocity = this.body.linvel();
    const heading = state.heading;
    const forwardX = Math.sin(heading);
    const forwardZ = -Math.cos(heading);
    const rightX = Math.cos(heading);
    const rightZ = Math.sin(heading);

    let forwardSpeed = velocity.x * forwardX + velocity.z * forwardZ;
    let lateralSpeed = velocity.x * rightX + velocity.z * rightZ;

    this.updateDriftAndBoost(input, state, forwardSpeed, dt);

    if (input.throttle > 0) {
      if (forwardSpeed < -0.15) {
        forwardSpeed = Math.min(0, forwardSpeed + VEHICLE_TUNING.brakingDeceleration * dt);
      } else {
        forwardSpeed += VEHICLE_TUNING.forwardAcceleration * dt;
      }
    } else if (input.throttle < 0) {
      if (forwardSpeed > 0.15) {
        forwardSpeed = Math.max(0, forwardSpeed - VEHICLE_TUNING.brakingDeceleration * dt);
      } else {
        forwardSpeed -= VEHICLE_TUNING.reverseAcceleration * dt;
      }
    } else {
      forwardSpeed = moveTowards(forwardSpeed, 0, VEHICLE_TUNING.rollingResistance * dt);
    }

    if (state.boostRemaining > 0 && forwardSpeed >= 0) {
      forwardSpeed += VEHICLE_TUNING.boostAcceleration * dt;
    }

    const speedLimit = state.boostRemaining > 0 ? VEHICLE_TUNING.maxBoostSpeed : VEHICLE_TUNING.maxForwardSpeed;
    forwardSpeed = Math.min(speedLimit, Math.max(-VEHICLE_TUNING.maxReverseSpeed, forwardSpeed));

    const targetSteering = input.steer * VEHICLE_TUNING.maxSteering;
    state.steering = moveTowards(state.steering, targetSteering, VEHICLE_TUNING.steeringResponse * dt);

    const grip = state.drifting ? VEHICLE_TUNING.driftLateralGrip : VEHICLE_TUNING.normalLateralGrip;
    lateralSpeed *= Math.exp(-grip * dt);

    const speedRatio = Math.min(Math.abs(forwardSpeed) / VEHICLE_TUNING.maxForwardSpeed, 1);
    const steeringAuthority = 0.32 + speedRatio * 0.68;
    const direction = forwardSpeed >= 0 ? 1 : -1;
    const driftTurn = state.drifting ? VEHICLE_TUNING.driftTurnMultiplier : 1;
    const yawVelocity = state.steering * VEHICLE_TUNING.turnRate * steeringAuthority * direction * driftTurn;

    this.body.setAngvel({ x: 0, y: yawVelocity, z: 0 }, true);
    this.body.setLinvel(
      {
        x: forwardX * forwardSpeed + rightX * lateralSpeed,
        y: velocity.y,
        z: forwardZ * forwardSpeed + rightZ * lateralSpeed,
      },
      true,
    );

    const speedBeforeStep = Math.hypot(velocity.x, velocity.z);
    const previousX = state.x;
    const previousZ = state.z;

    this.world.timestep = dt;
    this.world.step();

    const speedAfterStepVector = this.body.linvel();
    const speedAfterStep = Math.hypot(speedAfterStepVector.x, speedAfterStepVector.z);
    const collisionDrop = Math.max(0, speedBeforeStep - speedAfterStep);
    state.impactStrength = Math.max(state.impactStrength * Math.exp(-9 * dt), Math.min(collisionDrop / 8, 1));

    this.syncState(state);
    state.distanceTravelled += Math.hypot(state.x - previousX, state.z - previousZ);

    if (this.body.translation().y < -3) this.reset(state);
  }

  private updateDriftAndBoost(input: DrivingInput, state: VehicleState, forwardSpeed: number, dt: number): void {
    state.boostRemaining = Math.max(0, state.boostRemaining - dt);

    const wantsDrift =
      input.drift &&
      Math.abs(input.steer) > 0 &&
      forwardSpeed > VEHICLE_TUNING.minimumDriftSpeed;

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

  private syncState(state: VehicleState): void {
    const translation = this.body.translation();
    const velocity = this.body.linvel();
    state.x = translation.x;
    state.y = translation.y - BODY_CENTER_HEIGHT;
    state.z = translation.z;
    state.heading = quaternionYaw(this.body.rotation());

    const forwardX = Math.sin(state.heading);
    const forwardZ = -Math.cos(state.heading);
    const rightX = Math.cos(state.heading);
    const rightZ = Math.sin(state.heading);
    state.speed = velocity.x * forwardX + velocity.z * forwardZ;
    state.lateralSpeed = velocity.x * rightX + velocity.z * rightZ;
  }

  private reset(state: VehicleState): void {
    this.body.setTranslation({ x: this.spawn.x, y: BODY_CENTER_HEIGHT, z: this.spawn.z }, true);
    this.body.setRotation(yawQuaternion(this.spawn.heading), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    state.x = this.spawn.x;
    state.y = 0;
    state.z = this.spawn.z;
    state.heading = this.spawn.heading;
    state.speed = 0;
    state.lateralSpeed = 0;
    state.steering = 0;
    state.drifting = false;
    state.driftCharge = 0;
    state.boostRemaining = 0;
  }

  private createPracticeTrackColliders(): void {
    this.addFixedBox(0, -0.12, 0, 55, 0.12, 160, 0.9, 0);
    this.addFixedBox(-9.35, 0.85, 0, 0.28, 0.85, 150, 0.28, 0.08);
    this.addFixedBox(9.35, 0.85, 0, 0.28, 0.85, 150, 0.28, 0.08);
    this.addFixedBox(0, 0.85, -150.35, 9.6, 0.85, 0.28, 0.28, 0.08);
    this.addFixedBox(0, 0.85, 150.35, 9.6, 0.85, 0.28, 0.28, 0.08);

    this.addFixedBox(-3.4, 0.7, -36, 1.25, 0.7, 1.8, 0.42, 0.18);
    this.addFixedBox(3.4, 0.7, -58, 1.25, 0.7, 1.8, 0.42, 0.18);
  }

  private addFixedBox(
    x: number,
    y: number,
    z: number,
    halfX: number,
    halfY: number,
    halfZ: number,
    friction: number,
    restitution: number,
  ): void {
    const fixedBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    const collider = RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ)
      .setFriction(friction)
      .setRestitution(restitution);
    this.world.createCollider(collider, fixedBody);
  }
}
