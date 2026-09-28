// Sessió de cursa: el cotxe del jugador, el fantasma del millor temps, la
// gravació de l'entrada i el desat del rècord en acabar.

import { type DriveInput, neutralInput } from '../core/input';
import type { CarStats } from '../data/cars';
import { PHYSICS_VERSION, Vehicle } from '../physics/vehicle';
import type { BuiltTrack } from '../track/builder';
import { GhostPlayer, GhostRecorder, quantizeInput } from './ghost';
import { type RaceEvent, RaceTracker } from './race';
import { type TrackRecord, loadRecord, submitResult, trackKey } from './records';

export interface SessionResult {
  time: number;
  improved: boolean;
  previous: TrackRecord | null;
}

export interface SessionOptions {
  ghostEnabled: boolean;
  /** Retorna les estadístiques d'un cotxe pel seu identificador. */
  carById: (id: string) => CarStats;
}

export class RaceSession {
  readonly key: string;
  readonly vehicle: Vehicle;
  readonly race: RaceTracker;
  /** Millor rècord en començar la sessió. */
  readonly best: TrackRecord | null;
  readonly ghostVehicle: Vehicle | null = null;
  readonly ghostRace: RaceTracker | null = null;
  result: SessionResult | null = null;

  private readonly ghostPlayer: GhostPlayer | null = null;
  private readonly recorder = new GhostRecorder();
  private readonly neutral = neutralInput();

  constructor(
    readonly track: BuiltTrack,
    readonly car: CarStats,
    options: SessionOptions,
  ) {
    this.key = trackKey(track.data);
    this.best = loadRecord(this.key);
    this.vehicle = new Vehicle(car, track.world);
    this.race = new RaceTracker(track, this.vehicle);

    const ghost = this.best?.ghost;
    if (options.ghostEnabled && ghost && ghost.physics === PHYSICS_VERSION) {
      this.ghostVehicle = new Vehicle(options.carById(ghost.car), track.world);
      this.ghostRace = new RaceTracker(track, this.ghostVehicle);
      this.ghostPlayer = new GhostPlayer(ghost);
    }
  }

  /** Avança un tick de física per al jugador i el fantasma. */
  tick(rawInput: DriveInput, respawn: boolean): readonly RaceEvent[] {
    const input = quantizeInput(rawInput);
    const running = this.race.phase === 'running';
    const doRespawn = respawn && running;
    const events = this.race.update(input, doRespawn);
    if (running) this.recorder.record(input, doRespawn);

    if (this.ghostRace && this.ghostPlayer) {
      const frame = this.ghostRace.phase === 'running' ? this.ghostPlayer.next() : null;
      this.ghostRace.update(frame?.input ?? this.neutral, frame?.respawn ?? false);
    }

    for (const e of events) {
      if (e.type === 'finish') this.onFinish(e.time);
    }
    return events;
  }

  /** Diferència amb el millor temps en un parcial (negatiu = més ràpid). */
  splitDelta(split: number, time: number): number | null {
    const bestSplit = this.best?.splits[split];
    return bestSplit === undefined ? null : time - bestSplit;
  }

  private onFinish(time: number): void {
    const { improved, previous } = submitResult(this.key, {
      time,
      splits: [...this.race.splits],
      car: this.car.id,
      ghost: this.recorder.finish(this.car.id, time),
    });
    this.result = { time, improved, previous };
  }
}
