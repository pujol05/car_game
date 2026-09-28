// Panell d'opcions: volum, qualitat gràfica i efectes. Es fa servir al menú
// principal i a la pausa.

import { type Quality, type Settings, getSettings, updateSettings } from '../core/settings';
import { button, el } from './dom';

const QUALITY_LABELS: Record<Quality, string> = {
  low: 'Baixa',
  medium: 'Mitjana',
  high: 'Alta',
};

function toggle(
  parent: HTMLElement,
  label: string,
  key: 'particles' | 'speedLines' | 'ghost',
): void {
  const row = el('label', 'opt-row', parent);
  el('span', '', row, label);
  const input = el('input', '', row);
  input.type = 'checkbox';
  input.checked = getSettings()[key];
  input.addEventListener('change', () =>
    updateSettings({ [key]: input.checked } as Partial<Settings>),
  );
}

/** Construeix el contingut del panell d'opcions dins de `parent`. */
export function buildOptions(parent: HTMLElement, onClose: () => void): void {
  el('h2', '', parent, 'Opcions');

  const volRow = el('label', 'opt-row', parent);
  el('span', '', volRow, 'Volum');
  const vol = el('input', '', volRow);
  vol.type = 'range';
  vol.min = '0';
  vol.max = '100';
  vol.value = String(Math.round(getSettings().volume * 100));
  const volValue = el('span', 'opt-value', volRow, `${vol.value}%`);
  vol.addEventListener('input', () => {
    volValue.textContent = `${vol.value}%`;
    updateSettings({ volume: Number(vol.value) / 100 });
  });

  const qRow = el('div', 'opt-row', parent);
  el('span', '', qRow, 'Qualitat gràfica');
  const qGroup = el('div', 'seg', qRow);
  const qButtons = (Object.keys(QUALITY_LABELS) as Quality[]).map((q) => {
    const b = button(qGroup, QUALITY_LABELS[q], () => {
      updateSettings({ quality: q });
      for (const other of qButtons) other.classList.toggle('active', other === b);
    });
    b.classList.toggle('active', getSettings().quality === q);
    return b;
  });

  el('h3', '', parent, 'Efectes');
  toggle(parent, 'Fum, espurnes i marques', 'particles');
  toggle(parent, 'Línies de velocitat amb el turbo', 'speedLines');
  toggle(parent, 'Fantasma del millor temps', 'ghost');

  const actions = el('div', 'modal-actions', parent);
  button(actions, 'Fet', onClose).classList.add('primary');
}
