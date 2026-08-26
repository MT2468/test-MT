import * as THREE from 'three';
import { createBootKart } from '../objects/createBootKart';

export class GameApp {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 220);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  private readonly kart = createBootKart();
  private readonly resizeObserver: ResizeObserver;
  private startTime = performance.now();

  constructor(private readonly container: HTMLElement) {
    this.scene.background = new THREE.Color(0x8fd8ff);
    this.scene.fog = new THREE.Fog(0x8fd8ff, 45, 115);

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.append(this.renderer.domElement);

    this.camera.position.set(8.5, 6.3, 11.5);
    this.camera.lookAt(0, 0.9, 0);

    this.buildBootScene();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
  }

  start(): void {
    this.startTime = performance.now();
    this.renderer.setAnimationLoop((time) => this.render(time));
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
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

  private buildBootScene(): void {
    const hemisphere = new THREE.HemisphereLight(0xeaf8ff, 0x154425, 2.1);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xffffff, 3.2);
    sun.position.set(-8, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 55;
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -22;
    this.scene.add(sun);

    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 120),
      new THREE.MeshStandardMaterial({ color: 0x257b43, roughness: 1 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.scene.add(grass);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 92),
      new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 0.96 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.015;
    road.receiveShadow = true;
    this.scene.add(road);

    const stripeGeometry = new THREE.BoxGeometry(0.16, 0.035, 3.2);
    const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xffe36b, roughness: 0.75 });
    for (let z = -38; z <= 38; z += 7) {
      const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
      stripe.position.set(0, 0.045, z);
      stripe.receiveShadow = true;
      this.scene.add(stripe);
    }

    const curbMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.85 });
    for (const x of [-7.15, 7.15]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 92), curbMaterial);
      curb.position.set(x, 0.09, 0);
      curb.receiveShadow = true;
      curb.castShadow = true;
      this.scene.add(curb);
    }

    this.kart.position.set(0, 0, 1.3);
    this.kart.rotation.y = Math.PI;
    this.scene.add(this.kart);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.3, 0.09, 12, 56),
      new THREE.MeshStandardMaterial({ color: 0x45f38f, emissive: 0x0a6a35, emissiveIntensity: 1.4 }),
    );
    ring.name = 'boot-ring';
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.12, 1.3);
    this.scene.add(ring);
  }

  private render(time: number): void {
    const elapsed = (time - this.startTime) / 1000;
    this.kart.position.y = Math.sin(elapsed * 1.7) * 0.035;
    this.kart.rotation.y = Math.PI + Math.sin(elapsed * 0.55) * 0.035;
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
