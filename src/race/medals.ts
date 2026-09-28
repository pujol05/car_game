// Medalles segons el temps: autor, or, plata i bronze.

export type Medal = 'author' | 'gold' | 'silver' | 'bronze';

/** Temps màxims (ms) per aconseguir cada medalla. */
export interface MedalTimes {
  author: number;
  gold: number;
  silver: number;
  bronze: number;
}

export const MEDALS: readonly Medal[] = ['author', 'gold', 'silver', 'bronze'];

export const MEDAL_LABELS: Record<Medal, string> = {
  author: 'Autor',
  gold: 'Or',
  silver: 'Plata',
  bronze: 'Bronze',
};

/** Millor medalla aconseguida amb un temps, o null. */
export function medalFor(time: number, medals: MedalTimes): Medal | null {
  for (const m of MEDALS) if (time <= medals[m]) return m;
  return null;
}

/** Següent medalla per aconseguir (la millor encara no guanyada), o null si ja es té la d'autor. */
export function nextMedal(best: number | null, medals: MedalTimes): Medal | null {
  const current = best === null ? null : medalFor(best, medals);
  if (current === 'author') return null;
  if (current === null) return 'bronze';
  return MEDALS[MEDALS.indexOf(current) - 1];
}

function roundUp(ms: number, step = 100): number {
  return Math.ceil(ms / step) * step;
}

/** Temps de medalla a partir del temps d'autor. */
export function medalsFromAuthor(author: number): MedalTimes {
  return {
    author: roundUp(author),
    gold: roundUp(author * 1.08),
    silver: roundUp(author * 1.2),
    bronze: roundUp(author * 1.4),
  };
}
