// Fantasma: es grava l'entrada quantitzada de cada tick i es reprodueix amb
// la mateixa física determinista. Les entrades es comprimeixen per trams
// (run-length) perquè amb teclat canvien poques vegades per segon.

import type { DriveInput } from '../core/input';
import { PHYSICS_VERSION } from '../physics/vehicle';

const STEPS = 127;

/** Arrodoneix l'entrada a valors enters perquè la reproducció sigui exacta. */
export function quantizeInput(input: DriveInput): DriveInput {
  return {
    throttle: Math.round(input.throttle * STEPS) / STEPS,
    brake: Math.round(input.brake * STEPS) / STEPS,
    steer: Math.round(input.steer * STEPS) / STEPS,
    handbrake: input.handbrake,
    boost: input.boost,
  };
}

const FLAG_HANDBRAKE = 1;
const FLAG_BOOST = 2;
const FLAG_RESPAWN = 4;

/** Tram: [nombre de ticks, direcció, accelerador, fre, banderes]. */
export type GhostRun = [number, number, number, number, number];

export interface GhostData {
  /** Versió de la física amb què s'ha gravat. */
  physics: number;
  car: string;
  /** Temps final de la cursa gravada (ms). */
  time: number;
  runs: GhostRun[];
}

function encodeTick(input: DriveInput, respawn: boolean): GhostRun {
  const flags =
    (input.handbrake ? FLAG_HANDBRAKE : 0) |
    (input.boost ? FLAG_BOOST : 0) |
    (respawn ? FLAG_RESPAWN : 0);
  return [
    1,
    Math.round(input.steer * STEPS),
    Math.round(input.throttle * STEPS),
    Math.round(input.brake * STEPS),
    flags,
  ];
}

export class GhostRecorder {
  private readonly runs: GhostRun[] = [];

  /** Afegeix l'entrada d'un tick de cursa (ja quantitzada). */
  record(input: DriveInput, respawn: boolean): void {
    const run = encodeTick(input, respawn);
    const last = this.runs[this.runs.length - 1];
    // Les reaparicions són puntuals: no s'agrupen amb altres ticks.
    if (
      last &&
      !(run[4] & FLAG_RESPAWN) &&
      !(last[4] & FLAG_RESPAWN) &&
      last[1] === run[1] &&
      last[2] === run[2] &&
      last[3] === run[3] &&
      last[4] === run[4]
    ) {
      last[0]++;
    } else {
      this.runs.push(run);
    }
  }

  get ticks(): number {
    return this.runs.reduce((sum, r) => sum + r[0], 0);
  }

  finish(car: string, time: number): GhostData {
    return { physics: PHYSICS_VERSION, car, time, runs: this.runs.map((r) => [...r] as GhostRun) };
  }
}

export class GhostPlayer {
  private run = 0;
  private used = 0;

  constructor(private readonly data: GhostData) {}

  get done(): boolean {
    return this.run >= this.data.runs.length;
  }

  /** Entrada del tick següent, o null si la gravació s'ha acabat. */
  next(): { input: DriveInput; respawn: boolean } | null {
    const run = this.data.runs[this.run];
    if (!run) return null;
    const [, steer, throttle, brake, flags] = run;
    this.used++;
    if (this.used >= run[0]) {
      this.run++;
      this.used = 0;
    }
    return {
      input: {
        steer: steer / STEPS,
        throttle: throttle / STEPS,
        brake: brake / STEPS,
        handbrake: (flags & FLAG_HANDBRAKE) !== 0,
        boost: (flags & FLAG_BOOST) !== 0,
      },
      respawn: (flags & FLAG_RESPAWN) !== 0,
    };
  }
}

/** Comprova que unes dades de fantasma tenen el format correcte. */
export function isGhostData(value: unknown): value is GhostData {
  if (!value || typeof value !== 'object') return false;
  const g = value as Partial<GhostData>;
  return (
    typeof g.physics === 'number' &&
    typeof g.car === 'string' &&
    typeof g.time === 'number' &&
    Array.isArray(g.runs) &&
    g.runs.every(
      (r) =>
        Array.isArray(r) &&
        r.length === 5 &&
        r.every((n) => Number.isInteger(n)) &&
        r[0] > 0 &&
        Math.abs(r[1]) <= STEPS &&
        r[2] >= 0 &&
        r[2] <= STEPS &&
        r[3] >= 0 &&
        r[3] <= STEPS,
    )
  );
}
