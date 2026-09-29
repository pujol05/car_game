// Escena de three.js: renderer, cel, llums, boira i terra.

import * as THREE from 'three';
import type { Quality, TimeOfDay } from '../core/settings';
import { GROUND_Y } from '../track/grid';
import { Sky, TIME_PRESETS, type TimePreset } from './sky';

export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sky = new Sky();
  private readonly fog = new THREE.Fog(0xffffff, 300, 1400);
  private readonly groundMaterial = new THREE.MeshStandardMaterial({ roughness: 1 });
  private readonly sunDir = new THREE.Vector3(0, 1, 0);
  preset: TimePreset = TIME_PRESETS.day;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 3000);
    this.scene.fog = this.fog;
    this.scene.add(this.sky.mesh);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -45;
    cam.right = 45;
    cam.top = 45;
    cam.bottom = -45;
    cam.near = 1;
    cam.far = 400;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), this.groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = GROUND_Y;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.setTimeOfDay('day');
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get isNight(): boolean {
    return this.preset.night;
  }

  /** Qualitat gràfica: resolució interna i ombres. */
  setQuality(quality: Quality): void {
    const dpr = window.devicePixelRatio || 1;
    const ratio =
      quality === 'high' ? Math.min(dpr, 2) : quality === 'medium' ? Math.min(dpr, 1.25) : 0.85;
    this.renderer.setPixelRatio(ratio);
    this.sun.castShadow = quality !== 'low';
    const size = quality === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
  }

  setTimeOfDay(time: TimeOfDay): void {
    const p = TIME_PRESETS[time];
    this.preset = p;
    this.sky.apply(p);
    this.fog.color.setHex(p.skyHorizon);
    this.fog.near = p.fogNear;
    this.fog.far = p.fogFar;
    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.sun.color.setHex(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.sunDir.set(...p.sunDir).normalize();
    this.groundMaterial.color.setHex(p.ground);
    this.renderer.toneMappingExposure = p.exposure;
  }

  /** La llum del sol segueix el cotxe perquè les ombres siguin nítides. */
  followTarget(target: THREE.Vector3): void {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, 150);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.sky.follow(this.camera);
    this.renderer.render(this.scene, this.camera);
  }
}
