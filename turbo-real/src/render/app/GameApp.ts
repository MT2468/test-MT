import * as THREE from 'three';
import { KeyboardInput } from '../../input/KeyboardInput';
import { KartPhysics } from '../../physics/KartPhysics';
import { AIFleetController } from '../../simulation/AIController';
import { FinanceController } from '../../simulation/finance/FinanceController';
import { ItemController } from '../../simulation/items/ItemController';
import type { RacerItemState } from '../../simulation/items/types';
import { RaceController } from '../../simulation/RaceController';
import type { GameState } from '../../simulation/state';
import type { VehicleState } from '../../simulation/vehicle';
import type { TrackDefinition } from '../../track/firstTrack';
import { ChaseCamera } from '../camera/ChaseCamera';
import { createItemScene, type ItemSceneController } from '../items/createItemScene';
import { createKart, type KartVisual } from '../objects/createKart';
import { createRaceMarkers } from '../race/createRaceMarkers';
import { createTrackScene } from '../track/createTrackScene';

export class GameApp {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(56, 1, 0.1, 520);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  private readonly kart = createKart();
  private readonly rivalKarts = new Map<string, KartVisual>();
  private readonly input = new KeyboardInput();
  private readonly chaseCamera = new ChaseCamera(this.camera);
  private readonly itemScene: ItemSceneController;
  private readonly resizeObserver: ResizeObserver;
  private previousTime = performance.now();

  constructor(
    private readonly container: HTMLElement,
    private readonly state: GameState,
    private readonly physics: KartPhysics,
    private readonly race: RaceController,
    private readonly ai: AIFleetController,
    private readonly items: ItemController,
    private readonly finance: FinanceController,
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

    for (const rival of this.state.rivals) {
      this.rivalKarts.set(
        rival.id,
        createKart({
          name: `rival-${rival.id}`,
          bodyColor: rival.profile.bodyColor,
          accentColor: rival.profile.accentColor,
        }),
      );
    }

    this.itemScene = createItemScene(this.state.itemWorld);
    this.buildCircuitScene(track);
    this.syncKartVisual(this.kart, this.state.vehicle, this.state.items, 0);
    this.syncRivalKarts(0);
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
    this.scene.add(createRaceMarkers(track));
    this.scene.add(this.itemScene.group);
    this.scene.add(this.kart.group);
    for (const visual of this.rivalKarts.values()) this.scene.add(visual.group);
  }

  private render(time: number): void {
    const deltaSeconds = Math.min((time - this.previousTime) / 1000, 0.1);
    this.previousTime = time;

    const rivalInputs = this.ai.readInputs(this.state.vehicle);
    this.physics.advance(
      this.input.readDrivingInput(),
      rivalInputs,
      deltaSeconds,
      this.state.vehicle,
      this.state.items,
      this.state.rivals,
    );
    this.race.advance(deltaSeconds, this.state.vehicle);
    this.ai.advanceRace(deltaSeconds, this.state.race);
    this.items.advance(deltaSeconds, this.input.consumeUseItem(), this.physics);
    this.finance.advance(deltaSeconds, this.input.consumeFinanceAction(), this.state.race);
    if (this.state.race.finished) this.state.phase = 'finished';

    this.itemScene.update(time / 1000, this.state.itemWorld);
    this.syncKartVisual(this.kart, this.state.vehicle, this.state.items, deltaSeconds);
    this.syncRivalKarts(deltaSeconds);
    this.chaseCamera.update(this.state.vehicle, deltaSeconds);
    this.onStateUpdate(this.state);
    this.renderer.render(this.scene, this.camera);
  }

  private syncRivalKarts(deltaSeconds: number): void {
    for (const rival of this.state.rivals) {
      const visual = this.rivalKarts.get(rival.id);
      if (visual) this.syncKartVisual(visual, rival.vehicle, rival.items, deltaSeconds);
    }
  }

  private syncKartVisual(
    visual: KartVisual,
    vehicle: VehicleState,
    items: RacerItemState,
    deltaSeconds: number,
  ): void {
    visual.group.position.set(vehicle.x, vehicle.y, vehicle.z);
    visual.group.rotation.y = -vehicle.heading;
    visual.updateMotion({
      speed: vehicle.speed,
      steering: -vehicle.steering,
      drifting: vehicle.drifting,
      lateralSpeed: vehicle.lateralSpeed,
      boostRemaining: vehicle.boostRemaining,
      shieldRemaining: items.shieldRemaining,
      slowRemaining: items.slowRemaining,
      hitFlashSeconds: items.hitFlashSeconds,
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
