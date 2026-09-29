// Malles de three.js per a un circuit construït.

import * as THREE from 'three';
import type { BuiltTrack } from '../track/builder';
import type { PlainMesh } from '../track/geometry';

/** Els colors de les dades són sRGB; three.js espera colors de vèrtex lineals. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function geometryFrom(mesh: PlainMesh): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  const colors = new Float32Array(mesh.colors.length);
  for (let i = 0; i < colors.length; i++) colors[i] = srgbToLinear(mesh.colors[i]);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export class TrackView {
  readonly root = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(track: BuiltTrack) {
    const solidGeo = geometryFrom(track.solid);
    const solidMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.85,
      metalness: 0.05,
    });
    const solid = new THREE.Mesh(solidGeo, solidMat);
    solid.castShadow = true;
    solid.receiveShadow = true;
    this.root.add(solid);

    const glowGeo = geometryFrom(track.glow);
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    this.root.add(glow);

    this.disposables.push(solidGeo, solidMat, glowGeo, glowMat);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.root.removeFromParent();
  }
}
