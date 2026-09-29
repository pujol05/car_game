// Sistema de partícules simple amb THREE.Points (una sola crida de dibuix).
// Les partícules són només visuals: fan servir Math.random lliurement.

import * as THREE from 'three';

const vertexShader = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  uniform float scale;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vAlpha = alpha;
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.15, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vTint, a);
    #include <colorspace_fragment>
  }
`;

export interface EmitOptions {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: THREE.Color;
  size: number;
  /** Creixement de la mida per segon. */
  growth: number;
  life: number;
  alpha: number;
  gravity: number;
  /** Fregament de l'aire (1/s). */
  drag: number;
}

export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly tint: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly baseAlpha: Float32Array;
  private readonly growth: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private next = 0;
  private alive = 0;

  constructor(
    private readonly capacity: number,
    additive: boolean,
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.tint = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.baseAlpha = new Float32Array(capacity);
    this.growth = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 500 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  emit(o: EmitOptions): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.pos.set([o.x, o.y, o.z], i * 3);
    this.vel.set([o.vx, o.vy, o.vz], i * 3);
    this.tint.set([o.color.r, o.color.g, o.color.b], i * 3);
    this.size[i] = o.size;
    this.age[i] = 0;
    this.life[i] = o.life;
    this.baseAlpha[i] = o.alpha;
    this.alpha[i] = o.alpha;
    this.growth[i] = o.growth;
    this.gravity[i] = o.gravity;
    this.drag[i] = o.drag;
    this.alive = Math.min(this.capacity, this.alive + 1);
  }

  update(dt: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    this.material.uniforms.scale.value =
      viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    if (this.alive === 0) return;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        this.life[i] = 0;
        this.alpha[i] = 0;
        this.size[i] = 0;
        this.alive--;
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      const j = i * 3;
      this.vel[j] *= k;
      this.vel[j + 1] = this.vel[j + 1] * k - this.gravity[i] * dt;
      this.vel[j + 2] *= k;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] += this.growth[i] * dt;
      this.alpha[i] = this.baseAlpha[i] * (1 - t) * Math.min(1, t * 8);
    }
    for (const name of ['position', 'size', 'alpha', 'tint']) {
      (this.geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  clear(): void {
    this.life.fill(0);
    this.alpha.fill(0);
    this.size.fill(0);
    this.alive = 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}
