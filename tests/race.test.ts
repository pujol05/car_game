import { describe, expect, it } from 'vitest';
import { neutralInput } from '../src/core/input';
import { DT } from '../src/core/loop';
import { Vec3 } from '../src/core/math';
import { FIRST_CIRCUIT } from '../src/data/tracks';
import { DEFAULT_CAR } from '../src/data/cars';
import { Vehicle } from '../src/physics/vehicle';
import { COUNTDOWN_TICKS, RaceTracker, type RaceEvent } from '../src/race/race';
import { formatTime } from '../src/race/format';
import { buildTrack } from '../src/track/builder';
import { Autopilot, buildRoute, raceOrder } from './autopilot';

describe('formatTime', () => {
  it('formata minuts, segons i mil·lisegons', () => {
    expect(formatTime(0)).toBe('0:00.000');
    expect(formatTime(61234)).toBe('1:01.234');
  });
});

describe('RaceTracker', () => {
  const track = buildTrack(FIRST_CIRCUIT);

  it('manté el cotxe quiet durant el compte enrere', () => {
    const race = new RaceTracker(track, new Vehicle(DEFAULT_CAR, track.world));
    const start = race.vehicle.pos.clone();
    let go = false;
    for (let i = 0; i < COUNTDOWN_TICKS; i++) {
      const events = race.update({ ...neutralInput(), throttle: 1 });
      if (events.some((e) => e.type === 'go')) go = true;
    }
    expect(go).toBe(true);
    expect(race.phase).toBe('running');
    expect(race.vehicle.pos).toEqual(start);
  });

  it('no compta la volta si falten checkpoints', () => {
    const race = new RaceTracker(track, new Vehicle(DEFAULT_CAR, track.world));
    for (let i = 0; i < COUNTDOWN_TICKS; i++) race.update(neutralInput());
    // Marxa enrere per creuar la línia de meta que hi ha darrere la sortida.
    const events: RaceEvent[] = [];
    for (let i = 0; i < 240; i++) events.push(...race.update({ ...neutralInput(), brake: 1 }));
    expect(race.lap).toBe(1);
    expect(race.finishTime).toBeNull();
  });

  it('reapareix sol si el cotxe queda bolcat i quiet', () => {
    const race = new RaceTracker(track, new Vehicle(DEFAULT_CAR, track.world));
    for (let i = 0; i < COUNTDOWN_TICKS; i++) race.update(neutralInput());
    // Posem el cotxe de cap per avall just damunt de la calçada.
    const v = race.vehicle;
    v.rot.setFromAxisAngle(new Vec3(0, 0, 1), Math.PI);
    v.pos.y += 1.2;
    let respawned = false;
    for (let i = 0; i < 60 * 4 && !respawned; i++) {
      respawned = race.update(neutralInput()).some((e) => e.type === 'respawn');
    }
    expect(respawned).toBe(true);
    expect(v.upVector(new Vec3()).y).toBeGreaterThan(0.99);
  });

  it('en reaparèixer a un checkpoint el cotxe queda aturat i alineat', () => {
    const race = new RaceTracker(track, new Vehicle(DEFAULT_CAR, track.world));
    const { order, reversed } = raceOrder(track);
    const pilot = new Autopilot(buildRoute(track, order, reversed), true);
    let cp = false;
    for (let i = 0; i < 60 * 30 && !cp; i++) {
      const { input } = pilot.control(race.vehicle, DT, race.phase === 'running');
      cp = race.update(input).some((e) => e.type === 'checkpoint');
    }
    expect(cp).toBe(true);
    expect(race.vehicle.speed).toBeGreaterThan(20);
    race.update(neutralInput(), true);
    // Just després de reaparèixer: gairebé aturat i mirant en el sentit de la pista.
    expect(race.vehicle.speed).toBeLessThan(1);
    const t = track.triggers.find(
      (tr) => tr.kind === 'checkpoint' && race.taken.has(track.triggers.indexOf(tr)),
    );
    expect(t).toBeDefined();
    expect(race.vehicle.forward(new Vec3()).dot(t?.axisZ ?? new Vec3())).toBeGreaterThan(0.99);
  });

  it('el pilot automàtic completa les tres voltes', () => {
    const vehicle = new Vehicle(DEFAULT_CAR, track.world);
    const race = new RaceTracker(track, vehicle);
    const { order, reversed } = raceOrder(track);
    expect(order).toHaveLength(FIRST_CIRCUIT.pieces.length);
    const pilot = new Autopilot(buildRoute(track, order, reversed), true);
    let respawns = 0;
    const checkpoints: number[] = [];
    for (let i = 0; i < 60 * 240 && race.phase !== 'finished'; i++) {
      const { input, respawn } = pilot.control(vehicle, DT, race.phase === 'running');
      if (respawn && race.phase === 'running') respawns++;
      for (const e of race.update(input, respawn && race.phase === 'running')) {
        if (e.type === 'checkpoint') checkpoints.push(e.time);
      }
    }
    expect(race.phase).toBe('finished');
    expect(respawns).toBe(0);
    expect(race.lapTimes).toHaveLength(3);
    expect(checkpoints).toHaveLength(9);
    expect(race.splits).toHaveLength(12);
    // Els temps parcials són estrictament creixents.
    for (let i = 1; i < race.splits.length; i++) {
      expect(race.splits[i]).toBeGreaterThan(race.splits[i - 1]);
    }
    console.log('Temps del pilot automàtic:', formatTime(race.finishTime ?? 0), race.lapTimes);
  });
});
