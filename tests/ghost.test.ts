import { beforeEach, describe, expect, it } from 'vitest';
import { neutralInput } from '../src/core/input';
import { DT } from '../src/core/loop';
import { DEFAULT_CAR, carById } from '../src/data/cars';
import { FIRST_CIRCUIT } from '../src/data/tracks';
import {
  GhostPlayer,
  GhostRecorder,
  isGhostData,
  quantizeInput,
  type GhostData,
} from '../src/race/ghost';
import { loadRecord, submitResult, trackKey } from '../src/race/records';
import { RaceSession } from '../src/race/session';
import { buildTrack } from '../src/track/builder';
import { Autopilot, buildRoute, raceOrder } from './autopilot';

/** localStorage en memòria per als tests (Node no en té). */
function installMemoryStorage(): void {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}

beforeEach(() => installMemoryStorage());

describe('quantizeInput', () => {
  it('és idempotent', () => {
    const q = quantizeInput({ ...neutralInput(), steer: 0.123456, throttle: 0.77 });
    expect(quantizeInput(q)).toEqual(q);
  });
});

describe('GhostRecorder / GhostPlayer', () => {
  it('agrupa ticks iguals i els reprodueix en el mateix ordre', () => {
    const rec = new GhostRecorder();
    const a = quantizeInput({ ...neutralInput(), throttle: 1 });
    const b = quantizeInput({ ...neutralInput(), throttle: 1, steer: -0.5, handbrake: true });
    const sequence = [a, a, a, b, b, a];
    const respawns = [false, false, false, false, true, false];
    sequence.forEach((input, i) => rec.record(input, respawns[i]));
    const data = rec.finish('balanced', 1234);
    expect(data.runs.length).toBeLessThan(sequence.length);
    expect(isGhostData(data)).toBe(true);

    const player = new GhostPlayer(data);
    sequence.forEach((input, i) => {
      const frame = player.next();
      expect(frame?.input).toEqual(input);
      expect(frame?.respawn).toBe(respawns[i]);
    });
    expect(player.next()).toBeNull();
    expect(player.done).toBe(true);
  });

  it('rebutja dades de fantasma corruptes', () => {
    expect(isGhostData(null)).toBe(false);
    expect(isGhostData({ physics: 1, car: 'x', time: 1, runs: [[0, 0, 0, 0, 0]] })).toBe(false);
    expect(isGhostData({ physics: 1, car: 'x', time: 1, runs: [[1, 999, 0, 0, 0]] })).toBe(false);
  });
});

describe('rècords', () => {
  it('la clau del circuit no depèn de l ordre de les peces', () => {
    const shuffled = { ...FIRST_CIRCUIT, pieces: [...FIRST_CIRCUIT.pieces].reverse() };
    expect(trackKey(shuffled)).toBe(trackKey(FIRST_CIRCUIT));
    expect(trackKey({ ...FIRST_CIRCUIT, laps: 2 })).not.toBe(trackKey(FIRST_CIRCUIT));
  });

  it('només desa els temps que milloren el rècord', () => {
    const ghost: GhostData = { physics: 1, car: 'balanced', time: 0, runs: [] };
    const base = { splits: [1, 2], car: 'balanced', ghost };
    expect(submitResult('k', { ...base, time: 5000 }).improved).toBe(true);
    expect(submitResult('k', { ...base, time: 6000 }).improved).toBe(false);
    const better = submitResult('k', { ...base, time: 4000 });
    expect(better.improved).toBe(true);
    expect(better.previous?.time).toBe(5000);
    expect(loadRecord('k')?.time).toBe(4000);
  });
});

describe('fantasma', () => {
  it('reprodueix exactament la millor cursa gravada', () => {
    const track = buildTrack(FIRST_CIRCUIT);
    const first = new RaceSession(track, DEFAULT_CAR, { ghostEnabled: true, carById });
    expect(first.ghostRace).toBeNull();
    const { order, reversed } = raceOrder(track);
    const pilot = new Autopilot(buildRoute(track, order, reversed), true);
    for (let i = 0; i < 60 * 240 && first.race.phase !== 'finished'; i++) {
      const { input, respawn } = pilot.control(first.vehicle, DT, first.race.phase === 'running');
      first.tick(input, respawn);
    }
    expect(first.result?.improved).toBe(true);
    const recorded = first.result?.time ?? 0;

    const second = new RaceSession(track, DEFAULT_CAR, { ghostEnabled: true, carById });
    expect(second.best?.time).toBe(recorded);
    const ghostRace = second.ghostRace;
    expect(ghostRace).not.toBeNull();
    for (let i = 0; i < 60 * 240 && ghostRace?.phase !== 'finished'; i++) {
      second.tick(neutralInput(), false);
    }
    expect(ghostRace?.finishTime).toBe(recorded);
    expect(ghostRace?.splits).toEqual(first.race.splits);
    // El jugador no s'ha mogut i els parcials es comparen amb el rècord.
    expect(second.splitDelta(0, first.race.splits[0] - 100)).toBe(-100);
  });

  it('es pot desactivar', () => {
    const track = buildTrack(FIRST_CIRCUIT);
    const ghost: GhostData = {
      physics: 1,
      car: 'balanced',
      time: 1000,
      runs: [[10, 0, 127, 0, 0]],
    };
    submitResult(trackKey(FIRST_CIRCUIT), { time: 1000, splits: [], car: 'balanced', ghost });
    const off = new RaceSession(track, DEFAULT_CAR, { ghostEnabled: false, carById });
    expect(off.ghostRace).toBeNull();
    const on = new RaceSession(track, DEFAULT_CAR, { ghostEnabled: true, carById });
    expect(on.ghostRace).not.toBeNull();
  });
});
