import { describe, expect, it } from 'vitest';
import { Quat, Vec3, approach, clamp } from '../src/core/math';

describe('Vec3', () => {
  it('calcula el producte vectorial amb la regla de la mà dreta', () => {
    const r = new Vec3().crossVectors(new Vec3(1, 0, 0), new Vec3(0, 1, 0));
    expect(r).toEqual(new Vec3(0, 0, 1));
  });

  it('normalitza sense dividir per zero', () => {
    expect(new Vec3(3, 0, 4).normalize().length()).toBeCloseTo(1);
    expect(new Vec3().normalize()).toEqual(new Vec3());
  });
});

describe('Quat', () => {
  it('rota +Z cap a +X amb 90° sobre Y', () => {
    const q = new Quat().setFromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2);
    const v = new Vec3(0, 0, 1).applyQuat(q);
    expect(v.x).toBeCloseTo(1);
    expect(v.z).toBeCloseTo(0);
  });

  it('applyQuatInverse desfà applyQuat', () => {
    const q = new Quat().setFromAxisAngle(new Vec3(1, 2, 3).normalize(), 1.1);
    const v = new Vec3(0.3, -2, 5).applyQuat(q).applyQuatInverse(q);
    expect(v.x).toBeCloseTo(0.3);
    expect(v.y).toBeCloseTo(-2);
    expect(v.z).toBeCloseTo(5);
  });

  it('integra una velocitat angular constant', () => {
    const q = new Quat();
    for (let i = 0; i < 1000; i++) q.integrate(new Vec3(0, Math.PI / 2, 0), 0.001);
    const v = new Vec3(0, 0, 1).applyQuat(q);
    expect(v.x).toBeCloseTo(1, 3);
  });

  it('slerp interpola a mig camí', () => {
    const a = new Quat();
    const b = new Quat().setFromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2);
    const mid = a.clone().slerp(b, 0.5);
    const expected = new Quat().setFromAxisAngle(new Vec3(0, 1, 0), Math.PI / 4);
    expect(mid.y).toBeCloseTo(expected.y);
    expect(mid.w).toBeCloseTo(expected.w);
  });
});

describe('utilitats', () => {
  it('clamp i approach', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(approach(0, 1, 0.3)).toBeCloseTo(0.3);
    expect(approach(1, 0, 5)).toBe(0);
  });
});
