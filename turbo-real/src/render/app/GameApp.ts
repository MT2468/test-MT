import * as THREE from 'three';
import { KeyboardInput } from '../../input/KeyboardInput';
import { KartPhysics } from '../../physics/KartPhysics';
import type { GameState } from '../../simulation/state';
import { ChaseCamera } from '../camera/ChaseCamera';
import { createKart } from '../objects/createKart';

export class GameApp {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(56, 1, 0.1, 340);
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
    private readonly onStateUpdate: (state: GameState) => void = () => {},
  ) {
    this.scene.background = new THREE.Color(0x8fd8ff);
    this.scene.fog = new THREE.Fog(0x8fd8ff, 70, 210);

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.append(this.renderer.domElement);

    this.buildPracticeScene();
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

  private buildPracticeScene(): void {
    this.scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x154425, 2.1));

    const sun = new THREE.DirectionalLight(0xffffff, 3.2);
    sun.position.set(-18, 24, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    sun.shadow.camera.left = -36;
    sun.shadow.camera.right = 36;
    sun.shadow.camera.top = 36;
    sun.shadow.camera.bottom = -36;
    this.scene.add(sun);

    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 330),
      new THREE.MeshStandardMaterial({ color: 0x257b43, roughness: 1 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.scene.add(grass);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 300),
      new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 0.96 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.015;
    road.receiveShadow = true;
    this.scene.add(road);

    const stripeGeometry = new THREE.BoxGeometry(0.18, 0.035, 3.4);
    const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xffe36b, roughness: 0.75 });
    for (let z = -138; z <= 138; z += 8) {
      const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
      stripe.position.set(0, 0.045, z);
      stripe.receiveShadow = true;
      this.scene.add(stripe);
    }

    const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0xf3f5f7, roughness: 0.78 });
    for (const x of [-9.35, 9.35]) {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.1, 300), barrierMaterial);
      barrier.position.set(x, 0.55, 0);
      barrier.receiveShadow = true;
      barrier.castShadow = true;
      this.scene.add(barrier);
    }

    const startLine = new THREE.Mesh(
      new THREE.BoxGeometry(17.6, 0.04, 0.8),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 }),
    );
    startLine.position.set(0, 0.05, 22);
    startLine.receiveShadow = true;
    this.scene.add(startLine);

    this.addPracticeGate(-85);
    this.addPracticeGate(85);
    this.addCollisionBlock(-3.4, -36);
    this.addCollisionBlock(3.4, -58);
    this.scene.add(this.kart.group);
  }

  private addPracticeGate(z: number): void {
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x1ba65a, roughness: 0.55 });
    const beamMaterial = new THREE.MeshStandardMaterial({ color: 0xf7c948, roughness: 0.55 });

    for (const x of [-10.8, 10.8]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 5.5, 0.55), postMaterial);
      post.position.set(x, 2.75, z);
      post.castShadow = true;
      this.scene.add(post);
    }

    const beam = new THREE.Mesh(new THREE.BoxGeometry(22.2, 0.55, 0.55), beamMaterial);
    beam.position.set(0, 5.3, z);
    beam.castShadow = true;
    this.scene.add(beam);
  }

  private addCollisionBlock(x: number, z: number): void {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 1.4, 3.6),
      new THREE.MeshStandardMaterial({
        color: 0xff8a2b,
        emissive: 0x8a2600,
        emissiveIntensity: 0.28,
        roughness: 0.62,
      }),
    );
    block.position.set(x, 0.7, z);
    block.castShadow = true;
    block.receiveShadow = true;
    this.scene.add(block);
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
    this.kart.group.rotation.y = vehicle.heading;
    this.kart.updateMotion({
      speed: vehicle.speed,
      steering: vehicle.steering,
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
