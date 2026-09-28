// Circuits de l'usuari desats a localStorage, i l'esborrany de l'editor.

import { loadJson, saveJson } from '../core/storage';
import { decodeTrack, encodeTrack } from '../track/serialize';
import type { TrackData } from '../track/types';

export interface SavedTrack {
  id: string;
  name: string;
  updated: string;
  /** Codi comprimit del circuit (el mateix format que per compartir). */
  code: string;
}

const LIST_KEY = 'tracks';
const DRAFT_KEY = 'editor.draft';

function isSaved(value: unknown): value is SavedTrack {
  const s = value as Partial<SavedTrack> | null;
  return (
    !!s &&
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    typeof s.updated === 'string' &&
    typeof s.code === 'string'
  );
}

export function listSavedTracks(): SavedTrack[] {
  const list = loadJson<unknown>(LIST_KEY);
  return Array.isArray(list) ? list.filter(isSaved) : [];
}

/** Desa (o sobreescriu, si ja n'hi ha un amb el mateix nom) un circuit. */
export function saveTrack(data: TrackData): boolean {
  const list = listSavedTracks();
  const existing = list.find((t) => t.name === data.name);
  const entry: SavedTrack = {
    id: existing?.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: data.name,
    updated: new Date().toISOString(),
    code: encodeTrack(data),
  };
  const next = [entry, ...list.filter((t) => t.id !== entry.id)];
  return saveJson(LIST_KEY, next);
}

export function deleteSavedTrack(id: string): void {
  saveJson(
    LIST_KEY,
    listSavedTracks().filter((t) => t.id !== id),
  );
}

export function loadSavedTrack(saved: SavedTrack): TrackData | null {
  try {
    return decodeTrack(saved.code);
  } catch {
    return null;
  }
}

export function saveDraft(data: TrackData): void {
  saveJson(DRAFT_KEY, encodeTrack(data));
}

export function loadDraft(): TrackData | null {
  const code = loadJson<unknown>(DRAFT_KEY);
  if (typeof code !== 'string') return null;
  try {
    return decodeTrack(code);
  } catch {
    return null;
  }
}
