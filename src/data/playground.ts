// Zona de proves de la fase 2: rampes, un gep i una paret per provar la
// suspensió, els salts i les col·lisions abans de tenir circuits.

import { Vec3 } from '../core/math';
import { type CollisionWorld, type SurfaceId, Surface, faceNormal } from '../physics/collision';

export interface PlainMesh {
  positions: number[];
  colors: number[];
}

class Builder {
  readonly mesh: PlainMesh = { positions: [], colors: [] };
  constructor(private readonly world: CollisionWorld) {}

  /** Afegeix un quadrilàter orientat cap a `outward` (es gira si cal). */
  quad(p: Vec3[], outward: Vec3, color: number, material: SurfaceId): void {
    let [a, b, c, d] = p;
    if (faceNormal(a, b, c).dot(outward) < 0) [a, b, c, d] = [d, c, b, a];
    this.tri(a, b, c, color, material);
    this.tri(a, c, d, color, material);
  }

  /** Triangle orientat cap a `outward` (es gira si cal). */
  triFacing(a: Vec3, b: Vec3, c: Vec3, outward: Vec3, color: number, material: SurfaceId): void {
    if (faceNormal(a, b, c).dot(outward) < 0) this.tri(a, c, b, color, material);
    else this.tri(a, b, c, color, material);
  }

  tri(a: Vec3, b: Vec3, c: Vec3, color: number, material: SurfaceId): void {
    this.world.addTriangle(a, b, c, material);
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const bl = (color & 255) / 255;
    for (const v of [a, b, c]) {
      this.mesh.positions.push(v.x, v.y, v.z);
      this.mesh.colors.push(r, g, bl);
    }
  }

  /** Falca que puja en la direcció +Z des de (x, 0, z). */
  wedge(x: number, z: number, width: number, length: number, height: number): void {
    const hw = width / 2;
    const v = (px: number, py: number, pz: number) => new Vec3(x + px, py, z + pz);
    const top = [v(-hw, 0, 0), v(hw, 0, 0), v(hw, height, length), v(-hw, height, length)];
    this.quad(top, new Vec3(0, 1, 0), 0xffb627, Surface.Road);
    const back = [
      v(-hw, 0, length),
      v(hw, 0, length),
      v(hw, height, length),
      v(-hw, height, length),
    ];
    this.quad(back, new Vec3(0, 0, 1), 0xe07a1f, Surface.Wall);
    const side = [v(hw, 0, 0), v(hw, 0, length), v(hw, height, length)] as const;
    this.triFacing(...side, new Vec3(1, 0, 0), 0xe07a1f, Surface.Wall);
    const other = [v(-hw, 0, 0), v(-hw, 0, length), v(-hw, height, length)] as const;
    this.triFacing(...other, new Vec3(-1, 0, 0), 0xe07a1f, Surface.Wall);
  }

  /** Caixa sòlida (parets). */
  box(cx: number, cz: number, sx: number, sy: number, sz: number, color: number): void {
    const x0 = cx - sx / 2;
    const x1 = cx + sx / 2;
    const z0 = cz - sz / 2;
    const z1 = cz + sz / 2;
    const v = (px: number, py: number, pz: number) => new Vec3(px, py, pz);
    this.quad(
      [v(x0, sy, z0), v(x1, sy, z0), v(x1, sy, z1), v(x0, sy, z1)],
      new Vec3(0, 1, 0),
      color,
      Surface.Wall,
    );
    this.quad(
      [v(x0, 0, z0), v(x1, 0, z0), v(x1, sy, z0), v(x0, sy, z0)],
      new Vec3(0, 0, -1),
      color,
      Surface.Wall,
    );
    this.quad(
      [v(x0, 0, z1), v(x1, 0, z1), v(x1, sy, z1), v(x0, sy, z1)],
      new Vec3(0, 0, 1),
      color,
      Surface.Wall,
    );
    this.quad(
      [v(x0, 0, z0), v(x0, 0, z1), v(x0, sy, z1), v(x0, sy, z0)],
      new Vec3(-1, 0, 0),
      color,
      Surface.Wall,
    );
    this.quad(
      [v(x1, 0, z0), v(x1, 0, z1), v(x1, sy, z1), v(x1, sy, z0)],
      new Vec3(1, 0, 0),
      color,
      Surface.Wall,
    );
  }
}

export function buildPlayground(world: CollisionWorld): PlainMesh {
  const b = new Builder(world);
  // Rampa petita i rampa gran.
  b.wedge(0, 60, 14, 18, 3.5);
  b.wedge(-50, 40, 16, 30, 8);
  // Gep: pujada i baixada (la baixada és una falca girada).
  b.wedge(45, 60, 14, 10, 1.5);
  const hw = 7;
  const v = (px: number, py: number, pz: number) => new Vec3(45 + px, py, 70 + pz);
  b.quad(
    [v(-hw, 1.5, 0), v(hw, 1.5, 0), v(hw, 0, 10), v(-hw, 0, 10)],
    new Vec3(0, 1, 0),
    0xffb627,
    Surface.Road,
  );
  // Paret llarga per provar els fregaments.
  b.box(25, 20, 1, 1.2, 120, 0xf2f2f2);
  return b.mesh;
}
