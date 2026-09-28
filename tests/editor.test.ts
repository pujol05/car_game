import { describe, expect, it } from 'vitest';
import { FIRST_CIRCUIT } from '../src/data/tracks';
import { EditorModel } from '../src/editor/editorModel';
import { validateTrack } from '../src/editor/validation';
import { traceRoute } from '../src/track/connectivity';
import { GRID_HALF } from '../src/track/grid';
import {
  TrackCodeError,
  codeFromHash,
  decodeTrack,
  encodeTrack,
  extractCode,
  trackLink,
} from '../src/track/serialize';
import type { TrackData } from '../src/track/types';
import { TrackWalker } from '../src/track/walker';

function track(w: TrackWalker, laps = 1): TrackData {
  return { name: 'Prova', author: 'Test', laps, pieces: w.pieces };
}

describe('EditorModel', () => {
  it('col·loca peces i n evita la superposició', () => {
    const m = new EditorModel();
    expect(m.place({ type: 'straight', x: 0, y: 0, z: 0, r: 0 })).toBe(true);
    expect(m.place({ type: 'straight', x: 0, y: 0, z: 0, r: 1 })).toBe(false);
    // La corba gran ocupa 2x2 cel·les: (0,1) queda lliure però (0,0) no.
    expect(m.place({ type: 'curveLarge', x: 0, y: 0, z: 0, r: 0 })).toBe(false);
    expect(m.place({ type: 'curveLarge', x: 0, y: 0, z: 1, r: 0 })).toBe(true);
    expect(m.pieceAt(-1, 0, 2)).toBe(1);
    expect(m.pieces).toHaveLength(2);
  });

  it('respecta els límits de la graella', () => {
    const m = new EditorModel();
    expect(m.place({ type: 'straight', x: GRID_HALF, y: 0, z: 0, r: 0 })).toBe(false);
    expect(m.place({ type: 'straight', x: 0, y: -1, z: 0, r: 0 })).toBe(false);
    expect(m.place({ type: 'curveLarge', x: -GRID_HALF, y: 0, z: 0, r: 0 })).toBe(false);
  });

  it('desfà i refà col·locacions, esborrats i buidats', () => {
    const m = new EditorModel();
    let changes = 0;
    m.onChange = () => changes++;
    m.place({ type: 'straight', x: 0, y: 0, z: 0, r: 0 });
    m.place({ type: 'boost', x: 0, y: 0, z: 1, r: 0 });
    m.removeAt(0, 0, 0);
    expect(m.pieces.map((p) => p.type)).toEqual(['boost']);
    m.undo();
    expect(m.pieces).toHaveLength(2);
    m.clear();
    expect(m.pieces).toHaveLength(0);
    m.undo();
    expect(m.pieces).toHaveLength(2);
    m.undo();
    m.undo();
    expect(m.pieces).toHaveLength(0);
    expect(m.canUndo).toBe(false);
    m.redo();
    m.redo();
    expect(m.pieces).toHaveLength(2);
    expect(m.canRedo).toBe(true);
    // Una acció nova esborra la pila de refer.
    m.place({ type: 'straight', x: 3, y: 0, z: 3, r: 0 });
    expect(m.canRedo).toBe(false);
    expect(changes).toBeGreaterThan(8);
  });

  it('carrega circuits i exporta les dades', () => {
    const m = new EditorModel();
    m.load(FIRST_CIRCUIT);
    const out = m.toTrackData();
    expect(out.pieces).toHaveLength(FIRST_CIRCUIT.pieces.length);
    expect(out.name).toBe(FIRST_CIRCUIT.name);
    expect(validateTrack(out).valid).toBe(true);
  });
});

describe('validateTrack', () => {
  it('accepta el primer circuit', () => {
    const r = validateTrack(FIRST_CIRCUIT);
    expect(r.errors).toEqual([]);
    expect(r.route.end).toBe('loop');
    expect(r.route.steps).toHaveLength(FIRST_CIRCUIT.pieces.length);
  });

  it('accepta un circuit de sortida i meta separades', () => {
    const w = new TrackWalker().place('start').straight().place('checkpoint').right();
    w.place('finish');
    const r = validateTrack(track(w));
    expect(r.errors).toEqual([]);
    expect(r.route.end).toBe('finish');
  });

  it('detecta la falta de sortida, meta i checkpoints', () => {
    expect(validateTrack(track(new TrackWalker().straight(2))).errors).toContain(
      'Falta la sortida.',
    );
    const noFinish = validateTrack(track(new TrackWalker().place('start').straight()));
    expect(noFinish.errors).toContain('Falta la meta.');
    expect(noFinish.errors).toContain('Cal com a mínim un checkpoint.');
  });

  it('detecta circuits oberts', () => {
    const w = new TrackWalker().place('start').place('checkpoint').straight();
    w.x += 1; // Deixem un forat.
    w.place('finish');
    const r = validateTrack(track(w));
    expect(r.valid).toBe(false);
    expect(r.route.end).toBe('deadEnd');
    expect(r.errors.some((e) => e.includes('interromp'))).toBe(true);
  });

  it('detecta una meta girada', () => {
    const w = new TrackWalker().place('start').place('checkpoint').straight();
    const pieces = [
      ...w.pieces,
      { type: 'finish' as const, x: w.x, y: w.y, z: w.z, r: 2 as const },
    ];
    const r = validateTrack({ name: 'x', author: 'x', laps: 1, pieces });
    expect(r.route.end).toBe('wrongWay');
    expect(r.valid).toBe(false);
  });

  it('detecta checkpoints fora del recorregut', () => {
    const w = new TrackWalker().place('start').place('checkpoint').straight().place('finish');
    const pieces = [...w.pieces, { type: 'checkpoint' as const, x: 5, y: 0, z: 5, r: 0 as const }];
    const r = validateTrack({ name: 'x', author: 'x', laps: 1, pieces });
    expect(r.errors).toContain('Hi ha 1 checkpoint fora del recorregut.');
  });

  it('enllaça una rampa amb la peça on s aterra encara que hi hagi un buit', () => {
    const w = new TrackWalker().place('start').place('checkpoint').place('ramp');
    w.z += 2; // Buit de dues cel·les després de la rampa.
    w.straight().place('finish');
    const r = validateTrack(track(w));
    expect(r.errors).toEqual([]);
    expect(traceRoute(w.pieces).steps).toHaveLength(w.pieces.length);
  });

  it('detecta superposicions en circuits importats', () => {
    const pieces = [
      { type: 'straight' as const, x: 0, y: 0, z: 0, r: 0 as const },
      { type: 'straight' as const, x: 0, y: 0, z: 0, r: 0 as const },
    ];
    expect(validateTrack({ name: 'x', author: 'x', laps: 1, pieces }).errors).toContain(
      'Hi ha peces superposades.',
    );
  });
});

describe('serialització', () => {
  it('codifica i descodifica sense pèrdues', () => {
    const code = encodeTrack(FIRST_CIRCUIT);
    expect(code).toMatch(/^[A-Za-z0-9+\-$_]+$/);
    // Els codis no porten medalles (només els circuits oficials en tenen).
    expect(decodeTrack(code)).toEqual({ ...FIRST_CIRCUIT, medals: undefined });
    // Un codi comprimit és molt més curt que el JSON.
    expect(code.length).toBeLessThan(JSON.stringify(FIRST_CIRCUIT).length / 3);
  });

  it('genera i llegeix enllaços', () => {
    const link = trackLink(FIRST_CIRCUIT, 'http://localhost:5173/');
    expect(link.startsWith('http://localhost:5173/#track=')).toBe(true);
    expect(decodeTrack(extractCode(link)).pieces).toEqual(FIRST_CIRCUIT.pieces);
    expect(codeFromHash(new URL(link).hash)).toBe(extractCode(link));
    expect(codeFromHash('#altra-cosa')).toBeNull();
  });

  it('rebutja codis invàlids amb un error clar', () => {
    expect(() => decodeTrack('')).toThrow(TrackCodeError);
    expect(() => decodeTrack('això no és un codi')).toThrow(TrackCodeError);
    const bad = encodeTrack({ ...FIRST_CIRCUIT, laps: 42 });
    expect(() => decodeTrack(bad)).toThrow(TrackCodeError);
  });
});
