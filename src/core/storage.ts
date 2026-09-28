// Accés segur a localStorage (pot no existir o fallar en mode privat).

const PREFIX = 'drift.';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadJson<T>(key: string): T | null {
  try {
    const raw = storage()?.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Desa un valor; retorna fals si no s'ha pogut desar (p. ex. quota plena). */
export function saveJson(key: string, value: unknown): boolean {
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    storage()?.removeItem(PREFIX + key);
  } catch {
    // Ignorem els errors d'emmagatzematge.
  }
}
