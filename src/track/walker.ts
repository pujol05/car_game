// Eina per dissenyar circuits encadenant peces com una "tortuga": cada peça
// s'enganxa a la sortida de l'anterior. Garanteix que les peces connectin.

import { DIR_X, DIR_Z, rotateXZ } from './grid';
import { PIECES } from './pieces';
import type { PieceData, PieceType, Rotation } from './types';

export class TrackWalker {
  readonly pieces: PieceData[] = [];
  /** Per a cada peça, si es recorre en sentit invers (connector 1 → 0). */
  readonly reversed: boolean[] = [];

  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    /** Direcció de marxa (0 = +Z, 1 = +X, 2 = -Z, 3 = -X). */
    public dir = 0,
  ) {}

  /**
   * Col·loca una peça a la cel·la actual. `reverse` la recorre al revés:
   * una corba passa a girar a l'esquerra i una pujada passa a ser baixada.
   */
  place(type: PieceType, reverse = false): this {
    const def = PIECES[type];
    const entry = def.connectors[reverse ? 1 : 0];
    const exit = def.connectors[reverse ? 0 : 1];
    const r = ((((this.dir + 2 - entry.dir) % 4) + 4) % 4) as Rotation;
    const [ex, ez] = rotateXZ(entry.cell[0], entry.cell[2], r);
    const anchor = { x: this.x - ex, y: this.y - entry.cell[1], z: this.z - ez };
    this.pieces.push({ type, ...anchor, r });
    this.reversed.push(reverse);

    const [xx, xz] = rotateXZ(exit.cell[0], exit.cell[2], r);
    const exitDir = (exit.dir + r) % 4;
    this.x = anchor.x + xx + DIR_X[exitDir];
    this.y = anchor.y + exit.cell[1];
    this.z = anchor.z + xz + DIR_Z[exitDir];
    this.dir = exitDir;
    return this;
  }

  straight(count = 1): this {
    for (let i = 0; i < count; i++) this.place('straight');
    return this;
  }

  right(large = false): this {
    return this.place(large ? 'curveLarge' : 'curveSmall');
  }

  left(large = false): this {
    return this.place(large ? 'curveLarge' : 'curveSmall', true);
  }

  up(): this {
    return this.place('slope');
  }

  down(): this {
    return this.place('slope', true);
  }
}
