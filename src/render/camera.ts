// Càmera de persecució suavitzada amb FOV dinàmic segons la velocitat.

import * as THREE from 'three';
import { damp } from '../core/math';
import type { Vehicle } from '../physics/vehicle';

const BASE_FOV = 62;
const SPEED_FOV = 18;
const TURBO_FOV = 8;
const DISTANCE = 7.5;
const HEIGHT = 2.6;
const LOOK_HEIGHT = 1.2;
const LOOK_AHEAD = 2;

export class ChaseCamera {
  private readonly camUp = new THREE.Vector3(0, 1, 0);
  private readonly camFwd = new THREE.Vector3(0, 0, 1);
  private readonly tmp = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private fov = BASE_FOV;
  private needsSnap = true;

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /** Col·loca la càmera directament darrere del cotxe (sense suavitzat). */
  snap(): void {
    this.needsSnap = true;
  }

  update(car: THREE.Object3D, vehicle: Vehicle, dt: number): void {
    const worldUp = this.tmp.set(0, 1, 0);
    const n = vehicle.groundNormal;
    const targetUp = vehicle.grounded ? this.desired.set(n.x, n.y, n.z) : worldUp;
    const snap = this.needsSnap;
    this.needsSnap = false;

    if (snap) this.camUp.copy(targetUp);
    else this.camUp.lerp(targetUp, damp(3, dt)).normalize();

    // Direcció del cotxe projectada sobre el pla perpendicular a camUp.
    const carFwd = this.desired.set(0, 0, 1).applyQuaternion(car.quaternion);
    carFwd.addScaledVector(this.camUp, -carFwd.dot(this.camUp));
    if (carFwd.lengthSq() > 1e-6) {
      carFwd.normalize();
      if (snap) this.camFwd.copy(carFwd);
      else this.camFwd.lerp(carFwd, damp(6, dt));
    }
    this.camFwd.addScaledVector(this.camUp, -this.camFwd.dot(this.camUp)).normalize();

    const speedRatio = Math.min(1, vehicle.speed / 60);
    const distance = DISTANCE + speedRatio * 1.5;
    this.camera.position
      .copy(car.position)
      .addScaledVector(this.camFwd, -distance)
      .addScaledVector(this.camUp, HEIGHT);
    this.target
      .copy(car.position)
      .addScaledVector(this.camUp, LOOK_HEIGHT)
      .addScaledVector(this.camFwd, LOOK_AHEAD);
    this.camera.up.copy(this.camUp);
    this.camera.lookAt(this.target);

    const fovTarget = BASE_FOV + SPEED_FOV * speedRatio + (vehicle.turboActive ? TURBO_FOV : 0);
    this.fov = snap ? fovTarget : this.fov + (fovTarget - this.fov) * damp(4, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
