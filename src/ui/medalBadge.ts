// Distintiu visual d'una medalla.

import { MEDAL_LABELS, type Medal } from '../race/medals';
import { el } from './dom';

export function medalBadge(medal: Medal, size: 'small' | 'big' = 'small'): HTMLElement {
  const badge = el('span', `medal medal-${medal} medal-${size}`);
  el('span', 'medal-disc', badge);
  if (size === 'big')
    el('span', 'medal-label', badge, `Medalla ${MEDAL_LABELS[medal].toLowerCase()}`);
  badge.title = MEDAL_LABELS[medal];
  return badge;
}
