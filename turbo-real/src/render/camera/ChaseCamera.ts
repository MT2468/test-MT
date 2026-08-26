import * as THREE from 'three';
import { VEHICLE_TUNING, type VehicleState } from '../../simulation/vehicle';

export class ChaseCamera {
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly smoothedPosition = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private elapsed = 0;
  private portrait = false;
  private compactLandscape = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly mobile = false,
  ) {}

  setViewport(width: number, height: number): void {
    this.portrait = this.mobile && height >= width;
    this.compactLandscape = this.mobile && width > height && height < 520;
  }

  reset(vehicle: VehicleState): void {
    this.calculateTargets(vehicle);
    this.smoothedPosition.copy(this.desiredPosition);
    this.camera.position.copy(this.smoothedPosition);
    this.lookTarget.copy(this.desiredTarget);
    this.camera.lookAt(this.lookTarget);
    this.camera.rotation.z = 0;
  }

  update(vehicle: VehicleState, deltaSeconds: number): void {
    const dt = Math.min(Math.max(deltaSeconds, 0), 0.1);
    this.elapsed += dt;
    this.calculateTargets(vehicle);

    const positionResponse = vehicle.drifting ? 5.8 : 7.4;
    this.smoothedPosition.lerp(this.desiredPosition, 1 - Math.exp(-positionResponse * dt));
    this.lookTarget.lerp(this.desiredTarget, 1 - Math.exp(-9.5 * dt));

    this.camera.position.copy(this.smoothedPosition);
    const shake = THREE.MathUtils.clamp(vehicle.impactStrength, 0, 1);
    const shakeScale = this.mobile ? 0.68 : 1;
    if (shake > 0.02) {
      this.camera.position.addScaledVector(this.right, Math.sin(this.elapsed * 78) * shake * 0.13 * shakeScale);
      this.camera.position.y += Math.sin(this.elapsed * 103 + 0.7) * shake * 0.08 * shakeScale;
      this.camera.position.addScaledVector(this.forward, Math.sin(this.elapsed * 66 + 1.3) * shake * 0.05 * shakeScale);
    }

    const speedRatio = Math.min(Math.abs(vehicle.speed) / VEHICLE_TUNING.maxForwardSpeed, 1.2);
    const boostRatio = vehicle.boostRemaining > 0 ? Math.min(vehicle.boostRemaining / 1.5, 1) : 0;
    const baseFov = this.portrait ? 64 : this.compactLandscape ? 59 : this.mobile ? 58 : 55.5;
    const targetFov = baseFov + speedRatio * (this.portrait ? 5.2 : 6.5) + boostRatio * (this.mobile ? 3.8 : 4.8);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-4.5 * dt));
    this.camera.updateProjectionMatrix();

    this.camera.lookAt(this.lookTarget);
    const rollScale = this.mobile ? 0.72 : 1;
    const driftRoll = vehicle.drifting
      ? THREE.MathUtils.clamp(vehicle.lateralSpeed * -0.012, -0.055, 0.055) * rollScale
      : THREE.MathUtils.clamp(vehicle.steering * -0.018, -0.02, 0.02) * rollScale;
    const impactRoll = Math.sin(this.elapsed * 72) * shake * 0.015 * shakeScale;
    this.camera.rotateZ(driftRoll + impactRoll);
  }

  private calculateTargets(vehicle: VehicleState): void {
    this.forward.set(Math.sin(vehicle.heading), 0, -Math.cos(vehicle.heading));
    this.right.set(Math.cos(vehicle.heading), 0, Math.sin(vehicle.heading));

    const speedRatio = Math.min(Math.abs(vehicle.speed) / VEHICLE_TUNING.maxForwardSpeed, 1.2);
    const boostRatio = vehicle.boostRemaining > 0 ? Math.min(vehicle.boostRemaining / 1.5, 1) : 0;
    const mobileDistance = this.portrait ? 1.65 : this.mobile ? 0.7 : 0;
    const mobileHeight = this.portrait ? 0.85 : this.compactLandscape ? 0.15 : this.mobile ? 0.3 : 0;
    const distance = 7.6 + mobileDistance + speedRatio * 2 + boostRatio * 0.75;
    const height = 4.2 + mobileHeight + speedRatio * 0.55;
    const slideOffset = THREE.MathUtils.clamp(vehicle.lateralSpeed * 0.095, -1.2, 1.2);

    this.desiredPosition.set(vehicle.x, vehicle.y + height, vehicle.z);
    this.desiredPosition.addScaledVector(this.forward, -distance);
    this.desiredPosition.addScaledVector(this.right, vehicle.steering * 0.48 + slideOffset);

    const lookAheadBonus = this.portrait ? 1.25 : this.mobile ? 0.45 : 0;
    this.desiredTarget.set(vehicle.x, vehicle.y + (this.portrait ? 1.18 : 1.02), vehicle.z);
    this.desiredTarget.addScaledVector(this.forward, 4.35 + lookAheadBonus + speedRatio * 1.75 + boostRatio * 0.8);
    this.desiredTarget.addScaledVector(this.right, slideOffset * 0.32);
  }
}
