export interface DrivingInput {
  throttle: number;
  steer: number;
  drift: boolean;
}

export interface VehicleState {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  lateralSpeed: number;
  steering: number;
  distanceTravelled: number;
  drifting: boolean;
  driftCharge: number;
  boostRemaining: number;
  impactStrength: number;
}

export const VEHICLE_TUNING = Object.freeze({
  maxForwardSpeed: 24,
  maxBoostSpeed: 30,
  maxReverseSpeed: 7,
  forwardAcceleration: 13,
  boostAcceleration: 22,
  reverseAcceleration: 7,
  brakingDeceleration: 22,
  rollingResistance: 4.2,
  maxSteering: 0.68,
  steeringResponse: 8.5,
  turnRate: 1.75,
  driftTurnMultiplier: 1.48,
  normalLateralGrip: 11.5,
  driftLateralGrip: 2.35,
  minimumDriftSpeed: 7.5,
  driftChargeRate: 0.42,
  minimumBoostCharge: 0.2,
  minimumBoostDuration: 0.3,
  maximumBoostDuration: 1.2,
});

export function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}
