// Escombrat d'una secció de carretera al llarg d'una corba paramètrica.
// Genera la calçada, les vorades, les parets laterals i la llosa inferior.

import { Vec3 } from '../core/math';
import { Surface } from '../physics/collision';
import type { GeometryBuilder } from './geometry';

/** Meitat de l'amplada de la calçada. */
export const ROAD_HALF = 6;
/** Amplada de les vorades pintades. */
export const KERB = 0.8;
export const WALL_HEIGHT = 1.2;
export const WALL_THICKNESS = 0.6;
/** Gruix de la llosa per sota de la calçada. */
export const SLAB = 0.8;

export const COLORS = {
  asphalt: 0x44475a,
  kerbA: 0xff3b4e,
  kerbB: 0xf7f7f7,
  wallInner: 0xf1f3f8,
  wallTop: 0x2f7dff,
  wallOuter: 0xc9d0dc,
  slab: 0x8b93a6,
};

export interface Frame {
  /** Posició del centre de la calçada. */
  p: Vec3;
  /** Tangent (sentit de marxa), unitària. */
  t: Vec3;
  /** Normal de la calçada, unitària i perpendicular a t. */
  u: Vec3;
}

export type FrameFn = (s: number) => Frame;

export interface SweepOptions {
  segments: number;
  walls?: boolean;
  /** Tapa final amb col·lisió (p. ex. el llavi d'una rampa). */
  solidEndCap?: boolean;
  wallTopColor?: number;
}

/** Construeix un marc a partir d'una posició, una tangent i una normal aproximada. */
export function makeFrame(p: Vec3, tangent: Vec3, upHint: Vec3): Frame {
  const t = tangent.clone().normalize();
  const u = upHint.clone().addScaled(t, -upHint.dot(t)).normalize();
  return { p, t, u };
}

interface Section {
  f: Frame;
  right: Vec3;
  roadL: Vec3;
  roadR: Vec3;
  kerbL: Vec3;
  kerbR: Vec3;
  wallTopInL: Vec3;
  wallTopInR: Vec3;
  wallTopOutL: Vec3;
  wallTopOutR: Vec3;
  outL: Vec3;
  outR: Vec3;
  botL: Vec3;
  botR: Vec3;
}

function section(f: Frame): Section {
  const right = new Vec3().crossVectors(f.t, f.u).normalize();
  const at = (side: number, up: number) => f.p.clone().addScaled(right, side).addScaled(f.u, up);
  const w = ROAD_HALF;
  const outer = ROAD_HALF + WALL_THICKNESS;
  return {
    f,
    right,
    roadL: at(-w, 0),
    roadR: at(w, 0),
    kerbL: at(-w + KERB, 0),
    kerbR: at(w - KERB, 0),
    wallTopInL: at(-w, WALL_HEIGHT),
    wallTopInR: at(w, WALL_HEIGHT),
    wallTopOutL: at(-outer, WALL_HEIGHT),
    wallTopOutR: at(outer, WALL_HEIGHT),
    outL: at(-outer, 0),
    outR: at(outer, 0),
    botL: at(-outer, -SLAB),
    botR: at(outer, -SLAB),
  };
}

export function buildSweep(g: GeometryBuilder, frameAt: FrameFn, opts: SweepOptions): Frame[] {
  const walls = opts.walls ?? true;
  const wallTop = opts.wallTopColor ?? COLORS.wallTop;
  const sections: Section[] = [];
  for (let i = 0; i <= opts.segments; i++) sections.push(section(frameAt(i / opts.segments)));

  for (let i = 0; i < opts.segments; i++) {
    const a = sections[i];
    const b = sections[i + 1];
    const up = new Vec3().copy(a.f.u).add(b.f.u).normalize();
    const rightAvg = new Vec3().copy(a.right).add(b.right).normalize();
    const left = rightAvg.clone().scale(-1);
    const down = up.clone().scale(-1);
    const kerb = i % 2 === 0 ? COLORS.kerbA : COLORS.kerbB;

    // Calçada: visual en tres franges, col·lisió en una sola amb normals suaus.
    g.quad(a.roadL, a.kerbL, b.kerbL, b.roadL, up, kerb);
    g.quad(a.kerbL, a.kerbR, b.kerbR, b.kerbL, up, COLORS.asphalt);
    g.quad(a.kerbR, a.roadR, b.roadR, b.kerbR, up, kerb);
    g.quad(a.roadL, a.roadR, b.roadR, b.roadL, up, 0, { collide: Surface.Road, invisible: true }, [
      a.f.u,
      a.f.u,
      b.f.u,
      b.f.u,
    ]);

    const solid = { collide: Surface.Wall };
    if (walls) {
      // Paret dreta: cara interior, superior i exterior.
      g.quad(a.roadR, a.wallTopInR, b.wallTopInR, b.roadR, left, COLORS.wallInner, solid);
      g.quad(a.wallTopInR, a.wallTopOutR, b.wallTopOutR, b.wallTopInR, up, wallTop, solid);
      g.quad(a.wallTopOutR, a.botR, b.botR, b.wallTopOutR, rightAvg, COLORS.wallOuter, solid);
      // Paret esquerra.
      g.quad(a.roadL, a.wallTopInL, b.wallTopInL, b.roadL, rightAvg, COLORS.wallInner, solid);
      g.quad(a.wallTopInL, a.wallTopOutL, b.wallTopOutL, b.wallTopInL, up, wallTop, solid);
      g.quad(a.wallTopOutL, a.botL, b.botL, b.wallTopOutL, left, COLORS.wallOuter, solid);
    } else {
      g.quad(a.roadR, a.botR, b.botR, b.roadR, rightAvg, COLORS.wallOuter, solid);
      g.quad(a.roadL, a.botL, b.botL, b.roadL, left, COLORS.wallOuter, solid);
    }
    // Llosa inferior.
    g.quad(a.botL, a.botR, b.botR, b.botL, down, COLORS.slab, solid);
  }

  const first = sections[0];
  const last = sections[sections.length - 1];
  cap(g, first, first.f.t.clone().scale(-1), walls, false);
  cap(g, last, last.f.t.clone(), walls, opts.solidEndCap ?? false);
  return sections.map((s) => s.f);
}

/** Tapa la secció transversal (visible als extrems oberts). */
function cap(g: GeometryBuilder, s: Section, outward: Vec3, walls: boolean, solid: boolean): void {
  const opts = solid ? { collide: Surface.Wall } : {};
  const top = walls ? WALL_HEIGHT : 0;
  const w = ROAD_HALF + WALL_THICKNESS;
  const at = (side: number, up: number) =>
    s.f.p.clone().addScaled(s.right, side).addScaled(s.f.u, up);
  // Llosa (de la calçada cap avall).
  g.quad(at(-w, 0), at(w, 0), at(w, -SLAB), at(-w, -SLAB), outward, COLORS.slab, opts);
  if (top > 0) {
    g.quad(
      at(ROAD_HALF, 0),
      at(w, 0),
      at(w, top),
      at(ROAD_HALF, top),
      outward,
      COLORS.wallOuter,
      opts,
    );
    g.quad(
      at(-w, 0),
      at(-ROAD_HALF, 0),
      at(-ROAD_HALF, top),
      at(-w, top),
      outward,
      COLORS.wallOuter,
      opts,
    );
  }
}
