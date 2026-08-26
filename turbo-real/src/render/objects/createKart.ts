import * as THREE from 'three';

export interface KartMotionVisualState {
  speed: number;
  steering: number;
  drifting: boolean;
  lateralSpeed: number;
  boostRemaining: number;
  deltaSeconds: number;
}

export interface KartVisual {
  readonly group: THREE.Group;
  updateMotion(state: KartMotionVisualState): void;
}

export function createKart(): KartVisual {
  const kart = new THREE.Group();
  kart.name = 'player-kart';

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xf7c948, roughness: 0.5, metalness: 0.08 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x1ba65a, roughness: 0.45, metalness: 0.12 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.88 });
  const sparkMaterial = new THREE.MeshStandardMaterial({
    color: 0xffb22e,
    emissive: 0xff6a00,
    emissiveIntensity: 2.2,
    roughness: 0.35,
  });
  const boostMaterial = new THREE.MeshStandardMaterial({
    color: 0x6fffc0,
    emissive: 0x16d97b,
    emissiveIntensity: 2.8,
    roughness: 0.3,
  });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 3.2), bodyMaterial);
  chassis.position.y = 0.65;
  chassis.castShadow = true;
  kart.add(chassis);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.32, 1.15), accentMaterial);
  nose.position.set(0, 0.76, -1.65);
  nose.castShadow = true;
  kart.add(nose);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.28), accentMaterial);
  bumper.position.set(0, 0.52, -2.18);
  bumper.castShadow = true;
  kart.add(bumper);

  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.9, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.7 }),
  );
  seat.position.set(0, 1.12, 0.35);
  seat.castShadow = true;
  kart.add(seat);

  const wheelGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.38, 20);
  const frontPivots: THREE.Group[] = [];
  const wheels: THREE.Mesh[] = [];
  const wheelPositions: ReadonlyArray<readonly [number, number, number, boolean]> = [
    [-1.18, 0.48, -1.05, true],
    [1.18, 0.48, -1.05, true],
    [-1.18, 0.48, 1.08, false],
    [1.18, 0.48, 1.08, false],
  ];

  for (const [x, y, z, steerable] of wheelPositions) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);

    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    pivot.add(wheel);
    kart.add(pivot);
    wheels.push(wheel);

    if (steerable) frontPivots.push(pivot);
  }

  const sparks = [-1, 1].map((side) => {
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), sparkMaterial);
    spark.position.set(side * 1.22, 0.24, 1.28);
    spark.visible = false;
    kart.add(spark);
    return spark;
  });

  const boostFlames = [-0.56, 0.56].map((side) => {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.85, 10), boostMaterial);
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(side, 0.53, 2.05);
    flame.visible = false;
    kart.add(flame);
    return flame;
  });

  kart.traverse((object) => {
    if (object instanceof THREE.Mesh) object.receiveShadow = true;
  });

  let wheelSpin = 0;

  return {
    group: kart,
    updateMotion(state): void {
      for (const pivot of frontPivots) pivot.rotation.y = state.steering * 0.72;

      wheelSpin += (state.speed / 0.48) * state.deltaSeconds;
      for (const wheel of wheels) wheel.rotation.x = wheelSpin;

      const slide = Math.min(Math.abs(state.lateralSpeed) / 8, 1);
      kart.rotation.z = THREE.MathUtils.lerp(kart.rotation.z, -state.steering * (state.drifting ? 0.09 : 0.035), 0.15);

      for (const [index, spark] of sparks.entries()) {
        spark.visible = state.drifting && slide > 0.08;
        if (spark.visible) {
          spark.scale.setScalar(0.75 + slide * 1.5 + Math.sin(wheelSpin * 0.8 + index) * 0.12);
        }
      }

      const boosting = state.boostRemaining > 0;
      for (const [index, flame] of boostFlames.entries()) {
        flame.visible = boosting;
        if (boosting) {
          const pulse = 0.9 + Math.sin(wheelSpin * 0.45 + index * 1.7) * 0.18;
          flame.scale.set(1, pulse, 1);
        }
      }
    },
  };
}
