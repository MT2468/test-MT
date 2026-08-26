export interface DrivingInput {
  throttle: -1 | 0 | 1;
  steer: -1 | 0 | 1;
}

export interface VehicleState {
  x: number;
  z: number;
  heading: number;
  speed: number;
  steering: number;
  distanceTravelled: number;
}

export const VEHICLE_TUNING = Object.freeze({
  maxForwardSpeed: 22,
  maxReverseSpeed: 7,
  forwardAcceleration: 11.5,
  reverseAcceleration: 7,
  brakingDeceleration: 18,
  rollingResistance: 5.5,
  maxSteering: 0.72,
  steeringResponse: 7.5,
  turnRate: 1.65,
});

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export function updateVehicle(vehicle: VehicleState, input: DrivingInput, deltaSeconds: number): void {
  const dt = Math.min(Math.max(deltaSeconds, 0), 0.05);
  if (dt === 0) return;

  if (input.throttle > 0) {
    if (vehicle.speed < -0.1) {
      vehicle.speed = Math.min(0, vehicle.speed + VEHICLE_TUNING.brakingDeceleration * dt);
    } else {
      vehicle.speed = Math.min(VEHICLE_TUNING.maxForwardSpeed, vehicle.speed + VEHICLE_TUNING.forwardAcceleration * dt);
    }
  } else if (input.throttle < 0) {
    if (vehicle.speed > 0.1) {
      vehicle.speed = Math.max(0, vehicle.speed - VEHICLE_TUNING.brakingDeceleration * dt);
    } else {
      vehicle.speed = Math.max(-VEHICLE_TUNING.maxReverseSpeed, vehicle.speed - VEHICLE_TUNING.reverseAcceleration * dt);
    }
  } else {
    vehicle.speed = moveTowards(vehicle.speed, 0, VEHICLE_TUNING.rollingResistance * dt);
  }

  const targetSteering = input.steer * VEHICLE_TUNING.maxSteering;
  vehicle.steering = moveTowards(vehicle.steering, targetSteering, VEHICLE_TUNING.steeringResponse * dt);

  const absoluteSpeed = Math.abs(vehicle.speed);
  if (absoluteSpeed > 0.05) {
    const speedRatio = Math.min(absoluteSpeed / VEHICLE_TUNING.maxForwardSpeed, 1);
    const steeringAuthority = 0.35 + speedRatio * 0.65;
    const travelDirection = vehicle.speed >= 0 ? 1 : -1;
    vehicle.heading += vehicle.steering * VEHICLE_TUNING.turnRate * steeringAuthority * travelDirection * dt;
  }

  const frameDistance = vehicle.speed * dt;
  vehicle.x += Math.sin(vehicle.heading) * frameDistance;
  vehicle.z -= Math.cos(vehicle.heading) * frameDistance;
  vehicle.distanceTravelled += Math.abs(frameDistance);
}
