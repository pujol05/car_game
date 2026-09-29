import { describe, expect, it } from 'vitest';
import { Vec3 } from '../src/core/math';
import { CollisionWorld, Surface, createRayHit, type Contact } from '../src/physics/collision';

function flatQuadWorld(): CollisionWorld {
  const w = new CollisionWorld();
  // Quadrat de 10x10 a y = 1 amb la cara cap amunt.
  const a = new Vec3(-5, 1, -5);
  const b = new Vec3(-5, 1, 5);
  const c = new Vec3(5, 1, 5);
  const d = new Vec3(5, 1, -5);
  w.addTriangle(a, b, c, Surface.Road);
  w.addTriangle(a, c, d, Surface.Road);
  w.build();
  return w;
}

describe('CollisionWorld', () => {
  it('troba impactes de raigs cap avall sobre una cara', () => {
    const w = flatQuadWorld();
    const hit = createRayHit();
    expect(w.raycast(new Vec3(1, 3, 1), new Vec3(0, -1, 0), 5, hit)).toBe(true);
    expect(hit.distance).toBeCloseTo(2);
    expect(hit.normal.y).toBeCloseTo(1);
    expect(hit.material).toBe(Surface.Road);
  });

  it('ignora les cares posteriors i els raigs massa curts', () => {
    const w = flatQuadWorld();
    const hit = createRayHit();
    expect(w.raycast(new Vec3(0, 0, 0), new Vec3(0, 1, 0), 5, hit)).toBe(false);
    expect(w.raycast(new Vec3(0, 3, 0), new Vec3(0, -1, 0), 1.5, hit)).toBe(false);
  });

  it('fa servir el pla de terra quan no hi ha triangles', () => {
    const w = flatQuadWorld();
    w.groundY = 0;
    const hit = createRayHit();
    expect(w.raycast(new Vec3(20, 2, 0), new Vec3(0, -1, 0), 5, hit)).toBe(true);
    expect(hit.distance).toBeCloseTo(2);
    expect(hit.material).toBe(Surface.Grass);
  });

  it('detecta contactes d esfera i en calcula la penetració', () => {
    const w = flatQuadWorld();
    const out: Contact[] = [];
    const n = w.sphereContacts(new Vec3(2, 1.3, -1), 0.5, out);
    expect(n).toBe(1);
    expect(out[0].depth).toBeCloseTo(0.2);
    expect(out[0].normal.y).toBeCloseTo(1);
    expect(w.sphereContacts(new Vec3(0, 2, 0), 0.5, out)).toBe(0);
  });
});
