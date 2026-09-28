// Càmera de persecució.

import * as THREE from 'three';

const DISTANCE = 8;
const HEIGHT = 3.2;
const LOOK_HEIGHT = 1;

export class ChaseCamera {
  private readonly forward = new THREE.Vector3();
  private readonly target = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  update(car: THREE.Object3D): void {
    this.forward.set(0, 0, 1).applyQuaternion(car.quaternion);
    this.forward.y = 0;
    this.forward.normalize();
    this.camera.position
      .copy(car.position)
      .addScaledVector(this.forward, -DISTANCE)
      .setY(car.position.y + HEIGHT);
    this.target.copy(car.position).setY(car.position.y + LOOK_HEIGHT);
    this.camera.lookAt(this.target);
  }
}
