import { describe, expect, it } from 'vitest';
import { DT } from '../src/core/loop';
import { CARS, type CarStats } from '../src/data/cars';
import { OFFICIAL_TRACKS } from '../src/data/tracks';
import { validateTrack } from '../src/editor/validation';
import { Vehicle } from '../src/physics/vehicle';
import { MEDALS, medalFor, medalsFromAuthor, nextMedal } from '../src/race/medals';
import { RaceTracker } from '../src/race/race';
import { type BuiltTrack, buildTrack } from '../src/track/builder';
import type { TrackData } from '../src/track/types';
import { Autopilot, buildRoute, raceOrder } from './autopilot';

function botRun(track: BuiltTrack, car: CarStats, caution: number) {
  const vehicle = new Vehicle(car, track.world);
  const race = new RaceTracker(track, vehicle);
  const { order, reversed } = raceOrder(track);
  const pilot = new Autopilot(buildRoute(track, order, reversed), track.lapTrack, caution);
  let respawns = 0;
  for (let i = 0; i < 60 * 300 && race.phase !== 'finished'; i++) {
    const running = race.phase === 'running';
    const { input, respawn } = pilot.control(vehicle, DT, running);
    if (respawn && running) respawns++;
    race.update(input, respawn && running);
  }
  return { finished: race.phase === 'finished', time: race.finishTime ?? Infinity, respawns };
}

describe('medalles', () => {
  const medals = medalsFromAuthor(60000);

  it('van de més difícil a més fàcil', () => {
    expect(medals.author).toBeLessThan(medals.gold);
    expect(medals.gold).toBeLessThan(medals.silver);
    expect(medals.silver).toBeLessThan(medals.bronze);
  });

  it('dona la millor medalla aconseguida i la següent', () => {
    expect(medalFor(59000, medals)).toBe('author');
    expect(medalFor(medals.gold, medals)).toBe('gold');
    expect(medalFor(medals.bronze + 1, medals)).toBeNull();
    expect(nextMedal(null, medals)).toBe('bronze');
    expect(nextMedal(medals.silver, medals)).toBe('gold');
    expect(nextMedal(medals.author, medals)).toBeNull();
    expect(MEDALS).toHaveLength(4);
  });
});

describe('circuits oficials', () => {
  it('hi ha cinc circuits amb noms diferents i medalles', () => {
    expect(OFFICIAL_TRACKS).toHaveLength(5);
    expect(new Set(OFFICIAL_TRACKS.map((t) => t.name)).size).toBe(5);
    for (const t of OFFICIAL_TRACKS) expect(t.medals).toBeDefined();
  });

  it.each(OFFICIAL_TRACKS.map((t) => [t.name, t] as [string, TrackData]))(
    '%s és vàlid, completable amb tots els cotxes i té un temps d autor assolible',
    (_name, data) => {
      const v = validateTrack(data);
      expect(v.errors).toEqual([]);
      expect(v.warnings).toEqual([]);
      const track = buildTrack(data);
      let bestBot = Infinity;
      for (const car of CARS) {
        const safe = botRun(track, car, 0.85);
        expect(safe.finished).toBe(true);
        expect(safe.respawns).toBe(0);
        const fast = botRun(track, car, 0.95);
        if (fast.finished && fast.respawns === 0) bestBot = Math.min(bestBot, fast.time);
        bestBot = Math.min(bestBot, safe.time);
      }
      expect(bestBot).toBeLessThanOrEqual(data.medals?.author ?? 0);
    },
    120000,
  );
});
