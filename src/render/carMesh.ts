// Model low-poly del cotxe, generat completament per codi.

import * as THREE from 'three';
import type { CarBody, CarStats } from '../data/cars';
import { SUSPENSION_TRAVEL, WHEEL_MOUNTS, WHEEL_RADIUS, type Vehicle } from '../physics/vehicle';

/** Extrudeix un perfil lateral (z, y) al llarg de l'eix X del cotxe. */
function extrudeProfile(points: [number, number][], width: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelSize: 0.06,
    bevelThickness: 0.06,
    bevelSegments: 1,
  });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);
  return geo;
}

function flatMaterial(color: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.55,
    metalness: 0.1,
    ...extra,
  });
}

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  pos: [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...pos);
  parent.add(mesh);
  return mesh;
}

interface BodyShape {
  /** Perfil lateral de la carrosseria: punts (z, y). */
  chassis: [number, number][];
  chassisWidth: number;
  cabin: [number, number][];
  cabinWidth: number;
  /** Peces addicionals (sostre, aleró...). */
  extras(body: THREE.Group, paint: THREE.Material, dark: THREE.Material): void;
}

function rearWing(body: THREE.Group, dark: THREE.Material, width: number, y: number, z: number) {
  box(body, [width, 0.07, 0.42], [0, y, z], dark);
  for (const x of [-width / 3, width / 3])
    box(body, [0.08, y - 0.3, 0.12], [x, (y + 0.3) / 2, z + 0.05], dark);
}

const BODY_SHAPES: Record<CarBody, BodyShape> = {
  coupe: {
    chassis: [
      [-2.05, -0.28],
      [2.1, -0.28],
      [2.15, -0.02],
      [1.25, 0.22],
      [-1.85, 0.28],
      [-2.1, 0.08],
    ],
    chassisWidth: 1.6,
    cabin: [
      [-1.25, 0.2],
      [0.85, 0.2],
      [0.2, 0.72],
      [-0.95, 0.74],
      [-1.45, 0.4],
    ],
    cabinWidth: 1.42,
    extras(body, paint, dark) {
      box(body, [1.3, 0.08, 0.95], [0, 0.8, -0.38], paint);
      rearWing(body, dark, 1.8, 0.62, -1.9);
    },
  },
  wedge: {
    chassis: [
      [-2.1, -0.3],
      [2.2, -0.3],
      [2.28, -0.16],
      [0.8, 0.16],
      [-1.95, 0.24],
      [-2.15, 0.06],
    ],
    chassisWidth: 1.66,
    cabin: [
      [-1.45, 0.14],
      [0.5, 0.14],
      [-0.05, 0.58],
      [-1.05, 0.6],
      [-1.65, 0.32],
    ],
    cabinWidth: 1.3,
    extras(body, paint, dark) {
      rearWing(body, dark, 1.95, 0.72, -1.98);
      // Franja central decorativa.
      box(body, [0.28, 0.02, 1.4], [0, 0.25, 1.35], dark);
      box(body, [1.7, 0.06, 0.3], [0, -0.26, 2.15], paint);
    },
  },
  rally: {
    chassis: [
      [-2.0, -0.26],
      [2.02, -0.26],
      [2.08, 0.06],
      [1.35, 0.3],
      [-1.9, 0.34],
      [-2.05, 0.12],
    ],
    chassisWidth: 1.64,
    cabin: [
      [-1.35, 0.28],
      [0.85, 0.28],
      [0.4, 0.9],
      [-1.2, 0.92],
      [-1.45, 0.6],
    ],
    cabinWidth: 1.46,
    extras(body, paint, dark) {
      box(body, [1.36, 0.08, 1.2], [0, 0.98, -0.4], paint);
      // Baca al sostre i defensa davantera.
      box(body, [1.1, 0.06, 0.9], [0, 1.08, -0.45], dark);
      box(body, [1.5, 0.22, 0.12], [0, -0.1, 2.12], dark);
      // Parafangs posteriors.
      for (const x of [-0.8, 0.8]) box(body, [0.3, 0.32, 0.04], [x, -0.3, -1.72], dark);
    },
  },
};

export interface CarModel {
  root: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Group[];
  headMat: THREE.MeshStandardMaterial;
  tailMat: THREE.MeshStandardMaterial;
  flame: THREE.Group;
}

export function buildCarModel(stats: CarStats): CarModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = flatMaterial(stats.color);
  const dark = flatMaterial(0x23232b);
  const glass = flatMaterial(0x2a3e5c, { roughness: 0.2, metalness: 0.4 });

  const shape = BODY_SHAPES[stats.body];
  body.add(new THREE.Mesh(extrudeProfile(shape.chassis, shape.chassisWidth), paint));
  body.add(new THREE.Mesh(extrudeProfile(shape.cabin, shape.cabinWidth), glass));
  shape.extras(body, paint, dark);
  const front = Math.max(...shape.chassis.map(([z]) => z)) + 0.06;
  const back = Math.min(...shape.chassis.map(([z]) => z)) - 0.04;

  // Fars i llums posteriors.
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff6d0,
    emissive: 0xfff2b0,
    emissiveIntensity: 0.8,
    flatShading: true,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff2030,
    emissive: 0xff1020,
    emissiveIntensity: 0.6,
    flatShading: true,
  });
  for (const x of [-0.62, 0.62]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.1), headMat);
    head.position.set(x, 0.02, front);
    body.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.08), tailMat);
    tail.position.set(x, 0.05, back);
    body.add(tail);
  }

  // Tubs d'escapament.
  const pipeGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.3, 6);
  pipeGeo.rotateX(Math.PI / 2);
  for (const x of [-0.4, 0.4]) {
    const pipe = new THREE.Mesh(pipeGeo, dark);
    pipe.position.set(x, -0.18, -2.15);
    body.add(pipe);
  }

  body.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // Flama del turbo: un con blau a dins i un de taronja a fora, additius.
  const flame = new THREE.Group();
  const outerMat = new THREE.MeshBasicMaterial({
    color: 0xff7a1a,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0x7fd4ff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const outerGeo = new THREE.ConeGeometry(0.2, 1.3, 8);
  outerGeo.rotateX(-Math.PI / 2);
  outerGeo.translate(0, 0, -0.65);
  const innerGeo = new THREE.ConeGeometry(0.11, 0.8, 8);
  innerGeo.rotateX(-Math.PI / 2);
  innerGeo.translate(0, 0, -0.4);
  for (const x of [-0.4, 0.4]) {
    const f = new THREE.Group();
    f.position.set(x, -0.18, -2.3);
    f.add(new THREE.Mesh(outerGeo, outerMat), new THREE.Mesh(innerGeo, innerMat));
    flame.add(f);
  }
  flame.visible = false;
  body.add(flame);

  // Rodes: un grup per roda (gir de direcció) amb el pneumàtic a dins (rotació).
  const tireGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.34, 10);
  tireGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(WHEEL_RADIUS * 0.55, WHEEL_RADIUS * 0.55, 0.36, 6);
  hubGeo.rotateZ(Math.PI / 2);
  const tireMat = flatMaterial(0x1b1b1f, { roughness: 0.9 });
  const hubMat = flatMaterial(0xd8d8e0, { metalness: 0.6 });

  const wheels: THREE.Group[] = [];
  for (const [x, y, z] of WHEEL_MOUNTS) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y - SUSPENSION_TRAVEL * 0.75, z);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    spin.add(tire);
    spin.add(new THREE.Mesh(hubGeo, hubMat));
    pivot.add(spin);
    root.add(pivot);
    wheels.push(pivot);
  }

  return { root, body, wheels, headMat, tailMat, flame };
}

/** Converteix el model en un fantasma translúcid (sense ombres). */
function makeGhost(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mat = (o.material as THREE.MeshStandardMaterial).clone();
    mat.transparent = true;
    mat.opacity = 0.35;
    mat.depthWrite = false;
    o.material = mat;
    o.castShadow = false;
    o.receiveShadow = false;
  });
}

/** Representació visual d'un vehicle, interpolada entre ticks de física. */
export class CarView {
  readonly root: THREE.Group;
  private readonly model: CarModel;
  private readonly wheels: THREE.Group[];
  private readonly headlight: THREE.SpotLight | null = null;
  private wheelSpin = 0;
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly prevQuat = new THREE.Quaternion();

  constructor(stats: CarStats, options: { ghost?: boolean; headlights?: boolean } = {}) {
    this.model = buildCarModel(stats);
    this.root = this.model.root;
    this.wheels = this.model.wheels;
    if (options.ghost) makeGhost(this.root);
    if (options.headlights) {
      const light = new THREE.SpotLight(0xfff1d0, 0, 90, 0.55, 0.45, 1.6);
      light.position.set(0, 0.3, 2.2);
      light.target.position.set(0, -1.5, 22);
      light.visible = false;
      this.model.body.add(light, light.target);
      this.headlight = light;
    }
  }

  /** Fars i llums de posició més intensos de nit. */
  setNight(night: boolean): void {
    this.model.headMat.emissiveIntensity = night ? 3 : 0.8;
    this.model.tailMat.emissiveIntensity = night ? 2 : 0.6;
    if (this.headlight) {
      this.headlight.visible = night;
      this.headlight.intensity = night ? 900 : 0;
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }

  update(vehicle: Vehicle, alpha: number, frameDt: number): void {
    const { prevPos, pos, prevRot, rot } = vehicle;
    this.root.position.set(
      prevPos.x + (pos.x - prevPos.x) * alpha,
      prevPos.y + (pos.y - prevPos.y) * alpha,
      prevPos.z + (pos.z - prevPos.z) * alpha,
    );
    this.prevQuat.set(prevRot.x, prevRot.y, prevRot.z, prevRot.w);
    this.tmpQuat.set(rot.x, rot.y, rot.z, rot.w);
    this.root.quaternion.slerpQuaternions(this.prevQuat, this.tmpQuat, alpha);

    this.wheelSpin += (vehicle.forwardSpeed * frameDt) / WHEEL_RADIUS;
    const steerAngle = -vehicle.steer * 0.45;
    this.wheels.forEach((pivot, i) => {
      pivot.position.y = WHEEL_MOUNTS[i][1] - vehicle.wheels[i].suspensionLength;
      pivot.rotation.y = i < 2 ? steerAngle : 0;
      const spin = pivot.children[0];
      if (spin) spin.rotation.x = this.wheelSpin;
    });

    const flame = this.model.flame;
    flame.visible = vehicle.turboActive;
    if (flame.visible) {
      for (const f of flame.children) {
        const k = 0.75 + Math.random() * 0.5;
        f.scale.set(k, k, 0.7 + Math.random() * 0.7);
      }
    }
  }
}
