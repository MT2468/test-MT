import * as THREE from 'three';

export interface KartVisual {
  readonly group: THREE.Group;
  setSteering(amount: number): void;
}

export function createKart(): KartVisual {
  const kart = new THREE.Group();
  kart.name = 'player-kart';

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xf7c948, roughness: 0.5, metalness: 0.08 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x1ba65a, roughness: 0.45, metalness: 0.12 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.88 });

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

    if (steerable) frontPivots.push(pivot);
  }

  kart.traverse((object) => {
    if (object instanceof THREE.Mesh) object.receiveShadow = true;
  });

  return {
    group: kart,
    setSteering(amount: number): void {
      for (const pivot of frontPivots) pivot.rotation.y = amount * 0.7;
    },
  };
}
