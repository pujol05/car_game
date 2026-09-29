// Tipus de dades dels circuits. Un circuit és una llista de peces sobre una
// graella 3D; es pot serialitzar directament a JSON.

import type { MedalTimes } from '../race/medals';

export const PIECE_TYPES = [
  'straight',
  'curveSmall',
  'curveLarge',
  'slope',
  'ramp',
  'loop',
  'boost',
  'checkpoint',
  'start',
  'finish',
  'startFinish',
  'obstacle',
] as const;

export type PieceType = (typeof PIECE_TYPES)[number];

/** Rotació en passos de 90° al voltant de l'eix vertical. */
export type Rotation = 0 | 1 | 2 | 3;

export interface PieceData {
  type: PieceType;
  /** Cel·la d'ancoratge a la graella. */
  x: number;
  y: number;
  z: number;
  r: Rotation;
}

export interface TrackData {
  name: string;
  author: string;
  /** Nombre de voltes (1 en circuits de sortida i meta separades). */
  laps: number;
  pieces: PieceData[];
  /** Temps de les medalles (només als circuits oficials). */
  medals?: MedalTimes;
}

export function isPieceType(value: unknown): value is PieceType {
  return typeof value === 'string' && (PIECE_TYPES as readonly string[]).includes(value);
}
