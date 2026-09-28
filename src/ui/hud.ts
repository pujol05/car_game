// HUD de cursa: velocímetre, temps, volta, checkpoints, parcials, barra de
// turbo i compte enrere.

import type { Vehicle } from '../physics/vehicle';
import { formatDelta, formatTime } from '../race/format';
import { COUNTDOWN_TICKS, type RaceEvent } from '../race/race';
import type { RaceSession } from '../race/session';
import { el } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Arc de 270° del velocímetre (radi 50). */
const ARC_PATH = 'M 24.64 95.36 A 50 50 0 1 1 95.36 95.36';
const ARC_LENGTH = 50 * Math.PI * 1.5;
const GAUGE_MAX_KMH = 300;
const HINT_SECONDS = 8;

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.append(e);
  return e;
}

export class Hud {
  readonly root: HTMLDivElement;
  private readonly time: HTMLDivElement;
  private readonly lap: HTMLDivElement;
  private readonly checkpoints: HTMLDivElement;
  private readonly best: HTMLDivElement;
  private readonly countdown: HTMLDivElement;
  private readonly message: HTMLDivElement;
  private readonly speedValue: HTMLDivElement;
  private readonly gaugeFill: SVGPathElement;
  private readonly turboFill: HTMLDivElement;
  private readonly turbo: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private messageTimer = 0;
  private hintTimer = HINT_SECONDS;

  constructor(hint: string) {
    this.root = el('div', 'hud');
    const top = el('div', 'hud-top', this.root);
    this.lap = el('div', 'hud-chip', top);
    const center = el('div', 'hud-center', top);
    this.time = el('div', 'hud-time', center);
    this.best = el('div', 'hud-best', center);
    this.checkpoints = el('div', 'hud-chip', top);
    this.countdown = el('div', 'hud-countdown', this.root);
    this.message = el('div', 'hud-message', this.root);

    const gauge = el('div', 'hud-gauge', this.root);
    const svgEl = svg('svg', { viewBox: '0 0 120 120', class: 'gauge-svg' }, gauge);
    svg('path', { d: ARC_PATH, class: 'gauge-bg' }, svgEl);
    this.gaugeFill = svg('path', { d: ARC_PATH, class: 'gauge-fill' }, svgEl);
    this.gaugeFill.style.strokeDasharray = `${ARC_LENGTH}`;
    this.speedValue = el('div', 'gauge-value', gauge);
    el('div', 'gauge-unit', gauge, 'km/h');
    this.turbo = el('div', 'turbo-bar', gauge);
    this.turboFill = el('div', '', this.turbo);
    el('div', 'turbo-label', gauge, 'TURBO');

    this.hint = el('div', 'hint', this.root, hint);
  }

  /** Missatge breu de text pla. */
  flash(text: string, seconds = 1.5, className = ''): void {
    this.message.textContent = text;
    this.message.className = `hud-message visible ${className}`;
    this.messageTimer = seconds;
  }

  private split(label: string, time: number, delta: number | null, seconds: number): void {
    this.message.replaceChildren();
    el('span', '', this.message, `${label}  ${formatTime(time)}`);
    if (delta !== null) {
      el('span', delta <= 0 ? 'delta-good' : 'delta-bad', this.message, `  ${formatDelta(delta)}`);
    }
    this.message.className = 'hud-message visible';
    this.messageTimer = seconds;
  }

  onEvents(events: readonly RaceEvent[], session: RaceSession): void {
    const { race } = session;
    for (const e of events) {
      switch (e.type) {
        case 'checkpoint':
          this.split(
            `CP ${race.taken.size}/${race.checkpointCount}`,
            e.time,
            session.splitDelta(e.split, e.time),
            2,
          );
          break;
        case 'lap':
          this.split(`Volta ${e.lap}`, e.time, session.splitDelta(e.split, e.time), 2.5);
          break;
        case 'missingCheckpoints':
          this.flash(`Falten ${e.remaining} checkpoints!`, 2, 'warning');
          break;
        case 'finish':
          this.message.className = 'hud-message';
          this.messageTimer = 0;
          break;
        default:
          break;
      }
    }
  }

  update(session: RaceSession, vehicle: Vehicle, frameDt: number): void {
    const { race } = session;
    this.time.textContent = formatTime(race.time);
    this.lap.textContent = `Volta ${Math.min(race.lap, race.totalLaps)}/${race.totalLaps}`;
    this.checkpoints.textContent = `CP ${race.taken.size}/${race.checkpointCount}`;
    this.best.textContent = session.best
      ? `Millor ${formatTime(session.best.time)}`
      : 'Sense rècord';

    if (race.phase === 'countdown') {
      const seconds = Math.ceil(race.countdown / (COUNTDOWN_TICKS / 3));
      this.countdown.textContent = String(seconds);
      this.countdown.className = 'hud-countdown visible';
    } else if (race.phase === 'running' && race.raceTicks < 45) {
      this.countdown.textContent = 'GO!';
      this.countdown.className = 'hud-countdown visible go';
    } else {
      this.countdown.className = 'hud-countdown';
    }

    if (this.messageTimer > 0) {
      this.messageTimer -= frameDt;
      if (this.messageTimer <= 0) this.message.classList.remove('visible');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= frameDt;
      if (this.hintTimer <= 0) this.hint.classList.add('hidden');
    }

    const kmh = Math.round(Math.abs(vehicle.forwardSpeed) * 3.6);
    this.speedValue.textContent = String(kmh);
    const ratio = Math.min(1, kmh / GAUGE_MAX_KMH);
    this.gaugeFill.style.strokeDashoffset = `${ARC_LENGTH * (1 - ratio)}`;
    this.gaugeFill.classList.toggle('boost', vehicle.turboActive);
    this.turboFill.style.width = `${Math.round(vehicle.turbo * 100)}%`;
    this.turbo.classList.toggle('active', vehicle.turboActive);
    this.turbo.classList.toggle('full', vehicle.turbo >= 0.999);
  }

  /** Torna a mostrar l'ajuda de controls (p. ex. en reiniciar). */
  showHint(): void {
    this.hintTimer = HINT_SECONDS;
    this.hint.classList.remove('hidden');
  }
}
