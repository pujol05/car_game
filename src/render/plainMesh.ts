// Converteix malles de dades planes (posicions + colors) en malles de three.js.

import * as THREE from 'three';
import type { PlainMesh } from '../data/playground';

export function meshFromPlain(data: PlainMesh): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
