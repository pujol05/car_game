import { describe, expect, it } from 'vitest';
import { Vec3 } from '../src/core/math';
import { FIRST_CIRCUIT } from '../src/data/tracks';
import { createRayHit } from '../src/physics/collision';
import { buildTrack, worldCells } from '../src/track/builder';
import { TILE, cellKey, edgeKey, rotateDir, rotateXZ } from '../src/track/grid';
import { PIECES } from '../src/track/pieces';
import { PIECE_TYPES, type TrackData } from '../src/track/types';

function single(type: (typeof PIECE_TYPES)[number]): TrackData {
  return { name: 't', author: 't', laps: 1, pieces: [{ type, x: 0, y: 0, z: 0, r: 0 }] };
}

describe('peces', () => {
  it.each(PIECE_TYPES)('%s genera geometria vàlida', (type) => {
    const track = buildTrack(single(type));
    expect(track.world.triangleCount).toBeGreaterThan(0);
    expect(track.solid.positions.length).toBeGreaterThan(0);
    expect(track.solid.positions.every(Number.isFinite)).toBe(true);
    const route = track.pieces[0].route;
    expect(route.length).toBeGreaterThan(2);
    for (const f of route) {
      expect(Math.abs(f.t.length() - 1)).toBeLessThan(1e-9);
      expect(Math.abs(f.u.dot(f.t))).toBeLessThan(1e-9);
    }
  });

  it('els extrems de la línia central coincideixen amb els connectors', () => {
    for (const type of PIECE_TYPES) {
      const def = PIECES[type];
      const route = buildTrack(single(type)).pieces[0].route;
      def.connectors.forEach((c, i) => {
        const f = route[i === 0 ? 0 : route.length - 1];
        const [cx, cy, cz] = c.cell;
        const dx = [0, 1, 0, -1][c.dir];
        const dz = [1, 0, -1, 0][c.dir];
        const expected = new Vec3(cx * TILE + (dx * TILE) / 2, cy * 5, cz * TILE + (dz * TILE) / 2);
        // La rampa acaba enlaire: només comprovem el pla horitzontal.
        if (type === 'ramp' && i === 1) expected.y = f.p.y;
        expect(f.p.distanceTo(expected)).toBeLessThan(1e-6);
      });
    }
  });

  it('la calçada és detectable amb raigs a sobre de cada peça', () => {
    const track = buildTrack(single('straight'));
    const hit = createRayHit();
    expect(track.world.raycast(new Vec3(0, 2, 5), new Vec3(0, -1, 0), 5, hit)).toBe(true);
    expect(hit.distance).toBeCloseTo(2);
  });
});

describe('Primer Circuit', () => {
  it('és un circuit tancat sense peces superposades', () => {
    const cells = new Set<string>();
    for (const p of FIRST_CIRCUIT.pieces) {
      for (const c of worldCells(p)) {
        const key = cellKey(...c);
        expect(cells.has(key)).toBe(false);
        cells.add(key);
      }
    }
    // Cada connector ha de coincidir exactament amb un connector d'una altra peça.
    const edges = new Map<string, number>();
    for (const p of FIRST_CIRCUIT.pieces) {
      for (const c of PIECES[p.type].connectors) {
        const [rx, rz] = rotateXZ(c.cell[0], c.cell[2], p.r);
        const key = edgeKey(p.x + rx, p.y + c.cell[1], p.z + rz, rotateDir(c.dir, p.r));
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    for (const count of edges.values()) expect(count).toBe(2);

    const track = buildTrack(FIRST_CIRCUIT);
    expect(track.lapTrack).toBe(true);
    expect(track.laps).toBe(3);
    expect(track.checkpointCount).toBe(3);
    expect(track.triggers.filter((t) => t.kind === 'boost')).toHaveLength(2);
  });
});
