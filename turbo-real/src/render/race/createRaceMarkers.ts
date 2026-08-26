import * as THREE from 'three';
import type { TrackDefinition } from '../../track/firstTrack';

export function createRaceMarkers(track: TrackDefinition): THREE.Group {
  const group = new THREE.Group();
  group.name = `race-markers-${track.id}`;

  const stripGeometry = new THREE.BoxGeometry(track.halfWidth * 2 - 1.2, 0.025, 0.5);
  const stripMaterial = new THREE.MeshStandardMaterial({
    color: 0x63e6ff,
    emissive: 0x0c6575,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.42,
    roughness: 0.55,
  });
  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7c948,
    emissive: 0x6b4f00,
    emissiveIntensity: 0.45,
    roughness: 0.48,
  });

  for (const sampleIndex of track.race.checkpointSampleIndices.slice(1)) {
    const sample = track.samples[sampleIndex];
    const heading = Math.atan2(sample.tangentX, sample.tangentZ);

    const strip = new THREE.Mesh(stripGeometry, stripMaterial);
    strip.position.set(sample.x, 0.073, sample.z);
    strip.rotation.y = heading;
    strip.receiveShadow = true;
    group.add(strip);

    for (const side of [-1, 1]) {
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.5, 8), beaconMaterial);
      beacon.position.set(
        sample.x + sample.rightX * (track.halfWidth - 0.65) * side,
        0.76,
        sample.z + sample.rightZ * (track.halfWidth - 0.65) * side,
      );
      beacon.castShadow = true;
      group.add(beacon);
    }
  }

  return group;
}
