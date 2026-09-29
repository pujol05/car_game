// Connectivitat entre peces: quins connectors coincideixen i quin és el
// recorregut de la cursa des de la sortida.

import { DIR_X, DIR_Z, edgeKey, oppositeDir, rotateDir, rotateXZ } from './grid';
import { PIECES } from './pieces';
import type { PieceData } from './types';

export interface ConnectorInfo {
  piece: number;
  connector: 0 | 1;
  /** Cel·la de món on és el connector. */
  x: number;
  y: number;
  z: number;
  /** Direcció de món cap a fora de la peça. */
  dir: number;
  key: string;
  jump: boolean;
}

/** Distància màxima (en cel·les) d'un salt des d'una rampa. */
export const JUMP_RANGE = 5;
/** Nivells que es poden baixar en un salt. */
export const JUMP_DROP = 3;

export function pieceConnectors(p: PieceData, index: number): [ConnectorInfo, ConnectorInfo] {
  const make = (ci: 0 | 1): ConnectorInfo => {
    const c = PIECES[p.type].connectors[ci];
    const [rx, rz] = rotateXZ(c.cell[0], c.cell[2], p.r);
    const x = p.x + rx;
    const y = p.y + c.cell[1];
    const z = p.z + rz;
    const dir = rotateDir(c.dir, p.r);
    return {
      piece: index,
      connector: ci,
      x,
      y,
      z,
      dir,
      key: edgeKey(x, y, z, dir),
      jump: !!c.jump,
    };
  };
  return [make(0), make(1)];
}

export class ConnectorIndex {
  readonly connectors: [ConnectorInfo, ConnectorInfo][];
  private readonly byKey = new Map<string, ConnectorInfo[]>();

  constructor(readonly pieces: readonly PieceData[]) {
    this.connectors = pieces.map((p, i) => pieceConnectors(p, i));
    for (const pair of this.connectors) {
      for (const c of pair) {
        const list = this.byKey.get(c.key);
        if (list) list.push(c);
        else this.byKey.set(c.key, [c]);
      }
    }
  }

  /** Connector enllaçat amb `from` (inclosos els salts de rampa). */
  link(from: ConnectorInfo): ConnectorInfo | null {
    const direct = this.byKey.get(from.key)?.find((c) => c.piece !== from.piece);
    if (direct) return direct;
    if (!from.jump) return null;
    const back = oppositeDir(from.dir);
    for (let k = 1; k <= JUMP_RANGE; k++) {
      const x = from.x + DIR_X[from.dir] * k;
      const z = from.z + DIR_Z[from.dir] * k;
      for (let y = from.y; y >= Math.max(0, from.y - JUMP_DROP); y--) {
        const landing = this.byKey
          .get(edgeKey(x, y, z, back))
          ?.find((c) => c.piece !== from.piece && c.dir === back);
        if (landing) return landing;
      }
    }
    return null;
  }
}

export interface RouteStep {
  piece: number;
  /** Cert si la peça es recorre del connector 1 al 0. */
  reversed: boolean;
}

export type RouteEnd = 'loop' | 'finish' | 'deadEnd' | 'wrongWay' | 'revisit' | 'noStart';

export interface Route {
  steps: RouteStep[];
  end: RouteEnd;
  /** Peces de desacceleració connectades després de la meta. */
  runOff?: number[];
  /** Connector on s'acaba el recorregut quan no es pot continuar. */
  stuckAt?: ConnectorInfo;
}

/** Recorre el circuit des de la primera peça de sortida. */
export function traceRoute(pieces: readonly PieceData[]): Route {
  const start = pieces.findIndex((p) => p.type === 'start' || p.type === 'startFinish');
  if (start < 0) return { steps: [], end: 'noStart' };
  const index = new ConnectorIndex(pieces);
  const steps: RouteStep[] = [{ piece: start, reversed: false }];
  const visited = new Set([start]);
  let exit = index.connectors[start][1];

  for (let guard = 0; guard <= pieces.length; guard++) {
    const next = index.link(exit);
    if (!next) return { steps, end: 'deadEnd', stuckAt: exit };
    const piece = pieces[next.piece];
    if (next.piece === start) {
      if (piece.type === 'startFinish' && next.connector === 0) return { steps, end: 'loop' };
      return { steps, end: next.connector === 0 ? 'revisit' : 'wrongWay', stuckAt: next };
    }
    if (visited.has(next.piece)) return { steps, end: 'revisit', stuckAt: next };
    visited.add(next.piece);
    steps.push({ piece: next.piece, reversed: next.connector === 1 });
    if (piece.type === 'finish') {
      return next.connector === 0
        ? { steps, end: 'finish', runOff: followRunOff(index, next.piece, visited) }
        : { steps, end: 'wrongWay', stuckAt: next };
    }
    exit = index.connectors[next.piece][next.connector === 0 ? 1 : 0];
  }
  return { steps, end: 'revisit' };
}

/** Peces que continuen després de la meta (zona de frenada). */
function followRunOff(index: ConnectorIndex, finish: number, visited: Set<number>): number[] {
  const out: number[] = [];
  let piece = finish;
  let exit = index.connectors[finish][1];
  for (let guard = 0; guard < index.pieces.length; guard++) {
    const next = index.link(exit);
    if (!next || visited.has(next.piece) || next.piece === piece) break;
    visited.add(next.piece);
    out.push(next.piece);
    piece = next.piece;
    exit = index.connectors[piece][next.connector === 0 ? 1 : 0];
  }
  return out;
}
