// Circuits oficials inclosos al joc, en ordre de dificultat creixent. Es
// dissenyen encadenant peces amb el TrackWalker, que garanteix que connectin.
// El temps d'autor de cada circuit és el millor temps del pilot automàtic
// dels tests (tests/official.test.ts comprova que és assolible).

import { type MedalTimes, medalsFromAuthor } from '../race/medals';
import type { TrackData } from '../track/types';
import { TrackWalker } from '../track/walker';

function track(name: string, laps: number, w: TrackWalker, author: number): TrackData {
  const medals: MedalTimes = medalsFromAuthor(author);
  return { name, author: 'DRIFT', laps, pieces: w.pieces, medals };
}

/** 1. Iniciació: un rectangle amb corbes obertes per aprendre els controls. */
function initiation(): TrackData {
  const w = new TrackWalker(0, 0, 0, 0);
  w.place('startFinish').straight(2).place('checkpoint').place('boost').straight(2);
  w.right(true).straight(2).place('boost').straight(1);
  w.right(true).straight(3).place('checkpoint').straight(3);
  w.right(true).straight(4);
  w.right(true);
  return track('Iniciació', 3, w, 48700);
}

/** 2. Primer Circuit: pujada, rampa, looping i obstacles. */
function firstCircuit(): TrackData {
  const w = new TrackWalker(0, 0, 0, 0);
  w.place('startFinish').straight().place('boost').straight().place('checkpoint').straight();
  w.right(true).up().straight(2).down();
  w.place('ramp').straight(6);
  w.right().place('boost').place('checkpoint').place('loop');
  w.straight().place('obstacle').straight().right();
  w.straight(6).place('checkpoint').straight(6).right();
  return track('Primer Circuit', 3, w, 78400);
}

/** 3. Serralada: puja fins al nivell 2, esses tancades a dalt i baixada cap a un salt. */
function sierra(): TrackData {
  const w = new TrackWalker(0, 0, 0, 0);
  w.place('startFinish').straight().up().place('checkpoint').up().straight();
  w.right().straight().left().right();
  w.place('boost').straight(2).place('checkpoint').down().down();
  w.straight().place('ramp').straight(10);
  w.right(true).straight(2).place('obstacle').place('checkpoint').straight(3);
  w.right(true).straight(11).place('checkpoint').straight(10).right();
  return track('Serralada', 2, w, 65700);
}

/** 4. Tirabuixó: dos loopings, esses tancades, obstacles i un salt sobre un buit. */
function corkscrew(): TrackData {
  const w = new TrackWalker(0, 0, 0, 0);
  w.place('startFinish').place('boost').straight().place('loop');
  w.place('checkpoint').straight().right().left().straight().right();
  w.straight().place('obstacle').straight(2).place('ramp').gap(1).straight(7);
  w.right(true).place('checkpoint').straight().place('loop');
  w.straight(2).left().right().straight().place('obstacle').straight();
  w.right(true).straight(7).place('checkpoint').straight(7).right().straight(3);
  return track('Tirabuixó', 2, w, 77100);
}

/** 5. Vertigen: de sortida a meta, pujant fins al nivell 3, amb salts, baixades i looping. */
function vertigo(): TrackData {
  const w = new TrackWalker(0, 0, 0, 0);
  w.place('start').straight().place('boost').up().straight().up().place('checkpoint');
  w.straight().up().straight(2);
  w.right(true).straight(2).place('ramp').gap(2).straight(6).place('checkpoint').straight();
  w.right(true).straight().down().straight().down().straight().down().straight();
  w.place('loop').straight().place('checkpoint').straight(2);
  w.right(true).straight().place('obstacle').straight(2).place('ramp').gap(1);
  w.straight(4).place('checkpoint').straight().place('finish').straight(2);
  return track('Vertigen', 1, w, 32800);
}

export const OFFICIAL_TRACKS: readonly TrackData[] = [
  initiation(),
  firstCircuit(),
  sierra(),
  corkscrew(),
  vertigo(),
];

export const FIRST_CIRCUIT: TrackData = OFFICIAL_TRACKS[1];
