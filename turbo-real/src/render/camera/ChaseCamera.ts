import * as THREE from 'three';
import type { VehicleState } from '../../simulation/vehicle';

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
    const dt = Math.min(Math.max(deltaSeconds, 0), 0.05);
    this.calculateTargets(vehicle);

    this.camera.position.lerp(this.desiredPosition, 1 - Math.exp(-7.5 * dt));
    this.lookTarget.lerp(this.desiredTarget, 1 - Math.exp(-10 * dt));

    const speedRatio = Math.min(Math.abs(vehicle.speed) / 22, 1);
    const targetFov = 56 + speedRatio * 6;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-4 * dt));
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.lookTarget);
  }

  private calculateTargets(vehicle: VehicleState): void {
    this.forward.set(Math.sin(vehicle.heading), 0, -Math.cos(vehicle.heading));
    this.right.set(Math.cos(vehicle.heading), 0, Math.sin(vehicle.heading));

    const speedRatio = Math.min(Math.abs(vehicle.speed) / 22, 1);
    const distance = 7.8 + speedRatio * 1.5;
    const height = 4.3 + speedRatio * 0.45;

    this.desiredPosition.set(vehicle.x, height, vehicle.z);
    this.desiredPosition.addScaledVector(this.forward, -distance);
    this.desiredPosition.addScaledVector(this.right, vehicle.steering * 0.7);

    this.desiredTarget.set(vehicle.x, 1.05, vehicle.z);
    this.desiredTarget.addScaledVector(this.forward, 4.2 + speedRatio * 1.3);
  }
}
