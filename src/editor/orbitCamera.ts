// Càmera orbital de l'editor.

import * as THREE from 'three';
import { clamp } from '../core/math';

export class OrbitCamera {
  readonly target = new THREE.Vector3(0, 0, 0);
  yaw = Math.PI * 0.75;
  pitch = 0.85;
  distance = 140;

  rotate(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    this.pitch = clamp(this.pitch + dPitch, 0.15, 1.5);
  }

  zoom(factor: number): void {
    this.distance = clamp(this.distance * factor, 25, 700);
  }

  /** Desplaça el focus en el pla horitzontal, relatiu a l'orientació de la càmera. */
  pan(right: number, forward: number): void {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Endavant de la càmera projectat a terra: (-sin, -cos); dreta: (cos, -sin).
    this.target.x += -forward * sin + right * cos;
    this.target.z += -forward * cos - right * sin;
  }

  apply(camera: THREE.PerspectiveCamera): void {
    const c = Math.cos(this.pitch);
    camera.position.set(
      this.target.x + Math.sin(this.yaw) * c * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * c * this.distance,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(this.target);
    if (camera.fov !== 55) {
      camera.fov = 55;
      camera.updateProjectionMatrix();
    }
  }
}
