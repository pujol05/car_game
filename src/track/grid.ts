// Constants i utilitats de la graella del circuit.

import { Vec3 } from '../core/math';
import type { Rotation } from './types';

/** Mida horitzontal d'una cel·la (m). */
export const TILE = 20;
/** Alçada d'un nivell (m). */
export const LEVEL = 5;
/** Alçada del terra (per sota de la carretera de nivell 0). */
export const GROUND_Y = -0.4;

/**
 * Direccions cardinals com a índex: 0 = +Z, 1 = +X, 2 = -Z, 3 = -X.
 * Sumar 1 és girar a l'esquerra; restar-ne 1 és girar a la dreta.
 */
export const DIR_X = [0, 1, 0, -1] as const;
export const DIR_Z = [1, 0, -1, 0] as const;

export function rotateDir(dir: number, r: number): number {
  return (((dir + r) % 4) + 4) % 4;
}

export function oppositeDir(dir: number): number {
  return (dir + 2) % 4;
}

/** Rota un desplaçament enter (x, z) en passos de 90°. */
export function rotateXZ(x: number, z: number, r: Rotation): [number, number] {
  switch (r) {
    case 0:
      return [x, z];
    case 1:
      return [z, -x];
    case 2:
      return [-x, -z];
    case 3:
      return [-z, x];
  }
}

/** Angle de guinyada que correspon a una rotació (0 → mirant a +Z). */
export function rotationAngle(r: Rotation): number {
  return (r * Math.PI) / 2;
}

/** Transforma un punt local d'una peça a coordenades de món. */
export function localToWorld(
  p: Vec3,
  cell: { x: number; y: number; z: number },
  r: Rotation,
  out: Vec3,
): Vec3 {
  const cos = [1, 0, -1, 0][r];
  const sin = [0, 1, 0, -1][r];
  // Rotació R_y(θ): x' = x cos θ + z sin θ, z' = -x sin θ + z cos θ.
  const x = p.x * cos + p.z * sin;
  const z = -p.x * sin + p.z * cos;
  return out.set(x + cell.x * TILE, p.y + cell.y * LEVEL, z + cell.z * TILE);
}

/** Rota un vector local (sense translació). */
export function rotateVector(v: Vec3, r: Rotation, out: Vec3): Vec3 {
  const cos = [1, 0, -1, 0][r];
  const sin = [0, 1, 0, -1][r];
  const x = v.x * cos + v.z * sin;
  const z = -v.x * sin + v.z * cos;
  return out.set(x, v.y, z);
}

export function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** Clau d'una aresta entre cel·les (en unitats de mitja cel·la) i nivell. */
export function edgeKey(x: number, y: number, z: number, dir: number): string {
  return `${2 * x + DIR_X[dir]},${y},${2 * z + DIR_Z[dir]}`;
}

/** Límits de la graella: x i z dins de [-GRID_HALF, GRID_HALF), y dins de [0, MAX_LEVEL]. */
export const GRID_HALF = 24;
export const MAX_LEVEL = 10;
export const MAX_PIECES = 600;

export function inGrid(x: number, y: number, z: number): boolean {
  return (
    x >= -GRID_HALF && x < GRID_HALF && z >= -GRID_HALF && z < GRID_HALF && y >= 0 && y <= MAX_LEVEL
  );
}
