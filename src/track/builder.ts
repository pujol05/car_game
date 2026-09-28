// Construeix un circuit jugable a partir de les seves dades: malla visual,
// món de col·lisions, triggers (checkpoints, meta, turbos) i punt de sortida.

import { Vec3 } from '../core/math';
import { CollisionWorld, Surface } from '../physics/collision';
import { GeometryBuilder, type PlainMesh } from './geometry';
import { GROUND_Y, LEVEL, TILE, cellKey, rotateXZ, rotationAngle } from './grid';
import { type PieceDef, PIECES, type TriggerKind } from './pieces';
import { type Frame, SLAB } from './sweep';
import type { PieceData, TrackData } from './types';

export interface Trigger {
  kind: TriggerKind;
  pieceIndex: number;
  center: Vec3;
  axisX: Vec3;
  axisY: Vec3;
  axisZ: Vec3;
  half: Vec3;
}

export interface BuiltPiece {
  data: PieceData;
  def: PieceDef;
  /** Línia central en coordenades de món (del connector 0 al 1). */
  route: Frame[];
}

export interface BuiltTrack {
  data: TrackData;
  world: CollisionWorld;
  solid: PlainMesh;
  glow: PlainMesh;
  pieces: BuiltPiece[];
  triggers: Trigger[];
  checkpointCount: number;
  spawn: { pos: Vec3; heading: number };
  /** Cert si té peça de sortida i meta (circuit de voltes). */
  lapTrack: boolean;
  laps: number;
  bounds: { min: Vec3; max: Vec3 };
}

/** Cel·les de món ocupades per una peça. */
export function worldCells(piece: PieceData): [number, number, number][] {
  return PIECES[piece.type].cells.map(([cx, cy, cz]) => {
    const [rx, rz] = rotateXZ(cx, cz, piece.r);
    return [piece.x + rx, piece.y + cy, piece.z + rz];
  });
}

export function buildTrack(data: TrackData): BuiltTrack {
  const world = new CollisionWorld();
  world.groundY = GROUND_Y;
  world.groundMaterial = Surface.Grass;
  const g = new GeometryBuilder(world);

  const pieces: BuiltPiece[] = [];
  const triggers: Trigger[] = [];
  let spawn: BuiltTrack['spawn'] | null = null;
  const occupied = new Set<string>();
  for (const p of data.pieces) for (const c of worldCells(p)) occupied.add(cellKey(...c));

  data.pieces.forEach((piece, index) => {
    const def = PIECES[piece.type];
    g.setTransform(piece, piece.r);
    const features = def.build(g);
    const route = features.route.map((f) => ({
      p: g.toWorld(f.p),
      t: g.dirToWorld(f.t),
      u: g.dirToWorld(f.u),
    }));
    pieces.push({ data: piece, def, route });

    for (const t of features.triggers) {
      triggers.push({
        kind: t.kind,
        pieceIndex: index,
        center: g.toWorld(t.center),
        axisX: g.dirToWorld(new Vec3(1, 0, 0)),
        axisY: new Vec3(0, 1, 0),
        axisZ: g.dirToWorld(new Vec3(0, 0, 1)),
        half: t.half.clone(),
      });
    }
    if (features.spawn && !spawn) {
      spawn = { pos: g.toWorld(features.spawn), heading: rotationAngle(piece.r) };
    }
  });

  addPillars(g, pieces, occupied);
  world.build();

  const lapTrack = data.pieces.some((p) => p.type === 'startFinish');
  const bounds = computeBounds(g.solid);
  return {
    data,
    world,
    solid: g.solid,
    glow: g.glow,
    pieces,
    triggers,
    checkpointCount: triggers.filter((t) => t.kind === 'checkpoint').length,
    spawn: spawn ?? { pos: new Vec3(0, 1, 0), heading: 0 },
    lapTrack,
    laps: lapTrack ? Math.max(1, Math.floor(data.laps)) : 1,
    bounds,
  };
}

/** Pilars sota les peces elevades, si no hi ha cap altra peça a sota. */
function addPillars(g: GeometryBuilder, pieces: BuiltPiece[], occupied: Set<string>): void {
  g.setTransform({ x: 0, y: 0, z: 0 }, 0);
  const done = new Set<string>();
  for (const piece of pieces) {
    if (piece.data.y <= 0 || piece.route.length === 0) continue;
    const mid = piece.route[Math.floor(piece.route.length / 2)];
    if (mid.u.y < 0.9) continue;
    const cx = Math.round(mid.p.x / TILE);
    const cz = Math.round(mid.p.z / TILE);
    const level = Math.floor((mid.p.y + 0.01) / LEVEL);
    const key = cellKey(cx, level, cz);
    if (done.has(key)) continue;
    let blocked = false;
    for (let y = 0; y < level; y++) if (occupied.has(cellKey(cx, y, cz))) blocked = true;
    if (blocked) continue;
    done.add(key);
    const top = mid.p.y - SLAB;
    const height = top - GROUND_Y;
    if (height <= 0.5) continue;
    g.box(
      new Vec3(mid.p.x, GROUND_Y + height / 2, mid.p.z),
      new Vec3(1.2, height / 2, 1.2),
      0xb9c0cf,
      { collide: Surface.Wall },
      0x9aa2b3,
    );
  }
}

function computeBounds(mesh: PlainMesh): { min: Vec3; max: Vec3 } {
  const min = new Vec3(Infinity, Infinity, Infinity);
  const max = new Vec3(-Infinity, -Infinity, -Infinity);
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    min.set(Math.min(min.x, p[i]), Math.min(min.y, p[i + 1]), Math.min(min.z, p[i + 2]));
    max.set(Math.max(max.x, p[i]), Math.max(max.y, p[i + 1]), Math.max(max.z, p[i + 2]));
  }
  if (p.length === 0) {
    min.set(-TILE, GROUND_Y, -TILE);
    max.set(TILE, LEVEL, TILE);
  }
  return { min, max };
}
