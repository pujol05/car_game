// Cel amb gradient, sol i estrelles, i els presets de l'hora del dia.

import * as THREE from 'three';
import type { TimeOfDay } from '../core/settings';

export interface TimePreset {
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  sunColor: number;
  /** Direcció cap al sol (o la lluna). */
  sunDir: [number, number, number];
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fogNear: number;
  fogFar: number;
  ground: number;
  exposure: number;
  stars: number;
  /** Activa els llums de nit (fars, fanals). */
  night: boolean;
}

export const TIME_PRESETS: Record<TimeOfDay, TimePreset> = {
  day: {
    skyTop: 0x2f86e0,
    skyHorizon: 0xc4ecff,
    skyBottom: 0x8fcf7a,
    sunColor: 0xfff4e0,
    sunDir: [0.5, 0.8, 0.35],
    sunIntensity: 2.3,
    hemiSky: 0xd6efff,
    hemiGround: 0x5b8f3c,
    hemiIntensity: 1.35,
    fogNear: 300,
    fogFar: 1400,
    ground: 0x6cc24a,
    exposure: 1,
    stars: 0,
    night: false,
  },
  sunset: {
    skyTop: 0x2d2f7a,
    skyHorizon: 0xff9152,
    skyBottom: 0x5b3a54,
    sunColor: 0xffa15c,
    sunDir: [-0.75, 0.12, -0.65],
    sunIntensity: 2,
    hemiSky: 0xffc39a,
    hemiGround: 0x4a3552,
    hemiIntensity: 0.95,
    fogNear: 220,
    fogFar: 1100,
    ground: 0x7c9a44,
    exposure: 1,
    stars: 0.15,
    night: false,
  },
  night: {
    skyTop: 0x02030f,
    skyHorizon: 0x152452,
    skyBottom: 0x070b1a,
    sunColor: 0xbfd0ff,
    sunDir: [0.3, 0.7, -0.6],
    sunIntensity: 0.45,
    hemiSky: 0x40508f,
    hemiGround: 0x0b1020,
    hemiIntensity: 0.45,
    fogNear: 150,
    fogFar: 900,
    ground: 0x24452e,
    exposure: 1.1,
    stars: 1,
    night: true,
  },
};

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 bottomColor;
  uniform vec3 sunColor;
  uniform vec3 sunDir;
  uniform float stars;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0
      ? mix(horizonColor, topColor, pow(h, 0.55))
      : mix(horizonColor, bottomColor, pow(-h, 0.35));
    float s = max(dot(d, normalize(sunDir)), 0.0);
    col += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 10.0) * 0.3);
    if (stars > 0.0 && h > 0.02) {
      float star = step(0.9965, hash(floor(d * 260.0)));
      col += vec3(star) * stars * smoothstep(0.02, 0.3, h);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = {
    topColor: { value: new THREE.Color() },
    horizonColor: { value: new THREE.Color() },
    bottomColor: { value: new THREE.Color() },
    sunColor: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    stars: { value: 0 },
  };

  constructor() {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(2800, 32, 16), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  apply(p: TimePreset): void {
    const u = this.uniforms;
    u.topColor.value.setHex(p.skyTop);
    u.horizonColor.value.setHex(p.skyHorizon);
    u.bottomColor.value.setHex(p.skyBottom);
    u.sunColor.value.setHex(p.sunColor);
    u.sunDir.value.set(...p.sunDir).normalize();
    u.stars.value = p.stars;
  }

  /** El cel sempre està centrat a la càmera. */
  follow(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
  }
}
