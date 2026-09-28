import { describe, expect, it } from 'vitest';
import { DT } from '../src/core/loop';
import { Vec3 } from '../src/core/math';
import { DEFAULT_CAR } from '../src/data/cars';
import { buildPlayground } from '../src/data/playground';
import { CollisionWorld, Surface } from '../src/physics/collision';
import { RIDE_HEIGHT, Vehicle } from '../src/physics/vehicle';
import { drive } from './helpers';

function flatWorld(): CollisionWorld {
  const w = new CollisionWorld();
  w.groundY = 0;
  w.groundMaterial = Surface.Road;
  w.build();
  return w;
}

function makeCar(world = flatWorld(), heading = 0, at = new Vec3(0, RIDE_HEIGHT, 0)): Vehicle {
  const v = new Vehicle(DEFAULT_CAR, world);
  v.reset(at, heading);
  return v;
}

function upDot(v: Vehicle): number {
  return v.upVector(new Vec3()).y;
}

describe('Vehicle', () => {
  it('reposa estable a l alçada de marxa', () => {
    const v = makeCar();
    drive(v, {}, 2);
    expect(v.groundedWheels).toBe(4);
    expect(v.pos.y).toBeGreaterThan(RIDE_HEIGHT - 0.1);
    expect(v.pos.y).toBeLessThan(RIDE_HEIGHT + 0.1);
    expect(v.vel.length()).toBeLessThan(0.05);
    expect(upDot(v)).toBeGreaterThan(0.999);
  });

  it('accelera endavant sense superar la velocitat màxima', () => {
    const v = makeCar();
    drive(v, { throttle: 1 }, 1);
    expect(v.forwardSpeed).toBeGreaterThan(15);
    drive(v, { throttle: 1 }, 25);
    expect(v.forwardSpeed).toBeLessThanOrEqual(DEFAULT_CAR.maxSpeed);
    expect(v.forwardSpeed).toBeGreaterThan(DEFAULT_CAR.maxSpeed * 0.9);
    expect(upDot(v)).toBeGreaterThan(0.99);
  });

  it('frena i fa marxa enrere', () => {
    const v = makeCar();
    drive(v, { throttle: 1 }, 2);
    drive(v, { brake: 1 }, 3);
    expect(v.forwardSpeed).toBeLessThan(0);
  });

  it('gira a la dreta amb direcció positiva', () => {
    const v = makeCar();
    drive(v, { throttle: 1 }, 1);
    drive(v, { throttle: 1, steer: 1 }, 1);
    expect(v.pos.x).toBeLessThan(-1);
    expect(upDot(v)).toBeGreaterThan(0.98);
  });

  it('derrapa amb el fre de mà i carrega el turbo', () => {
    const v = makeCar();
    drive(v, { throttle: 1 }, 2.5);
    drive(v, { throttle: 1, steer: 1, handbrake: true }, 0.2);
    expect(v.drifting).toBe(true);
    drive(v, { throttle: 1, steer: 1, handbrake: true }, 2);
    expect(v.drifting).toBe(true);
    expect(Math.abs(v.slipAngle)).toBeGreaterThan(0.15);
    expect(v.turbo).toBeGreaterThan(0.2);
    expect(upDot(v)).toBeGreaterThan(0.97);
    expect(v.forwardSpeed).toBeGreaterThan(15);
    drive(v, { throttle: 1 }, 1);
    expect(v.drifting).toBe(false);
    expect(Math.abs(v.slipAngle)).toBeLessThan(0.1);
  });

  it('el turbo dona més velocitat i es consumeix', () => {
    const a = makeCar();
    const b = makeCar();
    a.turbo = 1;
    b.turbo = 1;
    drive(a, { throttle: 1 }, 2);
    drive(b, { throttle: 1, boost: true }, 2);
    expect(b.forwardSpeed).toBeGreaterThan(a.forwardSpeed + 8);
    expect(b.turbo).toBeLessThan(0.2);
    expect(a.turbo).toBe(1);
    drive(b, { throttle: 1, boost: true }, 1);
    expect(b.turbo).toBe(0);
  });

  it('salta des d una rampa i aterra dret', () => {
    const world = new CollisionWorld();
    world.groundY = 0;
    world.groundMaterial = Surface.Road;
    buildPlayground(world);
    world.build();
    // La rampa petita comença a z = 60 i puja cap a +Z.
    const v = makeCar(world, 0, new Vec3(0, RIDE_HEIGHT, 0));
    let maxAir = 0;
    for (let i = 0; i < Math.round(8 / DT); i++) {
      v.step({ throttle: 1, brake: 0, steer: 0, handbrake: false, boost: false }, DT);
      maxAir = Math.max(maxAir, v.airTime);
    }
    expect(maxAir).toBeGreaterThan(0.5);
    expect(v.groundedWheels).toBeGreaterThan(2);
    expect(upDot(v)).toBeGreaterThan(0.97);
    expect(v.pos.z).toBeGreaterThan(150);
  });

  it('no travessa les parets', () => {
    const world = new CollisionWorld();
    world.groundY = 0;
    world.groundMaterial = Surface.Road;
    buildPlayground(world);
    world.build();
    // La paret és a x = 25 (gruix 1). Hi anem en diagonal a tota velocitat.
    const v = makeCar(world, Math.PI / 4, new Vec3(0, RIDE_HEIGHT, 0));
    drive(v, { throttle: 1, boost: true }, 4);
    expect(v.pos.x).toBeLessThan(25);
  });

  it('és determinista', () => {
    const a = makeCar();
    const b = makeCar();
    for (const car of [a, b]) {
      drive(car, { throttle: 1, steer: 0.4 }, 2);
      drive(car, { throttle: 1, steer: -1, handbrake: true }, 1.5);
      drive(car, { brake: 0.5, steer: 1 }, 1);
    }
    expect(a.pos).toEqual(b.pos);
    expect(a.rot).toEqual(b.rot);
    expect(a.vel).toEqual(b.vel);
  });
});
