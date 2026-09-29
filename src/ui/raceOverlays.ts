// Panells que es mostren sobre la cursa: pausa i resultats.

import { formatDelta, formatTime } from '../race/format';
import { button, el } from './dom';
import { buildOptions } from './optionsPanel';

export interface OverlayAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
  key?: string;
}

class Overlay {
  readonly root: HTMLDivElement;
  protected readonly box: HTMLDivElement;

  constructor(className: string) {
    this.root = el('div', `overlay ${className}`);
    this.box = el('div', 'overlay-box panel', this.root);
  }

  get visible(): boolean {
    return this.root.classList.contains('visible');
  }

  hide(): void {
    this.root.classList.remove('visible');
  }

  protected open(): void {
    this.box.replaceChildren();
    this.root.classList.add('visible');
  }

  protected actions(list: OverlayAction[]): void {
    const row = el('div', 'overlay-actions', this.box);
    for (const a of list) {
      const b = button(row, a.label, a.onClick);
      if (a.key) el('kbd', '', b, a.key);
      if (a.primary) b.classList.add('primary');
    }
  }
}

export class PauseMenu extends Overlay {
  constructor() {
    super('pause');
  }

  show(actions: OverlayAction[]): void {
    this.open();
    el('h2', '', this.box, 'Pausa');
    this.actions(actions);
    this.box.querySelector('.overlay-actions')?.classList.add('vertical');
  }

  showOptions(onBack: () => void): void {
    this.open();
    buildOptions(this.box, onBack);
  }
}

export interface ResultsData {
  title: string;
  time: number;
  improved: boolean;
  /** Diferència amb el rècord anterior (ms), si n'hi havia. */
  delta: number | null;
  lapTimes: number[];
  /** Element opcional amb la medalla aconseguida. */
  medal?: HTMLElement;
  /** Text amb la següent medalla per aconseguir. */
  nextTarget?: string;
}

export class ResultsPanel extends Overlay {
  constructor() {
    super('results');
  }

  show(data: ResultsData, actions: OverlayAction[]): void {
    this.open();
    el('h2', 'results-title', this.box, data.title);
    if (data.medal) this.box.append(data.medal);
    el('div', 'results-time', this.box, formatTime(data.time));
    if (data.improved) {
      el(
        'div',
        'delta-good results-record',
        this.box,
        data.delta === null ? 'NOU RÈCORD!' : `NOU RÈCORD! ${formatDelta(data.delta)}`,
      );
    } else if (data.delta !== null) {
      el('div', 'delta-bad results-record', this.box, `${formatDelta(data.delta)} del rècord`);
    }
    if (data.nextTarget) el('div', 'results-next', this.box, data.nextTarget);
    if (data.lapTimes.length > 1) {
      const best = Math.min(...data.lapTimes);
      const list = el('ul', 'results-laps', this.box);
      data.lapTimes.forEach((t, i) => {
        const li = el('li', t === best ? 'best' : '', list);
        el('span', '', li, `Volta ${i + 1}`);
        el('span', '', li, formatTime(t));
      });
    }
    this.actions(actions);
  }
}
