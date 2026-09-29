// Definicions de les peces del circuit. Cada peça treballa en coordenades
// locals: la cel·la d'ancoratge està centrada a l'origen, la calçada del
// nivell 0 és a y = 0 i l'entrada és a z = -TILE/2 (es circula cap a +Z).
// La dreta local és -X.

import { Vec3 } from '../core/math';
import { Surface } from '../physics/collision';
import { RIDE_HEIGHT } from '../physics/vehicle';
import type { GeometryBuilder } from './geometry';
import { LEVEL, TILE } from './grid';
import {
  type Frame,
  type FrameFn,
  ROAD_HALF,
  WALL_THICKNESS,
  buildSweep,
  makeFrame,
} from './sweep';
import type { PieceType } from './types';

export type TriggerKind = 'checkpoint' | 'finish' | 'startFinish' | 'boost';

/** Caixa de detecció local. Les línies es creuen pel pla z = center.z. */
export interface LocalTrigger {
  kind: TriggerKind;
  center: Vec3;
  half: Vec3;
}

export interface PieceFeatures {
  triggers: LocalTrigger[];
  /** Punt de sortida del cotxe (mirant a +Z local). */
  spawn?: Vec3;
  /** Línia central de la peça, des del connector 0 fins al connector 1. */
  route: Frame[];
}

export interface ConnectorDef {
  cell: readonly [number, number, number];
  /** Direcció cap a fora de la peça. */
  dir: number;
  /** Connector de salt: pot enllaçar amb una peça més endavant, amb un buit. */
  jump?: boolean;
}

export interface PieceDef {
  type: PieceType;
  label: string;
  cells: readonly (readonly [number, number, number])[];
  connectors: readonly [ConnectorDef, ConnectorDef];
  build(g: GeometryBuilder): PieceFeatures;
}

const HALF = TILE / 2;
export const RAMP_HEIGHT = 3.5;
export const LOOP_RADIUS = 14;
const UP = new Vec3(0, 1, 0);

const ARCH_COLORS = {
  checkpoint: { frame: 0x16c6ff, light: 0x8ff6ff },
  start: { frame: 0x2fd67b, light: 0xb4ffd6 },
  finish: { frame: 0xff4d6d, light: 0xffd6de },
  startFinish: { frame: 0xffb81f, light: 0xfff0b3 },
} as const;

// --- Corbes paramètriques ---

function straightFrames(from: Vec3, to: Vec3): FrameFn {
  const t = to.clone().sub(from).normalize();
  return (s) => makeFrame(from.clone().lerp(to, s), t, UP);
}

/** Arc de 90° cap a la dreta, començant a (0, 0, -HALF) i mirant a +Z. */
function rightArc(radius: number): FrameFn {
  return (s) => {
    const a = (s * Math.PI) / 2;
    const p = new Vec3(-radius + radius * Math.cos(a), 0, -HALF + radius * Math.sin(a));
    return makeFrame(p, new Vec3(-Math.sin(a), 0, Math.cos(a)), UP);
  };
}

/**
 * Perfil vertical y(s) al llarg d'un tram recte de `cells` cel·les.
 * `slope` és la derivada dy/ds.
 */
function profileFrames(
  height: (s: number) => number,
  slope: (s: number) => number,
  cells = 1,
): FrameFn {
  const length = TILE * cells;
  return (s) => {
    const p = new Vec3(0, height(s), -HALF + s * length);
    const t = new Vec3(0, slope(s), length).normalize();
    return makeFrame(p, t, new Vec3(0, t.z, -t.y));
  };
}

function loopFrames(): FrameFn {
  const R = LOOP_RADIUS;
  return (s) => {
    const a = s * Math.PI * 2;
    const shift = s * s * (3 - 2 * s);
    const p = new Vec3(-TILE * shift, R * (1 - Math.cos(a)), HALF + R * Math.sin(a));
    const t = new Vec3(
      -TILE * 6 * s * (1 - s),
      2 * Math.PI * R * Math.sin(a),
      2 * Math.PI * R * Math.cos(a),
    );
    return makeFrame(p, t, new Vec3(0, Math.cos(a), -Math.sin(a)));
  };
}

// --- Elements decoratius i funcionals ---

function straightRoad(g: GeometryBuilder): Frame[] {
  return buildSweep(g, straightFrames(new Vec3(0, 0, -HALF), new Vec3(0, 0, HALF)), {
    segments: 4,
  });
}

function arch(g: GeometryBuilder, z: number, kind: keyof typeof ARCH_COLORS): void {
  const { frame, light } = ARCH_COLORS[kind];
  const px = ROAD_HALF + WALL_THICKNESS + 0.8;
  for (const side of [-1, 1]) {
    g.box(new Vec3(side * px, 3.6, z), new Vec3(0.55, 3.6, 0.55), frame, { collide: Surface.Wall });
  }
  g.box(new Vec3(0, 6.8, z), new Vec3(px + 0.55, 0.5, 0.55), frame);
  g.box(new Vec3(0, 6.15, z), new Vec3(px - 0.6, 0.15, 0.3), light, { glow: true });
}

/** Línia pintada a terra centrada a z (a quadres per a la meta). */
function line(g: GeometryBuilder, z: number, checkered: boolean, color: number): void {
  const y = 0.03;
  const depth = checkered ? 1 : 0.6;
  const cols = checkered ? 12 : 1;
  const rows = checkered ? 2 : 1;
  const w = (ROAD_HALF * 2) / cols;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x0 = -ROAD_HALF + c * w;
      const z0 = z - (rows * depth) / 2 + r * depth;
      const col = checkered ? ((c + r) % 2 === 0 ? 0x111111 : 0xffffff) : color;
      g.quad(
        new Vec3(x0, y, z0),
        new Vec3(x0 + w, y, z0),
        new Vec3(x0 + w, y, z0 + depth),
        new Vec3(x0, y, z0 + depth),
        UP,
        col,
        { glow: !checkered },
      );
    }
  }
}

function lineTrigger(kind: TriggerKind, z: number): LocalTrigger {
  return {
    kind,
    center: new Vec3(0, 3, z),
    half: new Vec3(ROAD_HALF + WALL_THICKNESS, 4, 3),
  };
}

function boostChevrons(g: GeometryBuilder): void {
  const y = 0.04;
  for (const [i, z] of [-6, 0, 6].entries()) {
    const color = i % 2 === 0 ? 0xff8a00 : 0xffd400;
    // Fletxa en forma de V que apunta cap a +Z.
    for (const side of [-1, 1]) {
      g.quad(
        new Vec3(0, y, z + 1.5),
        new Vec3(side * 4.5, y, z - 1.5),
        new Vec3(side * 4.5, y, z - 3.3),
        new Vec3(0, y, z - 0.3),
        UP,
        color,
        { glow: true },
      );
    }
  }
}

// --- Definicions ---

const STRAIGHT_CONNECTORS: readonly [ConnectorDef, ConnectorDef] = [
  { cell: [0, 0, 0], dir: 2 },
  { cell: [0, 0, 0], dir: 0 },
];
const SINGLE_CELL = [[0, 0, 0]] as const;

export const PIECES: Record<PieceType, PieceDef> = {
  straight: {
    type: 'straight',
    label: 'Recta',
    cells: SINGLE_CELL,
    connectors: STRAIGHT_CONNECTORS,
    build: (g) => ({ triggers: [], route: straightRoad(g) }),
  },
  curveSmall: {
    type: 'curveSmall',
    label: 'Corba tancada',
    cells: SINGLE_CELL,
    connectors: [
      { cell: [0, 0, 0], dir: 2 },
      { cell: [0, 0, 0], dir: 3 },
    ],
    build: (g) => ({ triggers: [], route: buildSweep(g, rightArc(HALF), { segments: 10 }) }),
  },
  curveLarge: {
    type: 'curveLarge',
    label: 'Corba oberta',
    cells: [
      [0, 0, 0],
      [0, 0, 1],
      [-1, 0, 0],
      [-1, 0, 1],
    ],
    connectors: [
      { cell: [0, 0, 0], dir: 2 },
      { cell: [-1, 0, 1], dir: 3 },
    ],
    build: (g) => ({
      triggers: [],
      route: buildSweep(g, rightArc(TILE * 1.5), { segments: 24 }),
    }),
  },
  slope: {
    type: 'slope',
    label: 'Pujada / baixada',
    // Dues cel·les de llarg per un nivell d'alçada: prou suau per no sortir
    // volant a velocitats normals.
    cells: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
      [0, 1, 1],
    ],
    connectors: [
      { cell: [0, 0, 0], dir: 2 },
      { cell: [0, 1, 1], dir: 0 },
    ],
    build: (g) => ({
      triggers: [],
      route: buildSweep(
        g,
        profileFrames(
          (s) => (LEVEL * (1 - Math.cos(Math.PI * s))) / 2,
          (s) => (LEVEL * Math.PI * Math.sin(Math.PI * s)) / 2,
          2,
        ),
        { segments: 20 },
      ),
    }),
  },
  ramp: {
    type: 'ramp',
    label: 'Rampa de salt',
    cells: SINGLE_CELL,
    connectors: [
      { cell: [0, 0, 0], dir: 2 },
      { cell: [0, 0, 0], dir: 0, jump: true },
    ],
    build: (g) => ({
      triggers: [],
      route: buildSweep(
        g,
        profileFrames(
          (s) => RAMP_HEIGHT * s * s,
          (s) => 2 * RAMP_HEIGHT * s,
        ),
        { segments: 12, solidEndCap: true, wallTopColor: 0xff8a00 },
      ),
    }),
  },
  loop: {
    type: 'loop',
    label: 'Looping',
    cells: [0, 1, 2, 3, 4, 5].flatMap((y) => [
      [0, y, 0] as const,
      [0, y, 1] as const,
      [-1, y, 0] as const,
      [-1, y, 1] as const,
    ]),
    connectors: [
      { cell: [0, 0, 0], dir: 2 },
      { cell: [-1, 0, 1], dir: 0 },
    ],
    build: (g) => {
      const leadIn = buildSweep(g, straightFrames(new Vec3(0, 0, -HALF), new Vec3(0, 0, HALF)), {
        segments: 4,
      });
      const circle = buildSweep(g, loopFrames(), { segments: 72, wallTopColor: 0xb44dff });
      const leadOut = buildSweep(
        g,
        straightFrames(new Vec3(-TILE, 0, HALF), new Vec3(-TILE, 0, TILE + HALF)),
        { segments: 4 },
      );
      return { triggers: [], route: [...leadIn, ...circle.slice(1), ...leadOut.slice(1)] };
    },
  },
  boost: {
    type: 'boost',
    label: 'Turbo',
    cells: SINGLE_CELL,
    connectors: STRAIGHT_CONNECTORS,
    build: (g) => {
      const route = straightRoad(g);
      boostChevrons(g);
      return {
        route,
        triggers: [
          { kind: 'boost', center: new Vec3(0, 1.5, 0), half: new Vec3(ROAD_HALF, 2.5, 8) },
        ],
      };
    },
  },
  checkpoint: {
    type: 'checkpoint',
    label: 'Checkpoint',
    cells: SINGLE_CELL,
    connectors: STRAIGHT_CONNECTORS,
    build: (g) => {
      const route = straightRoad(g);
      arch(g, 0, 'checkpoint');
      line(g, 0, false, ARCH_COLORS.checkpoint.light);
      return { route, triggers: [lineTrigger('checkpoint', 0)] };
    },
  },
  start: {
    type: 'start',
    label: 'Sortida',
    cells: SINGLE_CELL,
    connectors: STRAIGHT_CONNECTORS,
    build: (g) => {
      const route = straightRoad(g);
      arch(g, 4, 'start');
      line(g, 4, false, ARCH_COLORS.start.light);
      return { route, triggers: [], spawn: new Vec3(0, RIDE_HEIGHT, -3) };
    },
  },
  finish: {
    type: 'finish',
    label: 'Meta',
    cells: SINGLE_CELL,
    connectors: STRAIGHT_CONNECTORS,
    build: (g) => {
      const route = straightRoad(g);
      arch(g, 0, 'finish');
      line(g, 0, true, 0);
      return { route, triggers: [lineTrigger('finish', 0)] };
    },
  },
  startFinish: {
    type: 'startFinish',
    label: 'Sortida i meta',
    cells: SINGLE_CELL,
    connectors: STRAIGHT_CONNECTORS,
    build: (g) => {
      const route = straightRoad(g);
      arch(g, -6, 'startFinish');
      line(g, -6, true, 0);
      return {
        route,
        triggers: [lineTrigger('startFinish', -6)],
        spawn: new Vec3(0, RIDE_HEIGHT, 1),
      };
    },
  },
  obstacle: {
    type: 'obstacle',
    label: 'Obstacles',
    cells: SINGLE_CELL,
    connectors: STRAIGHT_CONNECTORS,
    build: (g) => {
      straightRoad(g);
      // Dos blocs alterns obliguen a fer una petita esse.
      const opts = { collide: Surface.Wall };
      g.box(new Vec3(3.05, 0.75, -5), new Vec3(2.75, 0.75, 1), 0xff7a00, opts, 0x262630);
      g.box(new Vec3(-3.05, 0.75, 5), new Vec3(2.75, 0.75, 1), 0xff7a00, opts, 0x262630);
      // La línia de conducció esquiva els blocs.
      const weave: FrameFn = (s) => {
        const z = -HALF + s * TILE;
        const k = (2 * Math.PI) / TILE;
        const p = new Vec3(-2.2 * Math.sin(k * (z + HALF)), 0, z);
        const t = new Vec3(-2.2 * k * Math.cos(k * (z + HALF)), 0, 1);
        return makeFrame(p, t, UP);
      };
      const route: Frame[] = [];
      for (let i = 0; i <= 10; i++) route.push(weave(i / 10));
      return { route, triggers: [] };
    },
  },
};
