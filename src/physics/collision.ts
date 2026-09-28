// Món de col·lisions: una sopa de triangles indexada en una graella espacial,
// més un pla de terra infinit opcional. Proporciona raycasts (suspensió) i
// contactes d'esferes (carrosseria contra parets i terra).

import { Vec3 } from '../core/math';

/** Materials de superfície. */
export const Surface = {
  Road: 0,
  Wall: 1,
  Grass: 2,
  Boost: 3,
} as const;
export type SurfaceId = (typeof Surface)[keyof typeof Surface];

export interface RayHit {
  distance: number;
  point: Vec3;
  normal: Vec3;
  material: SurfaceId;
}

export interface Contact {
  point: Vec3;
  normal: Vec3;
  depth: number;
  material: SurfaceId;
}

export function createRayHit(): RayHit {
  return { distance: 0, point: new Vec3(), normal: new Vec3(), material: Surface.Road };
}

const CELL = 4;
const SPAN = 4096;
const OFFSET = 2048;

function cellKey(ix: number, iy: number, iz: number): number {
  return ((ix + OFFSET) * SPAN + (iy + OFFSET)) * SPAN + (iz + OFFSET);
}

export class CollisionWorld {
  /** 9 components per triangle (a, b, c). */
  private pos: Float64Array = new Float64Array(0);
  /** Normals de vèrtex (9 per triangle) per a normals suaus. */
  private vnorm: Float64Array = new Float64Array(0);
  /** Normal de la cara (3 per triangle). */
  private fnorm: Float64Array = new Float64Array(0);
  private mat: Uint8Array = new Uint8Array(0);
  private stamp: Uint32Array = new Uint32Array(0);
  private queryId = 0;
  private readonly cells = new Map<number, number[]>();

  private readonly pendingPos: number[] = [];
  private readonly pendingNorm: number[] = [];
  private readonly pendingMat: number[] = [];
  private built = false;

  /** Alçada del pla de terra infinit, o null si no n'hi ha. */
  groundY: number | null = null;
  groundMaterial: SurfaceId = Surface.Grass;

  get triangleCount(): number {
    return this.mat.length;
  }

  /**
   * Afegeix un triangle. La cara frontal és la que segueix l'ordre
   * antihorari (a, b, c) vist des de fora. Les normals de vèrtex són
   * opcionals (per defecte, la normal de la cara).
   */
  addTriangle(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    material: SurfaceId,
    na?: Vec3,
    nb?: Vec3,
    nc?: Vec3,
  ): void {
    this.pendingPos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    if (na && nb && nc) {
      this.pendingNorm.push(na.x, na.y, na.z, nb.x, nb.y, nb.z, nc.x, nc.y, nc.z);
    } else {
      const n = faceNormal(a, b, c);
      this.pendingNorm.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
    }
    this.pendingMat.push(material);
    this.built = false;
  }

  /** Construeix la graella espacial. Cal cridar-ho després d'afegir triangles. */
  build(): void {
    this.pos = Float64Array.from(this.pendingPos);
    this.vnorm = Float64Array.from(this.pendingNorm);
    this.mat = Uint8Array.from(this.pendingMat);
    const count = this.mat.length;
    this.fnorm = new Float64Array(count * 3);
    this.stamp = new Uint32Array(count);
    this.queryId = 0;
    this.cells.clear();

    const a = new Vec3();
    const b = new Vec3();
    const c = new Vec3();
    for (let t = 0; t < count; t++) {
      this.readTri(t, a, b, c);
      const n = faceNormal(a, b, c);
      this.fnorm[t * 3] = n.x;
      this.fnorm[t * 3 + 1] = n.y;
      this.fnorm[t * 3 + 2] = n.z;
      const x0 = Math.floor(Math.min(a.x, b.x, c.x) / CELL);
      const x1 = Math.floor(Math.max(a.x, b.x, c.x) / CELL);
      const y0 = Math.floor(Math.min(a.y, b.y, c.y) / CELL);
      const y1 = Math.floor(Math.max(a.y, b.y, c.y) / CELL);
      const z0 = Math.floor(Math.min(a.z, b.z, c.z) / CELL);
      const z1 = Math.floor(Math.max(a.z, b.z, c.z) / CELL);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iy = y0; iy <= y1; iy++) {
          for (let iz = z0; iz <= z1; iz++) {
            const key = cellKey(ix, iy, iz);
            let list = this.cells.get(key);
            if (!list) {
              list = [];
              this.cells.set(key, list);
            }
            list.push(t);
          }
        }
      }
    }
    this.built = true;
  }

  private readTri(t: number, a: Vec3, b: Vec3, c: Vec3): void {
    const p = this.pos;
    const i = t * 9;
    a.set(p[i], p[i + 1], p[i + 2]);
    b.set(p[i + 3], p[i + 4], p[i + 5]);
    c.set(p[i + 6], p[i + 7], p[i + 8]);
  }

  /** Recull (sense duplicats) els triangles de les cel·les dins d'una AABB. */
  private gather(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    out: number[],
  ): void {
    if (!this.built) this.build();
    out.length = 0;
    this.queryId++;
    if (this.queryId === 0xffffffff) {
      this.stamp.fill(0);
      this.queryId = 1;
    }
    const id = this.queryId;
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const y0 = Math.floor(minY / CELL);
    const y1 = Math.floor(maxY / CELL);
    const z0 = Math.floor(minZ / CELL);
    const z1 = Math.floor(maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        for (let iz = z0; iz <= z1; iz++) {
          const list = this.cells.get(cellKey(ix, iy, iz));
          if (!list) continue;
          for (const t of list) {
            if (this.stamp[t] !== id) {
              this.stamp[t] = id;
              out.push(t);
            }
          }
        }
      }
    }
  }

  private readonly candidates: number[] = [];
  private readonly ta = new Vec3();
  private readonly tb = new Vec3();
  private readonly tc = new Vec3();
  private readonly e1 = new Vec3();
  private readonly e2 = new Vec3();
  private readonly pv = new Vec3();
  private readonly tv = new Vec3();
  private readonly qv = new Vec3();

  /**
   * Llança un raig (dir normalitzada) i retorna l'impacte més proper.
   * Només compten les cares orientades cap al raig.
   */
  raycast(origin: Vec3, dir: Vec3, maxDist: number, hit: RayHit): boolean {
    let best = maxDist;
    let found = false;
    const ex = origin.x + dir.x * maxDist;
    const ey = origin.y + dir.y * maxDist;
    const ez = origin.z + dir.z * maxDist;
    this.gather(
      Math.min(origin.x, ex),
      Math.min(origin.y, ey),
      Math.min(origin.z, ez),
      Math.max(origin.x, ex),
      Math.max(origin.y, ey),
      Math.max(origin.z, ez),
      this.candidates,
    );
    const { ta: a, tb: b, tc: c, e1, e2, pv, tv, qv } = this;
    for (const t of this.candidates) {
      const fn = t * 3;
      const facing =
        dir.x * this.fnorm[fn] + dir.y * this.fnorm[fn + 1] + dir.z * this.fnorm[fn + 2];
      if (facing >= 0) continue;
      this.readTri(t, a, b, c);
      // Möller–Trumbore
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      pv.crossVectors(dir, e2);
      const det = e1.dot(pv);
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      tv.subVectors(origin, a);
      const u = tv.dot(pv) * inv;
      if (u < 0 || u > 1) continue;
      qv.crossVectors(tv, e1);
      const v = dir.dot(qv) * inv;
      if (v < 0 || u + v > 1) continue;
      const dist = e2.dot(qv) * inv;
      if (dist < 0 || dist >= best) continue;
      best = dist;
      found = true;
      const w = 1 - u - v;
      const n = this.vnorm;
      const i = t * 9;
      hit.normal
        .set(
          n[i] * w + n[i + 3] * u + n[i + 6] * v,
          n[i + 1] * w + n[i + 4] * u + n[i + 7] * v,
          n[i + 2] * w + n[i + 5] * u + n[i + 8] * v,
        )
        .normalize();
      hit.material = this.mat[t] as SurfaceId;
    }

    if (this.groundY !== null && dir.y < -1e-9) {
      const dist = (this.groundY - origin.y) / dir.y;
      if (dist >= 0 && dist < best) {
        best = dist;
        found = true;
        hit.normal.set(0, 1, 0);
        hit.material = this.groundMaterial;
      }
    }

    if (found) {
      hit.distance = best;
      hit.point.copy(origin).addScaled(dir, best);
    }
    return found;
  }

  private readonly cp = new Vec3();

  /**
   * Troba els contactes d'una esfera amb el món. Afegeix els contactes a
   * `out` reutilitzant-ne els objectes; retorna quants n'hi ha.
   */
  sphereContacts(center: Vec3, radius: number, out: Contact[]): number {
    let count = 0;
    this.gather(
      center.x - radius,
      center.y - radius,
      center.z - radius,
      center.x + radius,
      center.y + radius,
      center.z + radius,
      this.candidates,
    );
    const { ta: a, tb: b, tc: c, cp } = this;
    const r2 = radius * radius;
    for (const t of this.candidates) {
      this.readTri(t, a, b, c);
      const fn = t * 3;
      const fx = this.fnorm[fn];
      const fy = this.fnorm[fn + 1];
      const fz = this.fnorm[fn + 2];
      // Només si el centre és davant de la cara (col·lisió d'una sola cara).
      const side = (center.x - a.x) * fx + (center.y - a.y) * fy + (center.z - a.z) * fz;
      if (side <= 0 || side >= radius) continue;
      closestPointOnTriangle(center, a, b, c, cp);
      const dx = center.x - cp.x;
      const dy = center.y - cp.y;
      const dz = center.z - cp.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r2) continue;
      const d = Math.sqrt(d2);
      const contact = acquire(out, count++);
      contact.point.copy(cp);
      if (d > 1e-6) contact.normal.set(dx / d, dy / d, dz / d);
      else contact.normal.set(fx, fy, fz);
      contact.depth = radius - d;
      contact.material = this.mat[t] as SurfaceId;
    }

    if (this.groundY !== null) {
      const depth = this.groundY - (center.y - radius);
      if (depth > 0) {
        const contact = acquire(out, count++);
        contact.point.set(center.x, this.groundY, center.z);
        contact.normal.set(0, 1, 0);
        contact.depth = depth;
        contact.material = this.groundMaterial;
      }
    }
    return count;
  }
}

function acquire(list: Contact[], index: number): Contact {
  let c = list[index];
  if (!c) {
    c = { point: new Vec3(), normal: new Vec3(), depth: 0, material: Surface.Road };
    list[index] = c;
  }
  return c;
}

export function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const e1 = new Vec3().subVectors(b, a);
  const e2 = new Vec3().subVectors(c, a);
  return new Vec3().crossVectors(e1, e2).normalize();
}

/** Punt més proper d'un triangle a p (Ericson, Real-Time Collision Detection). */
export function closestPointOnTriangle(p: Vec3, a: Vec3, b: Vec3, c: Vec3, out: Vec3): Vec3 {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const apz = p.z - a.z;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return out.copy(a);

  const bpx = p.x - b.x;
  const bpy = p.y - b.y;
  const bpz = p.z - b.z;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return out.copy(b);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return out.set(a.x + abx * v, a.y + aby * v, a.z + abz * v);
  }

  const cpx = p.x - c.x;
  const cpy = p.y - c.y;
  const cpz = p.z - c.z;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return out.copy(c);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return out.set(a.x + acx * w, a.y + acy * w, a.z + acz * w);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return out.set(b.x + (c.x - b.x) * w, b.y + (c.y - b.y) * w, b.z + (c.z - b.z) * w);
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return out.set(a.x + abx * v + acx * w, a.y + aby * v + acy * w, a.z + abz * v + acz * w);
}
