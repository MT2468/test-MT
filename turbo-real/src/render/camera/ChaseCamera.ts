import * as THREE from 'three';
import { VEHICLE_TUNING, type VehicleState } from '../../simulation/vehicle';

export class ChaseCamera {
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  reset(vehicle: VehicleState): void {
    this.calculateTargets(vehicle);
    this.camera.position.copy(this.desiredPosition);
    this.lookTarget.copy(this.desiredTarget);
    this.camera.lookAt(this.lookTarget);
  }

  update(vehicle: VehicleState, deltaSeconds: number): void {
    const dt = Math.min(Math.max(deltaSeconds, 0), 0.1);
    this.calculateTargets(vehicle);

    const positionResponse = vehicle.drifting ? 6.2 : 7.5;
    this.camera.position.lerp(this.desiredPosition, 1 - Math.exp(-positionResponse * dt));
    this.lookTarget.lerp(this.desiredTarget, 1 - Math.exp(-10 * dt));

    const speedRatio = Math.min(Math.abs(vehicle.speed) / VEHICLE_TUNING.maxForwardSpeed, 1);
    const boostFov = vehicle.boostRemaining > 0 ? 3.2 : 0;
    const targetFov = 56 + speedRatio * 6 + boostFov;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-4 * dt));
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.lookTarget);
  }

  private calculateTargets(vehicle: VehicleState): void {
    this.forward.set(Math.sin(vehicle.heading), 0, -Math.cos(vehicle.heading));
    this.right.set(Math.cos(vehicle.heading), 0, Math.sin(vehicle.heading));

    const speedRatio = Math.min(Math.abs(vehicle.speed) / VEHICLE_TUNING.maxForwardSpeed, 1);
    const distance = 7.8 + speedRatio * 1.7 + (vehicle.boostRemaining > 0 ? 0.8 : 0);
    const height = 4.3 + speedRatio * 0.5;
    const slideOffset = THREE.MathUtils.clamp(vehicle.lateralSpeed * 0.09, -1.15, 1.15);

    this.desiredPosition.set(vehicle.x, vehicle.y + height + vehicle.impactStrength * 0.18, vehicle.z);
    this.desiredPosition.addScaledVector(this.forward, -distance);
    this.desiredPosition.addScaledVector(this.right, vehicle.steering * 0.55 + slideOffset);

    this.desiredTarget.set(vehicle.x, vehicle.y + 1.05, vehicle.z);
    this.desiredTarget.addScaledVector(this.forward, 4.2 + speedRatio * 1.5);
    this.desiredTarget.addScaledVector(this.right, slideOffset * 0.35);
  }
}
