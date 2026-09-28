import { describe, expect, it } from 'vitest';
import type { DriveInput } from '../src/core/input';
import { DT } from '../src/core/loop';
import { Vec3 } from '../src/core/math';
import { DEFAULT_CAR } from '../src/data/cars';
import { RIDE_HEIGHT, Vehicle } from '../src/physics/vehicle';

function makeCar(): Vehicle {
  const v = new Vehicle(DEFAULT_CAR);
  v.reset(new Vec3(0, RIDE_HEIGHT, 0), 0);
  return v;
}

function run(v: Vehicle, input: Partial<DriveInput>, seconds: number): void {
  const full: DriveInput = { throttle: 0, brake: 0, steer: 0, ...input };
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) v.step(full, DT);
}

describe('Vehicle (pla)', () => {
  it('accelera endavant i no supera la velocitat màxima', () => {
    const v = makeCar();
    run(v, { throttle: 1 }, 1);
    expect(v.forwardSpeed).toBeGreaterThan(15);
    expect(v.pos.z).toBeGreaterThan(5);
    run(v, { throttle: 1 }, 30);
    expect(v.forwardSpeed).toBeLessThanOrEqual(DEFAULT_CAR.maxSpeed);
  });

  it('frena fins a aturar-se i després fa marxa enrere', () => {
    const v = makeCar();
    run(v, { throttle: 1 }, 2);
    run(v, { brake: 1 }, 3);
    expect(v.forwardSpeed).toBeLessThan(0);
  });

  it('gira a la dreta quan la direcció és positiva', () => {
    const v = makeCar();
    run(v, { throttle: 1 }, 1);
    run(v, { throttle: 1, steer: 1 }, 1);
    // La dreta del cotxe mirant +Z és -X.
    expect(v.pos.x).toBeLessThan(-1);
  });

  it('és determinista', () => {
    const a = makeCar();
    const b = makeCar();
    for (const car of [a, b]) {
      run(car, { throttle: 1, steer: 0.4 }, 2);
      run(car, { brake: 0.5, steer: -1 }, 1);
    }
    expect(a.pos).toEqual(b.pos);
    expect(a.rot).toEqual(b.rot);
  });
});
