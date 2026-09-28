// HUD de cursa: temps, volta, checkpoints, compte enrere, parcials i missatges.

import type { Vehicle } from '../physics/vehicle';
import { formatDelta, formatTime } from '../race/format';
import { COUNTDOWN_TICKS, type RaceEvent } from '../race/race';
import type { RaceSession } from '../race/session';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  parent?.append(e);
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
  private readonly speed: HTMLDivElement;
  private readonly turboFill: HTMLDivElement;
  private readonly turbo: HTMLDivElement;
  private readonly finish: HTMLDivElement;
  private messageTimer = 0;

  constructor(backHint?: string) {
    this.root = el('div', 'hud');
    const top = el('div', 'hud-top', this.root);
    this.lap = el('div', 'hud-chip', top);
    this.time = el('div', 'hud-time', top);
    this.checkpoints = el('div', 'hud-chip', top);
    this.best = el('div', 'hud-best', this.root);
    this.countdown = el('div', 'hud-countdown', this.root);
    this.message = el('div', 'hud-message', this.root);
    this.speed = el('div', 'speed', this.root);
    this.turbo = el('div', 'turbo-bar', this.root);
    this.turboFill = el('div', '', this.turbo);
    this.finish = el('div', 'hud-finish', this.root);
    const hint = el('div', 'hint', this.root);
    hint.textContent =
      'WASD/fletxes: conduir · Espai: derrapar · Shift: turbo · R: reaparèixer · Enter: reiniciar' +
      (backHint ? ` · ${backHint}` : '');
  }

  /** Missatge breu de text pla (p. ex. en canviar una opció). */
  flash(text: string): void {
    this.message.textContent = text;
    this.message.className = 'hud-message visible';
    this.messageTimer = 1.5;
  }

  /** Mostra un missatge temporal. `html` només conté text generat pel joc. */
  private show(html: string, seconds = 2, className = ''): void {
    this.message.innerHTML = html;
    this.message.className = `hud-message visible ${className}`;
    this.messageTimer = seconds;
  }

  private splitHtml(label: string, time: number, delta: number | null): string {
    const deltaHtml =
      delta === null
        ? ''
        : ` <span class="${delta <= 0 ? 'delta-good' : 'delta-bad'}">${formatDelta(delta)}</span>`;
    return `${label} ${formatTime(time)}${deltaHtml}`;
  }

  onEvents(events: readonly RaceEvent[], session: RaceSession): void {
    const { race } = session;
    for (const e of events) {
      switch (e.type) {
        case 'checkpoint':
          this.show(
            this.splitHtml(
              `CP ${race.taken.size}/${race.checkpointCount}`,
              e.time,
              session.splitDelta(e.split, e.time),
            ),
          );
          break;
        case 'lap':
          this.show(
            this.splitHtml(`Volta ${e.lap}`, e.time, session.splitDelta(e.split, e.time)),
            2.5,
          );
          break;
        case 'missingCheckpoints':
          this.show(`Falten ${e.remaining} checkpoints!`, 2, 'warning');
          break;
        case 'finish':
          this.message.className = 'hud-message';
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
    } else if (race.raceTicks < 45) {
      this.countdown.textContent = 'GO!';
      this.countdown.className = 'hud-countdown visible go';
    } else {
      this.countdown.className = 'hud-countdown';
    }

    if (this.messageTimer > 0) {
      this.messageTimer -= frameDt;
      if (this.messageTimer <= 0) this.message.classList.remove('visible');
    }

    this.speed.innerHTML = `${Math.round(Math.abs(vehicle.forwardSpeed) * 3.6)}<small>km/h</small>`;
    this.turboFill.style.width = `${Math.round(vehicle.turbo * 100)}%`;
    this.turbo.classList.toggle('active', vehicle.turboActive);

    const result = session.result;
    if (race.phase === 'finished' && result) {
      let extra = '';
      if (result.improved) {
        const delta = result.previous ? ` ${formatDelta(result.time - result.previous.time)}` : '';
        extra = `<div class="delta-good">NOU RÈCORD!${delta}</div>`;
      } else if (result.previous) {
        extra = `<div class="delta-bad">${formatDelta(result.time - result.previous.time)}</div>`;
      }
      this.finish.innerHTML =
        `<h2>META!</h2><p>${formatTime(result.time)}</p>${extra}` +
        '<small>Prem Enter per tornar a córrer</small>';
      this.finish.classList.add('visible');
    } else {
      this.finish.classList.remove('visible');
    }
  }
}
