import * as THREE from 'three';

export function createBootKart(): THREE.Group {
  const kart = new THREE.Group();
  kart.name = 'boot-kart';

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7c948,
    roughness: 0.5,
    metalness: 0.08,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0x1ba65a,
    roughness: 0.45,
    metalness: 0.12,
  });
  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: 0x111318,
    roughness: 0.88,
  });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 3.2), bodyMaterial);
  chassis.position.y = 0.65;
  chassis.castShadow = true;
  kart.add(chassis);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.32, 1.15), accentMaterial);
  nose.position.set(0, 0.76, -1.65);
  nose.castShadow = true;
  kart.add(nose);

  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.9, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.7 }),
  );
  seat.position.set(0, 1.12, 0.35);
  seat.castShadow = true;
  kart.add(seat);

  const wheelGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.38, 20);
  const wheelPositions: ReadonlyArray<readonly [number, number, number]> = [
    [-1.18, 0.48, -1.05],
    [1.18, 0.48, -1.05],
    [-1.18, 0.48, 1.08],
    [1.18, 0.48, 1.08],
  ];

  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    kart.add(wheel);
  }

  kart.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.receiveShadow = true;
    }
  });

  return kart;
}
