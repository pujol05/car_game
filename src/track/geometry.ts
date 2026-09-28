// Constructor de geometria del circuit. Genera alhora la malla visual (dades
// planes, sense three.js) i els triangles de col·lisió. Les peces treballen
// en coordenades locals; el constructor aplica la transformació de la peça.

import { Vec3 } from '../core/math';
import { type CollisionWorld, type SurfaceId, faceNormal } from '../physics/collision';
import { localToWorld, rotateVector } from './grid';
import type { Rotation } from './types';

export interface PlainMesh {
  positions: number[];
  colors: number[];
}

export function emptyMesh(): PlainMesh {
  return { positions: [], colors: [] };
}

export interface TriOptions {
  /** Material de col·lisió; si no s'indica, el triangle només és visual. */
  collide?: SurfaceId;
  /** Si és cert, va a la malla lluminosa (emissiva). */
  glow?: boolean;
  /** Només col·lisió, sense malla visual. */
  invisible?: boolean;
  /** Normals suaus per a la col·lisió (en coordenades locals). */
  normals?: readonly [Vec3, Vec3, Vec3];
}

export class GeometryBuilder {
  readonly solid = emptyMesh();
  readonly glow = emptyMesh();
  private cell = { x: 0, y: 0, z: 0 };
  private rot: Rotation = 0;
  private readonly wa = new Vec3();
  private readonly wb = new Vec3();
  private readonly wc = new Vec3();
  private readonly na = new Vec3();
  private readonly nb = new Vec3();
  private readonly nc = new Vec3();

  constructor(private readonly world: CollisionWorld) {}

  setTransform(cell: { x: number; y: number; z: number }, r: Rotation): void {
    this.cell = { x: cell.x, y: cell.y, z: cell.z };
    this.rot = r;
  }

  toWorld(p: Vec3, out = new Vec3()): Vec3 {
    return localToWorld(p, this.cell, this.rot, out);
  }

  dirToWorld(v: Vec3, out = new Vec3()): Vec3 {
    return rotateVector(v, this.rot, out);
  }

  /** Triangle en ordre antihorari vist des de la cara frontal. */
  tri(a: Vec3, b: Vec3, c: Vec3, color: number, opts: TriOptions = {}): void {
    const wa = this.toWorld(a, this.wa);
    const wb = this.toWorld(b, this.wb);
    const wc = this.toWorld(c, this.wc);
    if (opts.collide !== undefined) {
      if (opts.normals) {
        this.world.addTriangle(
          wa,
          wb,
          wc,
          opts.collide,
          this.dirToWorld(opts.normals[0], this.na),
          this.dirToWorld(opts.normals[1], this.nb),
          this.dirToWorld(opts.normals[2], this.nc),
        );
      } else {
        this.world.addTriangle(wa, wb, wc, opts.collide);
      }
    }
    if (opts.invisible) return;
    const mesh = opts.glow ? this.glow : this.solid;
    const cr = ((color >> 16) & 255) / 255;
    const cg = ((color >> 8) & 255) / 255;
    const cb = (color & 255) / 255;
    mesh.positions.push(wa.x, wa.y, wa.z, wb.x, wb.y, wb.z, wc.x, wc.y, wc.z);
    mesh.colors.push(cr, cg, cb, cr, cg, cb, cr, cg, cb);
  }

  /** Triangle orientat cap a `outward` (es gira l'ordre si cal). */
  triFacing(a: Vec3, b: Vec3, c: Vec3, outward: Vec3, color: number, opts: TriOptions = {}): void {
    if (faceNormal(a, b, c).dot(outward) < 0) {
      const n = opts.normals;
      this.tri(a, c, b, color, n ? { ...opts, normals: [n[0], n[2], n[1]] } : opts);
    } else {
      this.tri(a, b, c, color, opts);
    }
  }

  /** Quadrilàter (a, b, c, d en ordre perimetral) orientat cap a `outward`. */
  quad(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    d: Vec3,
    outward: Vec3,
    color: number,
    opts: TriOptions = {},
    normals?: readonly [Vec3, Vec3, Vec3, Vec3],
  ): void {
    const flip = faceNormal(a, b, c).dot(outward) < 0;
    const [p0, p1, p2, p3] = flip ? [a, d, c, b] : [a, b, c, d];
    let n0: Vec3 | undefined;
    let n1: Vec3 | undefined;
    let n2: Vec3 | undefined;
    let n3: Vec3 | undefined;
    if (normals)
      [n0, n1, n2, n3] = flip ? [normals[0], normals[3], normals[2], normals[1]] : normals;
    this.tri(p0, p1, p2, color, n0 && n1 && n2 ? { ...opts, normals: [n0, n1, n2] } : opts);
    this.tri(p0, p2, p3, color, n0 && n2 && n3 ? { ...opts, normals: [n0, n2, n3] } : opts);
  }

  /** Caixa alineada amb els eixos locals. */
  box(center: Vec3, half: Vec3, color: number, opts: TriOptions = {}, topColor = color): void {
    const { x: cx, y: cy, z: cz } = center;
    const { x: hx, y: hy, z: hz } = half;
    const v = (sx: number, sy: number, sz: number) =>
      new Vec3(cx + sx * hx, cy + sy * hy, cz + sz * hz);
    const faces: [Vec3, Vec3, Vec3, Vec3, Vec3, number][] = [
      [v(-1, 1, -1), v(1, 1, -1), v(1, 1, 1), v(-1, 1, 1), new Vec3(0, 1, 0), topColor],
      [v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1), new Vec3(0, -1, 0), color],
      [v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1), new Vec3(0, 0, 1), color],
      [v(-1, -1, -1), v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1), new Vec3(0, 0, -1), color],
      [v(1, -1, -1), v(1, -1, 1), v(1, 1, 1), v(1, 1, -1), new Vec3(1, 0, 0), color],
      [v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1), new Vec3(-1, 0, 0), color],
    ];
    for (const [a, b, c, d, n, col] of faces) this.quad(a, b, c, d, n, col, opts);
  }
}
