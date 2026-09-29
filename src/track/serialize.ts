// Serialització de circuits a codis compartibles (comprimits amb lz-string)
// i enllaços amb el codi al hash de l'URL.

import LZString from 'lz-string';
import { GRID_HALF, MAX_LEVEL, MAX_PIECES } from './grid';
import { PIECE_TYPES, type PieceData, type Rotation, type TrackData } from './types';

const CODE_VERSION = 1;
const HASH_PREFIX = '#track=';
export const MAX_NAME_LENGTH = 40;
export const MAX_AUTHOR_LENGTH = 30;

interface CompactTrack {
  v: number;
  n: string;
  a: string;
  l: number;
  p: [number, number, number, number, number][];
}

export function encodeTrack(data: TrackData): string {
  const compact: CompactTrack = {
    v: CODE_VERSION,
    n: data.name.slice(0, MAX_NAME_LENGTH),
    a: data.author.slice(0, MAX_AUTHOR_LENGTH),
    l: data.laps,
    p: data.pieces.map((p) => [PIECE_TYPES.indexOf(p.type), p.x, p.y, p.z, p.r]),
  };
  return LZString.compressToEncodedURIComponent(JSON.stringify(compact));
}

export class TrackCodeError extends Error {}

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

/** Descodifica un codi de circuit. Llança TrackCodeError si no és vàlid. */
export function decodeTrack(code: string): TrackData {
  const trimmed = code.trim();
  const json = trimmed ? LZString.decompressFromEncodedURIComponent(trimmed) : null;
  if (!json) throw new TrackCodeError('El codi no és vàlid.');
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new TrackCodeError('El codi no és vàlid.');
  }
  if (!raw || typeof raw !== 'object') throw new TrackCodeError('El codi no és vàlid.');
  const c = raw as Partial<CompactTrack>;
  if (c.v !== CODE_VERSION) {
    throw new TrackCodeError('Aquest codi és d’una versió desconeguda.');
  }
  if (typeof c.n !== 'string' || typeof c.a !== 'string' || !isInt(c.l, 1, 9)) {
    throw new TrackCodeError('Les dades del circuit no són vàlides.');
  }
  if (!Array.isArray(c.p) || c.p.length > MAX_PIECES) {
    throw new TrackCodeError('La llista de peces no és vàlida.');
  }
  const pieces: PieceData[] = c.p.map((entry: unknown) => {
    if (
      !Array.isArray(entry) ||
      entry.length !== 5 ||
      !isInt(entry[0], 0, PIECE_TYPES.length - 1) ||
      !isInt(entry[1], -GRID_HALF, GRID_HALF - 1) ||
      !isInt(entry[2], 0, MAX_LEVEL) ||
      !isInt(entry[3], -GRID_HALF, GRID_HALF - 1) ||
      !isInt(entry[4], 0, 3)
    ) {
      throw new TrackCodeError('Hi ha una peça amb dades incorrectes.');
    }
    return {
      type: PIECE_TYPES[entry[0]],
      x: entry[1],
      y: entry[2],
      z: entry[3],
      r: entry[4] as Rotation,
    };
  });
  return {
    name: c.n.slice(0, MAX_NAME_LENGTH),
    author: c.a.slice(0, MAX_AUTHOR_LENGTH),
    laps: c.l,
    pieces,
  };
}

/** Accepta un codi o un enllaç complet i en retorna el codi. */
export function extractCode(text: string): string {
  const trimmed = text.trim();
  const i = trimmed.indexOf(HASH_PREFIX);
  return i >= 0 ? trimmed.slice(i + HASH_PREFIX.length) : trimmed;
}

/** Enllaç que obre el circuit (base: p. ex. location.origin + location.pathname). */
export function trackLink(data: TrackData, base: string): string {
  return `${base}${HASH_PREFIX}${encodeTrack(data)}`;
}

/** Codi del hash de l'URL, si n'hi ha. */
export function codeFromHash(hash: string): string | null {
  return hash.startsWith(HASH_PREFIX) ? hash.slice(HASH_PREFIX.length) : null;
}
