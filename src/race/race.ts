// Cursa contrarellotge d'un cotxe: compte enrere, checkpoints, voltes, meta i
// reaparició. Tota la lògica és determinista i avança tick a tick, de manera
// que la mateixa seqüència d'entrades reprodueix exactament la mateixa cursa.

import { type DriveInput, neutralInput } from '../core/input';
import { DT } from '../core/loop';
import { Vec3 } from '../core/math';
import type { Vehicle, VehicleSnapshot } from '../physics/vehicle';
import type { BuiltTrack, Trigger } from '../track/builder';
import { GROUND_Y } from '../track/grid';

export const COUNTDOWN_TICKS = 180;
const MS_PER_TICK = DT * 1000;
/** Distància fora dels límits del circuit a partir de la qual es reapareix. */
const OUT_OF_BOUNDS_MARGIN = 150;

export type RacePhase = 'countdown' | 'running' | 'finished';

export type RaceEvent =
  | { type: 'go' }
  | { type: 'checkpoint'; time: number; split: number }
  | { type: 'lap'; time: number; split: number; lap: number; lapTime: number }
  | { type: 'finish'; time: number; split: number }
  | { type: 'missingCheckpoints'; remaining: number }
  | { type: 'boost' }
  | { type: 'respawn' };

export class RaceTracker {
  phase: RacePhase = 'countdown';
  countdown = COUNTDOWN_TICKS;
  /** Ticks des del "GO". */
  raceTicks = 0;
  lap = 1;
  readonly totalLaps: number;
  /** Índexs (dins de `track.triggers`) dels checkpoints d'aquesta volta. */
  readonly taken = new Set<number>();
  /** Temps parcials (ms): cada checkpoint i cada final de volta, en ordre. */
  readonly splits: number[] = [];
  readonly lapTimes: number[] = [];
  finishTime: number | null = null;

  private lapStart = 0;
  private snapshot: VehicleSnapshot | null = null;
  private readonly insideBoost = new Set<number>();
  private readonly events: RaceEvent[] = [];
  private readonly coast = { ...neutralInput(), brake: 0.4 };
  private readonly rel = new Vec3();

  constructor(
    readonly track: BuiltTrack,
    readonly vehicle: Vehicle,
  ) {
    this.totalLaps = track.laps;
    this.resetVehicleToStart();
  }

  /** Temps de cursa actual (ms). */
  get time(): number {
    if (this.finishTime !== null) return this.finishTime;
    return this.raceTicks * MS_PER_TICK;
  }

  get checkpointCount(): number {
    return this.track.checkpointCount;
  }

  /** Avança un tick. `respawn` demana tornar a l'últim checkpoint. */
  update(input: DriveInput, respawn = false): readonly RaceEvent[] {
    this.events.length = 0;
    const v = this.vehicle;

    if (this.phase === 'countdown') {
      this.countdown--;
      if (this.countdown <= 0) {
        this.phase = 'running';
        this.events.push({ type: 'go' });
      }
      return this.events;
    }

    if (this.phase === 'finished') {
      v.step(this.coast, DT);
      return this.events;
    }

    if (respawn) this.respawn();
    v.step(input, DT);
    this.raceTicks++;
    this.checkTriggers();
    if (this.phase === 'running' && this.isOutOfBounds()) this.respawn();
    return this.events;
  }

  respawn(): void {
    if (this.snapshot) this.vehicle.restore(this.snapshot);
    else this.resetVehicleToStart();
    this.insideBoost.clear();
    this.events.push({ type: 'respawn' });
  }

  private resetVehicleToStart(): void {
    const { pos, heading } = this.track.spawn;
    this.vehicle.reset(pos, heading);
  }

  private isOutOfBounds(): boolean {
    const { pos } = this.vehicle;
    const { min, max } = this.track.bounds;
    const m = OUT_OF_BOUNDS_MARGIN;
    return (
      pos.y < GROUND_Y - 20 ||
      pos.x < min.x - m ||
      pos.x > max.x + m ||
      pos.z < min.z - m ||
      pos.z > max.z + m ||
      pos.y > max.y + 200
    );
  }

  private checkTriggers(): void {
    const { prevPos, pos } = this.vehicle;
    const triggers = this.track.triggers;
    for (let i = 0; i < triggers.length && this.phase === 'running'; i++) {
      const t = triggers[i];
      if (t.kind === 'boost') {
        this.checkBoost(i, t);
        continue;
      }
      const crossing = this.lineCrossing(t, prevPos, pos);
      if (crossing === null) continue;
      const time = Math.round((this.raceTicks - 1 + crossing.fraction) * MS_PER_TICK);
      if (t.kind === 'checkpoint') {
        if (this.taken.has(i)) continue;
        this.taken.add(i);
        this.splits.push(time);
        this.snapshot = this.vehicle.snapshot();
        this.events.push({ type: 'checkpoint', time, split: this.splits.length - 1 });
      } else if (crossing.forward) {
        this.crossFinishLine(time);
      }
    }
  }

  private crossFinishLine(time: number): void {
    const remaining = this.checkpointCount - this.taken.size;
    if (remaining > 0) {
      this.events.push({ type: 'missingCheckpoints', remaining });
      return;
    }
    this.splits.push(time);
    this.lapTimes.push(time - this.lapStart);
    this.lapStart = time;
    const split = this.splits.length - 1;
    if (this.lap >= this.totalLaps) {
      this.finishTime = time;
      this.phase = 'finished';
      this.events.push({ type: 'finish', time, split });
      return;
    }
    const lapTime = this.lapTimes[this.lapTimes.length - 1];
    this.events.push({ type: 'lap', time, split, lap: this.lap, lapTime });
    this.lap++;
    this.taken.clear();
    this.snapshot = this.vehicle.snapshot();
  }

  private checkBoost(index: number, t: Trigger): void {
    const d = this.rel.subVectors(this.vehicle.pos, t.center);
    const inside =
      Math.abs(d.dot(t.axisX)) <= t.half.x &&
      Math.abs(d.dot(t.axisY)) <= t.half.y &&
      Math.abs(d.dot(t.axisZ)) <= t.half.z;
    if (inside) {
      if (!this.insideBoost.has(index)) {
        this.insideBoost.add(index);
        this.events.push({ type: 'boost' });
      }
      this.vehicle.triggerPadBoost();
    } else {
      this.insideBoost.delete(index);
    }
  }

  /** Detecta si el segment a → b creua el pla del trigger dins dels límits. */
  private lineCrossing(
    t: Trigger,
    a: Vec3,
    b: Vec3,
  ): { fraction: number; forward: boolean } | null {
    const da = this.rel.subVectors(a, t.center);
    const za = da.dot(t.axisZ);
    const xa = da.dot(t.axisX);
    const ya = da.dot(t.axisY);
    const db = this.rel.subVectors(b, t.center);
    const zb = db.dot(t.axisZ);
    const forward = za < 0 && zb >= 0;
    const backward = za > 0 && zb <= 0;
    if (!forward && !backward) return null;
    const fraction = za / (za - zb);
    const x = xa + (db.dot(t.axisX) - xa) * fraction;
    const y = ya + (db.dot(t.axisY) - ya) * fraction;
    if (Math.abs(x) > t.half.x || Math.abs(y) > t.half.y) return null;
    return { fraction, forward };
  }
}
