// Efectes visuals d'un cotxe: fum en derrapar, pols a la gespa, espurnes en
// fregar parets i guspires del turbo.

import * as THREE from 'three';
import { Surface } from '../physics/collision';
import type { Vehicle } from '../physics/vehicle';
import { ParticleSystem } from './particles';

const SMOKE = new THREE.Color(0xe8e8ee);
const DUST = new THREE.Color(0x8a7a4a);
const SPARK_A = new THREE.Color(0xffd35a);
const SPARK_B = new THREE.Color(0xff7a1a);
const EMBER = new THREE.Color(0xff9a3a);

export class CarEffects {
  readonly root = new THREE.Group();
  private readonly smoke = new ParticleSystem(900, false);
  private readonly sparks = new ParticleSystem(500, true);
  private readonly wheelAcc = [0, 0, 0, 0];
  private readonly fwd = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();

  constructor() {
    this.root.add(this.smoke.points, this.sparks.points);
  }

  update(
    vehicle: Vehicle,
    frameDt: number,
    camera: THREE.PerspectiveCamera,
    viewportHeight: number,
  ): void {
    const dt = Math.min(frameDt, 0.05);
    const { vel } = vehicle;
    const speed = vehicle.speed;
    const slip = Math.abs(vehicle.slipAngle);
    const sliding = vehicle.drifting || (slip > 0.2 && speed > 6);

    vehicle.wheels.forEach((w, i) => {
      if (!w.grounded) return;
      const onGrass = w.material === Surface.Grass;
      let rate = 0;
      if (onGrass && speed > 5) rate = 25 * Math.min(1, speed / 30);
      else if (sliding && i >= 2) rate = 22 + 50 * Math.min(1, slip);
      if (rate <= 0) return;
      this.wheelAcc[i] += rate * dt;
      while (this.wheelAcc[i] >= 1) {
        this.wheelAcc[i] -= 1;
        this.smoke.emit({
          x: w.contactPoint.x + (Math.random() - 0.5) * 0.4,
          y: w.contactPoint.y + 0.25,
          z: w.contactPoint.z + (Math.random() - 0.5) * 0.4,
          vx: vel.x * 0.25 + (Math.random() - 0.5) * 2,
          vy: 0.8 + Math.random() * 1.2,
          vz: vel.z * 0.25 + (Math.random() - 0.5) * 2,
          color: onGrass ? DUST : SMOKE,
          size: 0.9 + Math.random() * 0.5,
          growth: 2.6,
          life: 0.8 + Math.random() * 0.5,
          alpha: onGrass ? 0.45 : 0.55,
          gravity: -0.6,
          drag: 1.8,
        });
      }
    });

    if (vehicle.scraping) {
      const p = vehicle.scrapePoint;
      for (let k = 0; k < 6; k++) {
        this.sparks.emit({
          x: p.x,
          y: p.y + 0.2,
          z: p.z,
          vx: vel.x * 0.7 + (Math.random() - 0.5) * 8,
          vy: 1.5 + Math.random() * 4,
          vz: vel.z * 0.7 + (Math.random() - 0.5) * 8,
          color: Math.random() < 0.5 ? SPARK_A : SPARK_B,
          size: 0.18 + Math.random() * 0.12,
          growth: -0.2,
          life: 0.25 + Math.random() * 0.25,
          alpha: 1,
          gravity: 18,
          drag: 0.8,
        });
      }
    }

    if (vehicle.turboActive) {
      const q = vehicle.rot;
      this.fwd.set(0, 0, 1).applyQuaternion(this.quat.set(q.x, q.y, q.z, q.w));
      for (let k = 0; k < 2; k++) {
        const back = 2.3 + Math.random() * 0.4;
        this.sparks.emit({
          x: vehicle.pos.x - this.fwd.x * back,
          y: vehicle.pos.y - this.fwd.y * back,
          z: vehicle.pos.z - this.fwd.z * back,
          vx: vel.x * 0.6 - this.fwd.x * 6 + (Math.random() - 0.5) * 2,
          vy: vel.y * 0.6 + Math.random() * 1.5,
          vz: vel.z * 0.6 - this.fwd.z * 6 + (Math.random() - 0.5) * 2,
          color: EMBER,
          size: 0.25,
          growth: -0.3,
          life: 0.3,
          alpha: 0.9,
          gravity: 0,
          drag: 2,
        });
      }
    }

    this.smoke.update(dt, camera, viewportHeight);
    this.sparks.update(dt, camera, viewportHeight);
  }

  clear(): void {
    this.smoke.clear();
    this.sparks.clear();
  }

  dispose(): void {
    this.smoke.dispose();
    this.sparks.dispose();
    this.root.removeFromParent();
  }
}
