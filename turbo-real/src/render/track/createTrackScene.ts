import * as THREE from 'three';
import type { TrackDefinition, TrackSample } from '../../track/firstTrack';

const ROAD_Y = 0.035;

function createRoad(track: TrackDefinition): THREE.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const sample of track.samples) {
    positions.push(sample.leftEdgeX, ROAD_Y, sample.leftEdgeZ);
    positions.push(sample.rightEdgeX, ROAD_Y, sample.rightEdgeZ);
  }

  for (let index = 0; index < track.samples.length; index += 1) {
    const next = (index + 1) % track.samples.length;
    const left = index * 2;
    const right = left + 1;
    const nextLeft = next * 2;
    const nextRight = nextLeft + 1;
    indices.push(left, right, nextLeft, right, nextRight, nextLeft);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const road = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0x30343d, roughness: 0.94, metalness: 0.02 }),
  );
  road.receiveShadow = true;
  return road;
}

function segmentTransform(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  y: number,
  matrix: THREE.Matrix4,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const position = new THREE.Vector3((ax + bx) * 0.5, y, (az + bz) * 0.5);
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  matrix.compose(position, rotation, new THREE.Vector3(1, 1, length));
  return length;
}

function createCurbs(track: TrackDefinition): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(0.72, 0.13, 1);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.78, vertexColors: true });
  const curbs = new THREE.InstancedMesh(geometry, material, track.samples.length * 2);
  const matrix = new THREE.Matrix4();
  const primary = new THREE.Color(track.visuals.curbPrimary);
  const secondary = new THREE.Color(track.visuals.curbSecondary);
  let instance = 0;

  for (let index = 0; index < track.samples.length; index += 1) {
    const next = (index + 1) % track.samples.length;
    const a = track.samples[index];
    const b = track.samples[next];

    segmentTransform(a.leftEdgeX, a.leftEdgeZ, b.leftEdgeX, b.leftEdgeZ, 0.075, matrix);
    curbs.setMatrixAt(instance, matrix);
    curbs.setColorAt(instance, Math.floor(index / 2) % 2 === 0 ? primary : secondary);
    instance += 1;

    segmentTransform(a.rightEdgeX, a.rightEdgeZ, b.rightEdgeX, b.rightEdgeZ, 0.075, matrix);
    curbs.setMatrixAt(instance, matrix);
    curbs.setColorAt(instance, Math.floor(index / 2) % 2 === 0 ? secondary : primary);
    instance += 1;
  }

  curbs.castShadow = true;
  curbs.receiveShadow = true;
  curbs.instanceMatrix.needsUpdate = true;
  if (curbs.instanceColor) curbs.instanceColor.needsUpdate = true;
  return curbs;
}

function createBarriers(track: TrackDefinition): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(0.48, 1.08, 1);
  const material = new THREE.MeshStandardMaterial({
    color: track.visuals.barrierColor,
    roughness: 0.76,
    metalness: 0.08,
  });
  const barriers = new THREE.InstancedMesh(geometry, material, track.samples.length * 2);
  const matrix = new THREE.Matrix4();
  let instance = 0;

  for (let index = 0; index < track.samples.length; index += 1) {
    const next = (index + 1) % track.samples.length;
    const a = track.samples[index];
    const b = track.samples[next];

    segmentTransform(a.leftBarrierX, a.leftBarrierZ, b.leftBarrierX, b.leftBarrierZ, 0.54, matrix);
    barriers.setMatrixAt(instance, matrix);
    instance += 1;

    segmentTransform(a.rightBarrierX, a.rightBarrierZ, b.rightBarrierX, b.rightBarrierZ, 0.54, matrix);
    barriers.setMatrixAt(instance, matrix);
    instance += 1;
  }

  barriers.castShadow = true;
  barriers.receiveShadow = true;
  barriers.instanceMatrix.needsUpdate = true;
  return barriers;
}

function addStartGrid(group: THREE.Group, track: TrackDefinition): void {
  const start = track.samples[0];
  const heading = Math.atan2(start.tangentX, start.tangentZ);
  const tileCount = 12;
  const rows = 2;
  const tileWidth = (track.halfWidth * 2) / tileCount;
  const tileLength = 0.72;
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x1e2329, roughness: 0.82 });
  const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f6f7, roughness: 0.82 });

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < tileCount; column += 1) {
      const across = -track.halfWidth + tileWidth * (column + 0.5);
      const along = (row - 0.5) * tileLength;
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(tileWidth * 0.98, 0.035, tileLength * 0.98),
        (row + column) % 2 === 0 ? lightMaterial : darkMaterial,
      );
      tile.position.set(
        start.x + start.rightX * across + start.tangentX * along,
        0.075,
        start.z + start.rightZ * across + start.tangentZ * along,
      );
      tile.rotation.y = heading;
      tile.receiveShadow = true;
      group.add(tile);
    }
  }
}

function addStartArch(group: THREE.Group, track: TrackDefinition): void {
  const start = track.samples[0];
  const heading = Math.atan2(start.tangentX, start.tangentZ);
  const postMaterial = new THREE.MeshStandardMaterial({ color: track.visuals.curbPrimary, roughness: 0.52 });
  const beamMaterial = new THREE.MeshStandardMaterial({
    color: track.visuals.accentColor,
    emissive: track.visuals.accentColor,
    emissiveIntensity: 0.12,
    roughness: 0.48,
  });
  const postDistance = track.barrierOffset + 1.15;

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.72, 5.8, 0.72), postMaterial);
    post.position.set(
      start.x + start.rightX * postDistance * side,
      2.9,
      start.z + start.rightZ * postDistance * side,
    );
    post.castShadow = true;
    group.add(post);
  }

  const beam = new THREE.Mesh(new THREE.BoxGeometry(postDistance * 2 + 0.8, 0.72, 0.82), beamMaterial);
  beam.position.set(start.x, 5.45, start.z);
  beam.rotation.y = heading;
  beam.castShadow = true;
  group.add(beam);
}

function addGround(group: THREE.Group, track: TrackDefinition): void {
  const centerX = (track.bounds.minX + track.bounds.maxX) * 0.5;
  const centerZ = (track.bounds.minZ + track.bounds.maxZ) * 0.5;
  const width = track.bounds.maxX - track.bounds.minX + 100;
  const depth = track.bounds.maxZ - track.bounds.minZ + 100;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: track.visuals.groundColor, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centerX, -0.02, centerZ);
  ground.receiveShadow = true;
  group.add(ground);
}

function addPalm(group: THREE.Group, x: number, z: number, scale: number): void {
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8c5b32, roughness: 0.92 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x18824a, roughness: 0.86 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * scale, 0.38 * scale, 4.8 * scale, 8), trunkMaterial);
  trunk.position.set(x, 2.4 * scale, z);
  trunk.castShadow = true;
  group.add(trunk);

  for (let index = 0; index < 6; index += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.48 * scale, 3.2 * scale, 5), leafMaterial);
    leaf.position.set(x, 5.05 * scale, z);
    leaf.rotation.z = Math.PI / 2.8;
    leaf.rotation.y = (index / 6) * Math.PI * 2;
    leaf.castShadow = true;
    group.add(leaf);
  }
}

function addBuilding(
  group: THREE.Group,
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  color: number,
  roofColor: number,
): void {
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.08 }),
  );
  building.position.set(x, height * 0.5, z);
  building.castShadow = true;
  building.receiveShadow = true;
  group.add(building);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.72, 0.35, depth * 0.72),
    new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.64 }),
  );
  roof.position.set(x, height + 0.18, z);
  roof.castShadow = true;
  group.add(roof);
}

function addUrbanScenery(group: THREE.Group, track: TrackDefinition): void {
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(26, 26, 0.12, 48),
    new THREE.MeshStandardMaterial({ color: 0xd8c99b, roughness: 0.96 }),
  );
  plaza.position.set(-2, 0.02, 0);
  plaza.receiveShadow = true;
  group.add(plaza);

  const palms: ReadonlyArray<readonly [number, number, number]> = [
    [-20, 18, 1], [0, 22, 0.9], [20, 14, 1.08], [-24, -10, 0.92], [2, -18, 1.05], [24, -12, 0.88],
  ];
  for (const [x, z, scale] of palms) addPalm(group, x, z, scale);

  const buildings: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    [104, 58, 18, 20, 20, 0x6ba6b8], [108, 18, 16, 18, 30, 0xe08f62], [102, -34, 22, 16, 24, 0x7b8fc5],
    [78, -90, 24, 18, 18, 0xd26f68], [28, -103, 18, 22, 28, 0x6ca879], [-42, -102, 24, 18, 22, 0xc58e60],
    [-104, -62, 18, 22, 27, 0x718eb1], [-112, -8, 22, 18, 20, 0xc77b74], [-102, 50, 20, 22, 29, 0x6fa68b],
    [28, 106, 22, 18, 25, 0xb77eaa],
  ];
  for (const [x, z, width, depth, height, color] of buildings) {
    addBuilding(group, x, z, width, depth, height, color, track.visuals.accentColor);
  }
}

function addMarketStall(group: THREE.Group, x: number, z: number, color: number, accent: number): void {
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 1.5, 3.4),
    new THREE.MeshStandardMaterial({ color, roughness: 0.88 }),
  );
  base.position.set(x, 0.75, z);
  base.castShadow = true;
  group.add(base);

  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 0.28, 4.1),
    new THREE.MeshStandardMaterial({ color: accent, roughness: 0.74 }),
  );
  awning.position.set(x, 2.15, z);
  awning.castShadow = true;
  group.add(awning);
}

function addMarketScenery(group: THREE.Group, track: TrackDefinition): void {
  const colors = [0xe87359, 0x4f9fd1, 0xf0b74b, 0x52a86d];
  for (let row = -2; row <= 2; row += 1) {
    for (let column = -2; column <= 2; column += 1) {
      if (Math.abs(row) === 2 && Math.abs(column) === 2) continue;
      addMarketStall(
        group,
        column * 8.2,
        row * 7.1,
        colors[(row + column + 8) % colors.length],
        (row + column) % 2 === 0 ? track.visuals.accentColor : 0xf3e5c2,
      );
    }
  }

  for (const [x, z] of [[-30, 24], [30, 24], [-28, -25], [28, -25]] as const) addPalm(group, x, z, 0.78);
}

function addBudgetScenery(group: THREE.Group, track: TrackDefinition): void {
  const towerColors = [0x4b6f8f, 0x607f9c, 0x55776d, 0x68759c];
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    const radius = index % 2 === 0 ? 34 : 24;
    const height = 13 + (index % 4) * 5;
    addBuilding(
      group,
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      8 + (index % 3) * 2,
      8 + ((index + 1) % 3) * 2,
      height,
      towerColors[index % towerColors.length],
      track.visuals.accentColor,
    );
  }

  const ledger = new THREE.Group();
  for (let index = 0; index < 5; index += 1) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2 + index * 1.35, 2.2),
      new THREE.MeshStandardMaterial({ color: index % 2 === 0 ? 0x65d6a6 : 0x7898ff, roughness: 0.48 }),
    );
    bar.position.set(-6 + index * 3, 1 + index * 0.675, 0);
    bar.castShadow = true;
    ledger.add(bar);
  }
  group.add(ledger);
}

function addLamp(group: THREE.Group, x: number, z: number, color: number): void {
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.16, 4.8, 7),
    new THREE.MeshStandardMaterial({ color: 0x26333a, roughness: 0.72 }),
  );
  post.position.set(x, 2.4, z);
  post.castShadow = true;
  group.add(post);

  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshBasicMaterial({ color }),
  );
  lamp.position.set(x, 4.85, z);
  group.add(lamp);
}

function addMonthEndScenery(group: THREE.Group, track: TrackDefinition): void {
  const center = new THREE.Mesh(
    new THREE.CylinderGeometry(29, 29, 0.14, 40),
    new THREE.MeshStandardMaterial({ color: 0x28323b, roughness: 0.95 }),
  );
  center.position.y = 0.01;
  center.receiveShadow = true;
  group.add(center);

  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const radius = 33;
    addLamp(group, Math.cos(angle) * radius, Math.sin(angle) * radius, index % 2 === 0 ? 0xffc857 : 0xff86aa);
  }

  const lowBuildings: ReadonlyArray<readonly [number, number, number, number, number]> = [
    [-26, 8, 8, 8, 6], [25, 12, 10, 7, 8], [-18, -20, 9, 9, 7], [20, -19, 8, 10, 6],
  ];
  for (const [x, z, width, depth, height] of lowBuildings) {
    addBuilding(group, x, z, width, depth, height, 0x4c596a, track.visuals.accentColor);
  }
}

function addScenery(group: THREE.Group, track: TrackDefinition): void {
  addGround(group, track);
  if (track.visuals.theme === 'market') addMarketScenery(group, track);
  else if (track.visuals.theme === 'budget') addBudgetScenery(group, track);
  else if (track.visuals.theme === 'month-end') addMonthEndScenery(group, track);
  else addUrbanScenery(group, track);
}

export function createTrackScene(track: TrackDefinition): THREE.Group {
  const group = new THREE.Group();
  group.name = `track-${track.id}`;
  addScenery(group, track);
  group.add(createRoad(track));
  group.add(createCurbs(track));
  group.add(createBarriers(track));
  addStartGrid(group, track);
  addStartArch(group, track);
  return group;
}

export function getTrackSample(track: TrackDefinition, index: number): TrackSample {
  return track.samples[((index % track.samples.length) + track.samples.length) % track.samples.length];
}
