// Preferències de l'usuari, desades a localStorage.

import { loadJson, saveJson } from './storage';

export type TimeOfDay = 'day' | 'sunset' | 'night';
export const TIMES_OF_DAY: readonly TimeOfDay[] = ['day', 'sunset', 'night'];

export type Quality = 'low' | 'medium' | 'high';
export const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];

export interface Settings {
  timeOfDay: TimeOfDay;
  /** Volum general (0..1). */
  volume: number;
  quality: Quality;
  /** Fum, espurnes i marques de pneumàtics. */
  particles: boolean;
  /** Línies de velocitat amb el turbo. */
  speedLines: boolean;
  /** Mostrar el fantasma del millor temps. */
  ghost: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  timeOfDay: 'day',
  volume: 0.7,
  quality: 'high',
  particles: true,
  speedLines: true,
  ghost: true,
};

const KEY = 'settings';

/** Barreja les dades desades amb els valors per defecte, descartant valors invàlids. */
export function sanitizeSettings(raw: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Partial<Record<keyof Settings, unknown>>;
  if (TIMES_OF_DAY.includes(r.timeOfDay as TimeOfDay)) s.timeOfDay = r.timeOfDay as TimeOfDay;
  if (typeof r.volume === 'number' && Number.isFinite(r.volume)) {
    s.volume = Math.min(1, Math.max(0, r.volume));
  }
  if (QUALITIES.includes(r.quality as Quality)) s.quality = r.quality as Quality;
  if (typeof r.particles === 'boolean') s.particles = r.particles;
  if (typeof r.speedLines === 'boolean') s.speedLines = r.speedLines;
  if (typeof r.ghost === 'boolean') s.ghost = r.ghost;
  return s;
}

let current: Settings = sanitizeSettings(loadJson<unknown>(KEY));
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Readonly<Settings> {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = sanitizeSettings({ ...current, ...patch });
  saveJson(KEY, current);
  for (const fn of listeners) fn(current);
}

/** Subscripció als canvis; retorna la funció per donar-se de baixa. */
export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
