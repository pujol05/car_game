// Marques de pneumàtics: tires de quadrilàters sobre la superfície, en un
// buffer circular (les més antigues es van reemplaçant).

import * as THREE from 'three';
import { Surface } from '../physics/collision';
import type { Vehicle } from '../physics/vehicle';

const MAX_SEGMENTS = 3000;
const WIDTH = 0.34;
const MIN_STEP = 0.35;
const LIFT = 0.03;

export class SkidMarks {
  readonly mesh: THREE.Mesh;
  private readonly positions = new Float32Array(MAX_SEGMENTS * 6 * 3);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.MeshBasicMaterial;
  private readonly last: (THREE.Vector3 | null)[] = [null, null, null, null];
  private next = 0;
  private count = 0;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setDrawRange(0, 0);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x111114,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  /** Afegeix marques segons l'estat del vehicle (cridar un cop per frame). */
  update(vehicle: Vehicle): void {
    const sliding = vehicle.drifting || (Math.abs(vehicle.slipAngle) > 0.2 && vehicle.speed > 6);
    vehicle.wheels.forEach((w, i) => {
      const rear = i >= 2;
      const marking =
        w.grounded &&
        w.material !== Surface.Grass &&
        sliding &&
        (rear || Math.abs(vehicle.slipAngle) > 0.4);
      if (!marking) {
        this.last[i] = null;
        return;
      }
      this.n.set(w.normal.x, w.normal.y, w.normal.z);
      const p = this.b.set(w.contactPoint.x, w.contactPoint.y, w.contactPoint.z);
      p.addScaledVector(this.n, LIFT);
      const prev = this.last[i];
      if (!prev) {
        this.last[i] = p.clone();
        return;
      }
      if (prev.distanceTo(p) < MIN_STEP) return;
      if (prev.distanceTo(p) > 4) {
        // Salt massa gran (p. ex. reaparició): comencem una tira nova.
        prev.copy(p);
        return;
      }
      this.addSegment(prev, p);
      prev.copy(p);
    });
  }

  private addSegment(from: THREE.Vector3, to: THREE.Vector3): void {
    this.dir.subVectors(to, from);
    this.side
      .crossVectors(this.dir, this.n)
      .normalize()
      .multiplyScalar(WIDTH / 2);
    const a = this.a;
    const verts = [
      a.copy(from).sub(this.side).toArray(),
      a.copy(from).add(this.side).toArray(),
      a.copy(to).add(this.side).toArray(),
      a.copy(to).sub(this.side).toArray(),
    ];
    const order = [0, 1, 2, 0, 2, 3];
    const base = this.next * 18;
    order.forEach((v, k) => this.positions.set(verts[v], base + k * 3));
    this.next = (this.next + 1) % MAX_SEGMENTS;
    this.count = Math.min(MAX_SEGMENTS, this.count + 1);
    this.geometry.setDrawRange(0, this.count * 6);
    const attr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }

  clear(): void {
    this.count = 0;
    this.next = 0;
    this.last.fill(null);
    this.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
