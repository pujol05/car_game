// Menú principal, selecció de cotxe i circuit, i opcions. De fons es veu un
// circuit amb la càmera girant lentament.

import * as THREE from 'three';
import type { InputManager } from '../core/input';
import { seedFrom } from '../core/random';
import type { Screen } from '../core/screen';
import { loadJson, saveJson } from '../core/storage';
import { TIMES_OF_DAY, type TimeOfDay, getSettings, updateSettings } from '../core/settings';
import { CARS, type CarStats, carById } from '../data/cars';
import { OFFICIAL_TRACKS } from '../data/tracks';
import { playableSavedTracks } from '../editor/savedTracks';
import { formatTime } from '../race/format';
import { loadRecord, trackKey } from '../race/records';
import { Decoration } from '../render/decoration';
import type { SceneRenderer } from '../render/scene';
import { TrackView } from '../render/trackView';
import { buildTrack } from '../track/builder';
import type { TrackData } from '../track/types';
import { button, el } from './dom';
import { buildOptions } from './optionsPanel';

export type MenuView = 'main' | 'select' | 'options';

export interface MenuCallbacks {
  onRace(track: TrackData, car: CarStats): void;
  onEditor(): void;
}

interface TrackEntry {
  id: string;
  data: TrackData;
  detail: string;
}

const TIME_LABELS: Record<TimeOfDay, string> = {
  day: 'Dia',
  sunset: 'Posta de sol',
  night: 'Nit',
};

/** Rangs per dibuixar les barres d'estadístiques dels cotxes. */
const STAT_RANGES = {
  maxSpeed: [45, 70],
  accel: [18, 34],
  grip: [26, 46],
} as const;

interface Selection {
  car: string;
  track: string;
}

export class MenuScreen implements Screen {
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private viewName: MenuView = 'main';
  private backdrop: {
    track: TrackView;
    decoration: Decoration;
    center: THREE.Vector3;
    radius: number;
  } | null = null;
  private backdropId = '';
  private angle = 0;
  private selection: Selection;
  private entries: TrackEntry[] = [];

  constructor(
    private readonly view: SceneRenderer,
    private readonly input: InputManager,
    private readonly ui: HTMLElement,
    private readonly callbacks: MenuCallbacks,
  ) {
    this.root = el('div', 'menu');
    const logo = el('div', 'menu-logo', this.root);
    el('span', '', logo, 'DRIFT');
    el('small', '', logo, 'curses arcade · editor de circuits');
    this.panel = el('div', 'menu-panel panel', this.root);
    el(
      'div',
      'menu-footer',
      this.root,
      'Tot el que veus i sents es genera per codi · three.js + Web Audio',
    );
    const saved = loadJson<Partial<Selection>>('selection');
    this.selection = {
      car: typeof saved?.car === 'string' ? saved.car : CARS[0].id,
      track: typeof saved?.track === 'string' ? saved.track : 'official:0',
    };
  }

  /** Canvia la vista del menú (cal que la pantalla estigui activa o s'hi activi després). */
  setView(name: MenuView): void {
    this.viewName = name;
    if (this.root.isConnected) this.renderView();
  }

  enter(): void {
    this.input.clearPressed();
    this.view.setTimeOfDay(getSettings().timeOfDay);
    this.ui.append(this.root);
    this.renderView();
  }

  exit(): void {
    this.root.remove();
    this.disposeBackdrop();
  }

  tick(): void {
    if (this.input.consumePressed('Escape') && this.viewName !== 'main') this.setView('main');
    if (this.input.consumePressed('Enter')) {
      if (this.viewName === 'main') this.setView('select');
      else if (this.viewName === 'select') this.startRace();
    }
  }

  render(_alpha: number, frameDt: number): void {
    this.angle += frameDt * 0.06;
    const cam = this.view.camera;
    const b = this.backdrop;
    const center = b?.center ?? new THREE.Vector3();
    const radius = b?.radius ?? 200;
    cam.position.set(
      center.x + Math.cos(this.angle) * radius,
      center.y + radius * 0.45,
      center.z + Math.sin(this.angle) * radius,
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(center);
    if (cam.fov !== 50) {
      cam.fov = 50;
      cam.updateProjectionMatrix();
    }
    this.view.followTarget(center);
    this.view.render();
  }

  // --- Fons ---

  private showBackdrop(id: string, data: TrackData): void {
    if (this.backdropId === id && this.backdrop) return;
    this.disposeBackdrop();
    const built = buildTrack(data);
    const track = new TrackView(built);
    const decoration = new Decoration(built, seedFrom(trackKey(data)));
    decoration.setNight(this.view.isNight);
    const { min, max } = built.bounds;
    const center = new THREE.Vector3((min.x + max.x) / 2, 0, (min.z + max.z) / 2);
    const radius = Math.max(120, Math.hypot(max.x - min.x, max.z - min.z) * 0.75);
    this.view.scene.add(track.root, decoration.root);
    this.backdrop = { track, decoration, center, radius };
    this.backdropId = id;
  }

  private disposeBackdrop(): void {
    this.backdrop?.track.dispose();
    this.backdrop?.decoration.dispose();
    this.backdrop = null;
    this.backdropId = '';
  }

  // --- Vistes ---

  private renderView(): void {
    this.panel.replaceChildren();
    this.panel.className = `menu-panel panel view-${this.viewName}`;
    this.refreshEntries();
    const selected = this.selectedEntry();
    this.showBackdrop(selected.id, selected.data);
    if (this.viewName === 'main') this.renderMain();
    else if (this.viewName === 'select') this.renderSelect();
    else buildOptions(this.panel, () => this.setView('main'));
  }

  private renderMain(): void {
    const list = el('div', 'menu-buttons', this.panel);
    button(list, 'Jugar', () => this.setView('select')).classList.add('primary', 'big');
    button(list, 'Editor de circuits', () => this.callbacks.onEditor()).classList.add('big');
    button(list, 'Opcions', () => this.setView('options')).classList.add('big');
    const help = el('div', 'menu-help', this.panel);
    for (const [key, action] of [
      ['WASD / fletxes', 'conduir'],
      ['Espai', 'derrapar (carrega el turbo)'],
      ['Shift', 'turbo'],
      ['R', "reaparèixer a l'últim checkpoint"],
      ['Enter', 'reiniciar la cursa'],
      ['Esc', 'pausa'],
    ]) {
      const row = el('div', '', help);
      el('kbd', '', row, key);
      el('span', '', row, action);
    }
  }

  private renderSelect(): void {
    el('h2', '', this.panel, 'Cotxe');
    const cars = el('div', 'car-cards', this.panel);
    for (const car of CARS) {
      const card = el('button', 'car-card', cars);
      card.type = 'button';
      card.classList.toggle('active', car.id === this.selection.car);
      const swatch = el('div', 'car-swatch', card);
      swatch.style.background = `#${car.color.toString(16).padStart(6, '0')}`;
      el('strong', '', card, car.name);
      for (const [label, key] of [
        ['Velocitat', 'maxSpeed'],
        ['Acceleració', 'accel'],
        ['Adherència', 'grip'],
      ] as const) {
        const [lo, hi] = STAT_RANGES[key];
        const ratio = Math.max(0.05, Math.min(1, (car[key] - lo) / (hi - lo)));
        const stat = el('div', 'stat', card);
        el('span', '', stat, label);
        const bar = el('div', 'stat-bar', stat);
        el('div', '', bar).style.width = `${Math.round(ratio * 100)}%`;
      }
      card.addEventListener('click', () => {
        this.select({ car: car.id });
      });
    }

    el('h2', '', this.panel, 'Circuit');
    const list = el('div', 'track-list', this.panel);
    for (const entry of this.entries) {
      const item = el('button', 'track-item', list);
      item.type = 'button';
      item.classList.toggle('active', entry.id === this.selection.track);
      const info = el('div', '', item);
      el('strong', '', info, entry.data.name);
      el('small', '', info, entry.detail);
      const record = loadRecord(trackKey(entry.data));
      el('span', 'track-best', item, record ? formatTime(record.time) : '—');
      item.addEventListener('click', () => this.select({ track: entry.id }));
    }

    el('h2', '', this.panel, 'Hora del dia');
    const times = el('div', 'seg', this.panel);
    for (const t of TIMES_OF_DAY) {
      const b = button(times, TIME_LABELS[t], () => {
        updateSettings({ timeOfDay: t });
        this.view.setTimeOfDay(t);
        this.backdrop?.decoration.setNight(this.view.isNight);
        this.renderView();
      });
      b.classList.toggle('active', getSettings().timeOfDay === t);
    }

    const actions = el('div', 'modal-actions', this.panel);
    button(actions, 'Enrere', () => this.setView('main'));
    button(actions, 'Córrer!', () => this.startRace()).classList.add('primary', 'big');
  }

  // --- Selecció ---

  private refreshEntries(): void {
    const official: TrackEntry[] = OFFICIAL_TRACKS.map((data, i) => ({
      id: `official:${i}`,
      data,
      detail: `Oficial ${i + 1} · ${lapsLabel(data)}`,
    }));
    const saved: TrackEntry[] = playableSavedTracks().map(({ saved, data }) => ({
      id: `saved:${saved.id}`,
      data,
      detail: `El meu circuit · ${lapsLabel(data)}`,
    }));
    this.entries = [...official, ...saved];
  }

  private selectedEntry(): TrackEntry {
    return this.entries.find((e) => e.id === this.selection.track) ?? this.entries[0];
  }

  private select(patch: Partial<Selection>): void {
    this.selection = { ...this.selection, ...patch };
    saveJson('selection', this.selection);
    this.renderView();
  }

  private startRace(): void {
    const entry = this.selectedEntry();
    this.callbacks.onRace(entry.data, carById(this.selection.car));
  }
}

function lapsLabel(data: TrackData): string {
  const lapTrack = data.pieces.some((p) => p.type === 'startFinish');
  if (!lapTrack) return 'sortida i meta';
  return data.laps === 1 ? '1 volta' : `${data.laps} voltes`;
}
