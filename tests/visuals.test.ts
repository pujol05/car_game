import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mulberry32, seedFrom } from '../src/core/random';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/core/settings';
import { DEFAULT_CAR } from '../src/data/cars';
import { FIRST_CIRCUIT } from '../src/data/tracks';
import { Vehicle } from '../src/physics/vehicle';
import { Decoration } from '../src/render/decoration';
import { ParticleSystem } from '../src/render/particles';
import { SkidMarks } from '../src/render/skidMarks';
import { buildTrack } from '../src/track/builder';
import { drive } from './helpers';

describe('configuració', () => {
  it('descarta valors invàlids i manté els vàlids', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const custom = sanitizeSettings({
      timeOfDay: 'night',
      speedLines: false,
      volume: 0.25,
      quality: 'low',
      particles: false,
      ghost: false,
    });
    expect(custom).toEqual({
      timeOfDay: 'night',
      speedLines: false,
      volume: 0.25,
      quality: 'low',
      particles: false,
      ghost: false,
    });
    const bad = sanitizeSettings({ timeOfDay: 'migdia', volume: 7, quality: 'ultra', ghost: 'no' });
    expect(bad).toEqual({ ...DEFAULT_SETTINGS, volume: 1 });
  });
});

describe('mulberry32', () => {
  it('és repetible i dona valors entre 0 i 1', () => {
    const a = mulberry32(seedFrom('drift'));
    const b = mulberry32(seedFrom('drift'));
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('decoració', () => {
  const track = buildTrack(FIRST_CIRCUIT);

  function firstTreeMatrix(d: Decoration): number[] {
    const mesh = d.root.children.find((c) => c instanceof THREE.InstancedMesh) as
      THREE.InstancedMesh | undefined;
    const m = new THREE.Matrix4();
    mesh?.getMatrixAt(0, m);
    return m.toArray();
  }

  it('és la mateixa per a la mateixa llavor', () => {
    const a = new Decoration(track, 42);
    const b = new Decoration(track, 42);
    const c = new Decoration(track, 43);
    expect(a.root.children.length).toBe(b.root.children.length);
    expect(firstTreeMatrix(a)).toEqual(firstTreeMatrix(b));
    expect(firstTreeMatrix(a)).not.toEqual(firstTreeMatrix(c));
  });

  it('no posa arbres sobre el circuit', () => {
    const d = new Decoration(track, 7);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (const child of d.root.children) {
      if (!(child instanceof THREE.InstancedMesh)) continue;
      for (let i = 0; i < child.count; i++) {
        child.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        // Cap objecte a menys de 12 m del centre d'una peça.
        for (const piece of track.pieces) {
          for (const f of piece.route) {
            expect(Math.hypot(f.p.x - p.x, f.p.z - p.z)).toBeGreaterThan(10);
          }
        }
      }
    }
  });
});

describe('partícules', () => {
  it('moren quan s acaba la seva vida', () => {
    const ps = new ParticleSystem(4, false);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    ps.emit({
      x: 0,
      y: 0,
      z: 0,
      vx: 1,
      vy: 0,
      vz: 0,
      color: new THREE.Color(1, 1, 1),
      size: 1,
      growth: 1,
      life: 0.5,
      alpha: 1,
      gravity: 0,
      drag: 0,
    });
    ps.update(0.25, camera, 600);
    const alpha = ps.points.geometry.getAttribute('alpha');
    expect(alpha.getX(0)).toBeGreaterThan(0);
    ps.update(0.3, camera, 600);
    expect(alpha.getX(0)).toBe(0);
  });
});

describe('marques de pneumàtics', () => {
  it('només es dibuixen en lliscar', () => {
    const track = buildTrack(FIRST_CIRCUIT);
    const v = new Vehicle(DEFAULT_CAR, track.world);
    v.reset(track.spawn.pos, track.spawn.heading);
    const marks = new SkidMarks();
    for (let i = 0; i < 60; i++) {
      drive(v, { throttle: 1 }, 1 / 60);
      marks.update(v);
    }
    expect(marks.mesh.geometry.drawRange.count).toBe(0);
    for (let i = 0; i < 90; i++) {
      drive(v, { throttle: 1, steer: 1, handbrake: true }, 1 / 60);
      marks.update(v);
    }
    expect(v.drifting).toBe(true);
    expect(marks.mesh.geometry.drawRange.count).toBeGreaterThan(0);
  });
});
