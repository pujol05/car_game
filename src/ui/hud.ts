// HUD de cursa: temps, volta, checkpoints, compte enrere i missatges.

import { COUNTDOWN_TICKS, type RaceEvent, type RaceTracker } from '../race/race';
import { formatTime } from '../race/format';
import type { Vehicle } from '../physics/vehicle';

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
  private readonly countdown: HTMLDivElement;
  private readonly message: HTMLDivElement;
  private readonly speed: HTMLDivElement;
  private readonly turboFill: HTMLDivElement;
  private readonly turbo: HTMLDivElement;
  private readonly finish: HTMLDivElement;
  private messageTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    const top = el('div', 'hud-top', this.root);
    this.lap = el('div', 'hud-chip', top);
    this.time = el('div', 'hud-time', top);
    this.checkpoints = el('div', 'hud-chip', top);
    this.countdown = el('div', 'hud-countdown', this.root);
    this.message = el('div', 'hud-message', this.root);
    this.speed = el('div', 'speed', this.root);
    this.turbo = el('div', 'turbo-bar', this.root);
    this.turboFill = el('div', '', this.turbo);
    this.finish = el('div', 'hud-finish', this.root);
    const hint = el('div', 'hint', this.root);
    hint.textContent =
      'WASD/fletxes: conduir · Espai: derrapar · Shift: turbo · R: reaparèixer · Enter: reiniciar';
  }

  show(text: string, seconds = 2, className = ''): void {
    this.message.textContent = text;
    this.message.className = `hud-message visible ${className}`;
    this.messageTimer = seconds;
  }

  onEvents(events: readonly RaceEvent[], race: RaceTracker): void {
    for (const e of events) {
      switch (e.type) {
        case 'checkpoint':
          this.show(`CP ${race.taken.size}/${race.checkpointCount}  ${formatTime(e.time)}`);
          break;
        case 'lap':
          this.show(`Volta ${e.lap}  ${formatTime(e.lapTime)}`, 2.5);
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

  update(race: RaceTracker, vehicle: Vehicle, frameDt: number): void {
    this.time.textContent = formatTime(race.time);
    this.lap.textContent = `Volta ${Math.min(race.lap, race.totalLaps)}/${race.totalLaps}`;
    this.checkpoints.textContent = `CP ${race.taken.size}/${race.checkpointCount}`;

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

    if (race.phase === 'finished' && race.finishTime !== null) {
      this.finish.innerHTML = `<h2>META!</h2><p>${formatTime(race.finishTime)}</p><small>Prem Enter per tornar a córrer</small>`;
      this.finish.classList.add('visible');
    } else {
      this.finish.classList.remove('visible');
    }
  }
}
