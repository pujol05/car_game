// Circuits inclosos al joc.

import type { TrackData } from '../track/types';
import { TrackWalker } from '../track/walker';

/** Primer circuit fet a mà: fa servir tots els tipus de peça. */
function buildFirstCircuit(): TrackData {
  const w = new TrackWalker(0, 0, 0, 0);
  w.place('startFinish').straight().place('boost').straight().place('checkpoint').straight();
  // Corba oberta cap a la dreta i tram elevat amb pujada i baixada.
  w.right(true).up().straight(2).down();
  // Rampa de salt amb recta d'aterratge.
  w.place('ramp').straight(6);
  // Corba tancada, turbo i looping.
  w.right().place('boost').place('checkpoint').place('loop');
  // Obstacles i tornada cap a la sortida.
  w.straight().place('obstacle').straight().right();
  w.straight(6).place('checkpoint').straight(6).right();
  return { name: 'Primer Circuit', author: 'DRIFT', laps: 3, pieces: w.pieces };
}

export const FIRST_CIRCUIT: TrackData = buildFirstCircuit();

/** Circuits oficials, en ordre de dificultat. */
export const OFFICIAL_TRACKS: readonly TrackData[] = [FIRST_CIRCUIT];
