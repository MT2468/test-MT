import * as THREE from 'three';
import type { ItemWorldState } from '../../simulation/items/types';

export interface ItemSceneController {
  readonly group: THREE.Group;
  update(elapsedSeconds: number, world: ItemWorldState): void;
}

function createBoxVisual(): THREE.Group {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.78, 0),
    new THREE.MeshStandardMaterial({
      color: 0x52f0c0,
      emissive: 0x0a8063,
      emissiveIntensity: 1.35,
      roughness: 0.28,
      metalness: 0.18,
      transparent: true,
      opacity: 0.9,
    }),
  );
  core.castShadow = true;
  group.add(core);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.02, 0.08, 8, 24),
    new THREE.MeshStandardMaterial({
      color: 0xf7c948,
      emissive: 0x8c6500,
      emissiveIntensity: 1.1,
      roughness: 0.4,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  return group;
}

function createHazardVisual(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 1.55, 0.11, 20),
    new THREE.MeshStandardMaterial({
      color: 0xf05b85,
      emissive: 0x7f183c,
      emissiveIntensity: 0.75,
      roughness: 0.65,
      transparent: true,
      opacity: 0.86,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

export function createItemScene(world: ItemWorldState): ItemSceneController {
  const group = new THREE.Group();
  group.name = 'item-world';
  const boxVisuals = new Map<string, THREE.Group>();
  const hazardVisuals = new Map<string, THREE.Mesh>();

  for (const box of world.boxes) {
    const visual = createBoxVisual();
    visual.position.set(box.x, 1.15, box.z);
    boxVisuals.set(box.id, visual);
    group.add(visual);
  }

  return {
    group,
    update(elapsedSeconds, nextWorld): void {
      for (const box of nextWorld.boxes) {
        const visual = boxVisuals.get(box.id);
        if (!visual) continue;
        visual.visible = box.respawnRemaining <= 0;
        if (!visual.visible) continue;
        visual.rotation.y = elapsedSeconds * 1.6 + box.x * 0.01;
        visual.rotation.x = Math.sin(elapsedSeconds * 0.7 + box.z * 0.02) * 0.12;
        visual.position.y = 1.18 + Math.sin(elapsedSeconds * 2.2 + box.x * 0.035) * 0.16;
      }

      const activeHazards = new Set(nextWorld.hazards.map((hazard) => hazard.id));
      for (const [id, visual] of hazardVisuals) {
        if (activeHazards.has(id)) continue;
        group.remove(visual);
        visual.geometry.dispose();
        if (Array.isArray(visual.material)) {
          for (const material of visual.material) material.dispose();
        } else {
          visual.material.dispose();
        }
        hazardVisuals.delete(id);
      }

      for (const hazard of nextWorld.hazards) {
        let visual = hazardVisuals.get(hazard.id);
        if (!visual) {
          visual = createHazardVisual();
          visual.position.set(hazard.x, 0.075, hazard.z);
          hazardVisuals.set(hazard.id, visual);
          group.add(visual);
        }
        const pulse = 0.92 + Math.sin(elapsedSeconds * 4.4 + hazard.x) * 0.06;
        visual.scale.set(pulse, 1, pulse);
        visual.rotation.y = elapsedSeconds * 0.45;
      }
    },
  };
}
