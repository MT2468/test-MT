import * as THREE from 'three';
import { KeyboardInput } from '../../input/KeyboardInput';
import { KartPhysics } from '../../physics/KartPhysics';
import type { GameState } from '../../simulation/state';
import type { TrackDefinition } from '../../track/firstTrack';
import { ChaseCamera } from '../camera/ChaseCamera';
import { createKart } from '../objects/createKart';
import { createTrackScene } from '../track/createTrackScene';

export class GameApp {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(56, 1, 0.1, 520);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  private readonly kart = createKart();
  private readonly input = new KeyboardInput();
  private readonly chaseCamera = new ChaseCamera(this.camera);
  private readonly resizeObserver: ResizeObserver;
  private previousTime = performance.now();

  constructor(
    private readonly container: HTMLElement,
    private readonly state: GameState,
    private readonly physics: KartPhysics,
    track: TrackDefinition,
    private readonly onStateUpdate: (state: GameState) => void = () => {},
  ) {
    this.scene.background = new THREE.Color(0x8fd8ff);
    this.scene.fog = new THREE.Fog(0x8fd8ff, 115, 350);

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.append(this.renderer.domElement);

    this.buildCircuitScene(track);
    this.syncKart(0);
    this.chaseCamera.reset(this.state.vehicle);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
  }

  start(): void {
    this.previousTime = performance.now();
    this.onStateUpdate(this.state);
    this.renderer.setAnimationLoop((time) => this.render(time));
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.input.dispose();
    this.physics.dispose();
    this.resizeObserver.disconnect();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private buildCircuitScene(track: TrackDefinition): void {
    this.scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x154425, 2.25));

    const sun = new THREE.DirectionalLight(0xffffff, 3.35);
    sun.position.set(-72, 110, 48);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 300;
    sun.shadow.camera.left = -145;
    sun.shadow.camera.right = 145;
    sun.shadow.camera.top = 145;
    sun.shadow.camera.bottom = -145;
    sun.shadow.bias = -0.00012;
    this.scene.add(sun);

    this.scene.add(createTrackScene(track));
    this.scene.add(this.kart.group);
  }

  private render(time: number): void {
    const deltaSeconds = Math.min((time - this.previousTime) / 1000, 0.1);
    this.previousTime = time;

    this.physics.advance(this.input.readDrivingInput(), deltaSeconds, this.state.vehicle);
    this.syncKart(deltaSeconds);
    this.chaseCamera.update(this.state.vehicle, deltaSeconds);
    this.onStateUpdate(this.state);
    this.renderer.render(this.scene, this.camera);
  }

  private syncKart(deltaSeconds: number): void {
    const { vehicle } = this.state;
    this.kart.group.position.set(vehicle.x, vehicle.y, vehicle.z);
    this.kart.group.rotation.y = -vehicle.heading;
    this.kart.updateMotion({
      speed: vehicle.speed,
      steering: -vehicle.steering,
      drifting: vehicle.drifting,
      lateralSpeed: vehicle.lateralSpeed,
      boostRemaining: vehicle.boostRemaining,
      deltaSeconds,
    });
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
