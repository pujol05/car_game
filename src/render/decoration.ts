// Decoració generada per codi al voltant del circuit: arbres, roques,
// muntanyes llunyanes i fanals (amb bassals de llum que només es veuen de nit).
// És repetible: la mateixa llavor genera sempre el mateix paisatge.

import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { type BuiltTrack, worldCells } from '../track/builder';
import { GROUND_Y, TILE } from '../track/grid';
import { ROAD_HALF, WALL_THICKNESS } from '../track/sweep';

const MARGIN_CELLS = 9;

function flat(color: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });
}

export class Decoration {
  readonly root = new THREE.Group();
  private readonly pools: THREE.Mesh[] = [];
  private readonly bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xfff1c4 });
  private readonly disposables: { dispose(): void }[] = [];

  constructor(track: BuiltTrack, seed: number) {
    const rng = mulberry32(seed);
    this.buildScatter(track, rng);
    this.buildMountains(track, rng);
    this.buildLamps(track);
  }

  /** Activa o desactiva els efectes de nit. */
  setNight(night: boolean): void {
    for (const pool of this.pools) pool.visible = night;
    this.bulbMaterial.color.setHex(night ? 0xffe9a8 : 0xd9d4c3);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.root.removeFromParent();
  }

  /** Registra un recurs per alliberar-lo a dispose(). */
  private own<T extends { dispose(): void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  private buildScatter(track: BuiltTrack, rng: () => number): void {
    const blocked = new Set<string>();
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of track.data.pieces) {
      for (const [x, , z] of worldCells(p)) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) blocked.add(`${x + dx},${z + dz}`);
        }
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
    }
    if (!Number.isFinite(minX)) return;

    const pines: THREE.Matrix4[] = [];
    const rounds: THREE.Matrix4[] = [];
    const rocks: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let x = minX - MARGIN_CELLS; x <= maxX + MARGIN_CELLS; x++) {
      for (let z = minZ - MARGIN_CELLS; z <= maxZ + MARGIN_CELLS; z++) {
        if (blocked.has(`${x},${z}`)) continue;
        const r = rng();
        const count = r < 0.3 ? 1 + Math.floor(rng() * 3) : 0;
        for (let i = 0; i < count; i++) {
          const size = 0.8 + rng() * 0.8;
          pos.set(x * TILE + (rng() - 0.5) * 16, GROUND_Y, z * TILE + (rng() - 0.5) * 16);
          q.setFromAxisAngle(up, rng() * Math.PI * 2);
          s.setScalar(size);
          m.compose(pos, q, s);
          (rng() < 0.55 ? pines : rounds).push(m.clone());
        }
        if (rng() < 0.06) {
          pos.set(x * TILE + (rng() - 0.5) * 14, GROUND_Y, z * TILE + (rng() - 0.5) * 14);
          q.setFromEuler(new THREE.Euler(rng() * 0.5, rng() * Math.PI * 2, rng() * 0.5));
          s.set(1 + rng() * 2.5, 0.7 + rng() * 1.5, 1 + rng() * 2.5);
          m.compose(pos, q, s);
          rocks.push(m.clone());
        }
      }
    }

    // Pi: tronc i dos cons.
    const trunkGeo = this.own(new THREE.CylinderGeometry(0.35, 0.5, 3, 5).translate(0, 1.5, 0));
    const trunkMat = this.own(flat(0x7a4b2a));
    const pineGeo = this.own(new THREE.ConeGeometry(3, 7, 6).translate(0, 6, 0));
    // Blanc: el color real ve de cada instància.
    const pineMat = this.own(flat(0xffffff));
    const roundGeo = this.own(new THREE.IcosahedronGeometry(3.2, 0).translate(0, 5.5, 0));
    const roundMat = this.own(flat(0xffffff));
    const rockGeo = this.own(new THREE.DodecahedronGeometry(1, 0));
    const rockMat = this.own(flat(0x9aa0a8));

    const trunks = [...pines, ...rounds];
    this.instanced(trunkGeo, trunkMat, trunks);
    this.instanced(pineGeo, pineMat, pines, [0x2e8b4a, 0x3a9e57, 0x24784a], rng);
    this.instanced(roundGeo, roundMat, rounds, [0x5cbf3a, 0x7ccf40, 0x49a83a], rng);
    this.instanced(rockGeo, rockMat, rocks);
  }

  private instanced(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    matrices: THREE.Matrix4[],
    palette?: number[],
    rng?: () => number,
  ): void {
    if (matrices.length === 0) return;
    const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
    const color = new THREE.Color();
    matrices.forEach((mat4, i) => {
      mesh.setMatrixAt(i, mat4);
      if (palette && rng)
        mesh.setColorAt(i, color.setHex(palette[Math.floor(rng() * palette.length)]));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  private buildMountains(track: BuiltTrack, rng: () => number): void {
    const { min, max } = track.bounds;
    const cx = (min.x + max.x) / 2;
    const cz = (min.z + max.z) / 2;
    const radius = Math.max(max.x - min.x, max.z - min.z) / 2 + 900;
    const count = 26;
    const low = new THREE.Color(0x4d7a5a);
    const high = new THREE.Color(0xf4f7ff);
    const mid = new THREE.Color(0x7a8a9a);
    const material = this.own(flat(0xffffff, { vertexColors: true }));
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rng() * 0.2;
      const h = 160 + rng() * 260;
      const geo = new THREE.ConeGeometry(180 + rng() * 160, h, 5 + Math.floor(rng() * 3), 3);
      const nonIndexed = geo.toNonIndexed();
      geo.dispose();
      const pos = nonIndexed.getAttribute('position');
      const colors = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      for (let v = 0; v < pos.count; v++) {
        const t = (pos.getY(v) + h / 2) / h;
        if (t > 0.72) c.copy(high);
        else if (t > 0.35) c.copy(mid);
        else c.copy(low);
        colors.set([c.r, c.g, c.b], v * 3);
      }
      nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      nonIndexed.computeVertexNormals();
      const mesh = new THREE.Mesh(this.own(nonIndexed), material);
      const r = radius + rng() * 400;
      mesh.position.set(cx + Math.cos(angle) * r, GROUND_Y + h / 2 - 5, cz + Math.sin(angle) * r);
      mesh.rotation.y = rng() * Math.PI;
      this.root.add(mesh);
    }
  }

  private buildLamps(track: BuiltTrack): void {
    const poleMat = this.own(flat(0x3b4150, { roughness: 0.6, metalness: 0.4 }));
    const poolMat = this.own(
      new THREE.MeshBasicMaterial({
        color: 0xffc46b,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const poolGeo = this.own(new THREE.CircleGeometry(8, 20).rotateX(-Math.PI / 2));
    const poleGeo = this.own(new THREE.BoxGeometry(0.35, 1, 0.35));
    const armGeo = this.own(new THREE.BoxGeometry(0.25, 0.25, 1));
    const bulbGeo = this.own(new THREE.BoxGeometry(1.2, 0.3, 0.8));
    this.own(this.bulbMaterial);

    let n = 0;
    for (const piece of track.pieces) {
      if (piece.data.type !== 'straight' || piece.data.y !== 0) continue;
      n++;
      if (n % 2 !== 0) continue;
      const mid = piece.route[Math.floor(piece.route.length / 2)];
      const right = new THREE.Vector3(
        mid.t.y * mid.u.z - mid.t.z * mid.u.y,
        mid.t.z * mid.u.x - mid.t.x * mid.u.z,
        mid.t.x * mid.u.y - mid.t.y * mid.u.x,
      ).normalize();
      const side = n % 4 === 0 ? 1 : -1;
      const base = new THREE.Vector3(mid.p.x, mid.p.y, mid.p.z).addScaledVector(
        right,
        side * (ROAD_HALF + WALL_THICKNESS + 1.4),
      );
      const height = 8.5;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.scale.y = height - GROUND_Y;
      pole.position.set(base.x, GROUND_Y + (height - GROUND_Y) / 2, base.z);
      pole.castShadow = true;
      const inward = right.clone().multiplyScalar(-side);
      const armLength = 4;
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.scale.z = armLength;
      arm.position
        .copy(base)
        .addScaledVector(inward, armLength / 2)
        .setY(height);
      arm.lookAt(base.clone().setY(height));
      const head = base.clone().addScaledVector(inward, armLength);
      const bulb = new THREE.Mesh(bulbGeo, this.bulbMaterial);
      bulb.position.copy(head).setY(height - 0.2);
      bulb.lookAt(base.clone().setY(height - 0.2));
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.position.set(head.x, mid.p.y + 0.06, head.z);
      pool.visible = false;
      this.pools.push(pool);
      this.root.add(pole, arm, bulb, pool);
    }
  }
}
