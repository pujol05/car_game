// Rècords i fantasmes per circuit, guardats a localStorage.

import { fnv1a } from '../core/hash';
import { loadJson, saveJson } from '../core/storage';
import { canonicalPieces } from '../track/builder';
import type { TrackData } from '../track/types';
import { type GhostData, isGhostData } from './ghost';

export interface TrackRecord {
  time: number;
  splits: number[];
  car: string;
  date: string;
  ghost: GhostData | null;
}

/** Identificador estable d'un circuit segons el seu contingut. */
export function trackKey(track: TrackData): string {
  const pieces = canonicalPieces(track.pieces).map((p) => [p.type, p.x, p.y, p.z, p.r]);
  return fnv1a(JSON.stringify({ laps: track.laps, pieces }));
}

function isRecord(value: unknown): value is TrackRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<TrackRecord>;
  return (
    typeof r.time === 'number' &&
    r.time > 0 &&
    Array.isArray(r.splits) &&
    r.splits.every((s) => typeof s === 'number') &&
    typeof r.car === 'string' &&
    (r.ghost === null || isGhostData(r.ghost))
  );
}

export function loadRecord(key: string): TrackRecord | null {
  const value = loadJson<unknown>(`record.${key}`);
  return isRecord(value) ? value : null;
}

/**
 * Desa el resultat si millora el rècord. Retorna el rècord anterior (o null)
 * i si s'ha millorat.
 */
export function submitResult(
  key: string,
  result: Omit<TrackRecord, 'date'>,
): { improved: boolean; previous: TrackRecord | null } {
  const previous = loadRecord(key);
  if (previous && previous.time <= result.time) return { improved: false, previous };
  saveJson(`record.${key}`, { ...result, date: new Date().toISOString() });
  return { improved: true, previous };
}
