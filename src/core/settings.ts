// Preferències de l'usuari, desades a localStorage.

import { loadJson, saveJson } from './storage';

export type TimeOfDay = 'day' | 'sunset' | 'night';
export const TIMES_OF_DAY: readonly TimeOfDay[] = ['day', 'sunset', 'night'];

export interface Settings {
  timeOfDay: TimeOfDay;
  /** Línies de velocitat amb el turbo. */
  speedLines: boolean;
}

const DEFAULTS: Settings = {
  timeOfDay: 'day',
  speedLines: true,
};

const KEY = 'settings';

/** Barreja les dades desades amb els valors per defecte, descartant valors invàlids. */
export function sanitizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Partial<Record<keyof Settings, unknown>>;
  if (TIMES_OF_DAY.includes(r.timeOfDay as TimeOfDay)) s.timeOfDay = r.timeOfDay as TimeOfDay;
  if (typeof r.speedLines === 'boolean') s.speedLines = r.speedLines;
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
