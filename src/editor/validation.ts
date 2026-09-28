// Validació d'un circuit: ha de tenir sortida, meta i checkpoints connectats.

import { worldCells } from '../track/builder';
import { type Route, traceRoute } from '../track/connectivity';
import { cellKey, inGrid } from '../track/grid';
import type { TrackData } from '../track/types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  route: Route;
}

function at(c: { x: number; y: number; z: number } | undefined): string {
  return c ? ` (${c.x}, ${c.y}, ${c.z})` : '';
}

export function validateTrack(data: TrackData): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { pieces } = data;
  const count = (type: string) => pieces.filter((p) => p.type === type).length;

  if (pieces.length === 0) {
    return {
      valid: false,
      errors: ['El circuit és buit.'],
      warnings,
      route: { steps: [], end: 'noStart' },
    };
  }

  // Superposicions i límits (un codi importat podria ser incorrecte).
  const cells = new Set<string>();
  let overlap = false;
  let outside = false;
  for (const p of pieces) {
    for (const [x, y, z] of worldCells(p)) {
      const key = cellKey(x, y, z);
      if (cells.has(key)) overlap = true;
      cells.add(key);
      if (!inGrid(x, y, z)) outside = true;
    }
  }
  if (overlap) errors.push('Hi ha peces superposades.');
  if (outside) errors.push('Hi ha peces fora dels límits de la graella.');

  const starts = count('start');
  const startFinish = count('startFinish');
  const finishes = count('finish');
  const checkpoints = count('checkpoint');
  if (starts + startFinish === 0) errors.push('Falta la sortida.');
  if (starts + startFinish > 1) errors.push('Només hi pot haver una sortida.');
  if (startFinish > 0 && finishes > 0) {
    errors.push('Un circuit amb sortida i meta combinades no pot tenir metes separades.');
  }
  if (starts > 0 && finishes === 0) errors.push('Falta la meta.');
  if (checkpoints === 0) errors.push('Cal com a mínim un checkpoint.');
  if (!Number.isInteger(data.laps) || data.laps < 1 || data.laps > 9) {
    errors.push('El nombre de voltes ha de ser entre 1 i 9.');
  }

  const route = traceRoute(pieces);
  if (starts + startFinish === 1) {
    if (route.end === 'deadEnd') {
      errors.push(`El recorregut s'interromp a la cel·la${at(route.stuckAt)}.`);
    } else if (route.end === 'wrongWay') {
      errors.push(`Hi ha una sortida o una meta en sentit contrari${at(route.stuckAt)}.`);
    } else if (route.end === 'revisit') {
      errors.push('El recorregut torna a una peça per on ja ha passat.');
    }
    const onRoute = new Set(route.steps.map((s) => s.piece));
    const missing = pieces.filter((p, i) => p.type === 'checkpoint' && !onRoute.has(i)).length;
    if (missing === 1) errors.push('Hi ha 1 checkpoint fora del recorregut.');
    else if (missing > 1) errors.push(`Hi ha ${missing} checkpoints fora del recorregut.`);
    for (const i of route.runOff ?? []) onRoute.add(i);
    const loose = pieces.length - onRoute.size;
    if (loose > 0 && (route.end === 'loop' || route.end === 'finish')) {
      warnings.push(
        loose === 1
          ? '1 peça no forma part del recorregut.'
          : `${loose} peces no formen part del recorregut.`,
      );
    }
  }
  if (starts > 0 && startFinish === 0 && data.laps !== 1) {
    warnings.push('Els circuits amb sortida i meta separades sempre són d’una sola volta.');
  }

  return { valid: errors.length === 0, errors, warnings, route };
}
