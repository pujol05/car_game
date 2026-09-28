// Punt d'entrada: crea el renderer, l'entrada i les pantalles del joc, i
// arrenca el game loop.

import './ui/styles.css';
import { InputManager } from './core/input';
import { FixedStepLoop } from './core/loop';
import { ScreenManager } from './core/screen';
import { DEFAULT_CAR } from './data/cars';
import { FIRST_CIRCUIT } from './data/tracks';
import { EditorScreen } from './editor/editorScreen';
import { SceneRenderer } from './render/scene';
import { codeFromHash, decodeTrack } from './track/serialize';
import type { TrackData } from './track/types';
import { RaceScreen } from './ui/raceScreen';

const appEl = document.getElementById('app');
const uiEl = document.getElementById('ui');
if (!appEl || !uiEl) throw new Error('Falten els contenidors #app o #ui');
const ui: HTMLElement = uiEl;

const view = new SceneRenderer(appEl);
const input = new InputManager();
const screens = new ScreenManager();

function race(track: TrackData, backLabel: string): void {
  screens.show(
    new RaceScreen(view, input, ui, {
      track,
      car: DEFAULT_CAR,
      onBack: () => screens.show(editor),
      backLabel,
    }),
  );
}

const editor = new EditorScreen(view, input, ui, {
  onTest: (track) => race(track, "Esc: tornar a l'editor"),
  onExit: () => race(FIRST_CIRCUIT, 'Esc: editor'),
});

/** Si l'URL porta un circuit (#track=...), l'obre a l'editor. */
function openFromHash(): boolean {
  const code = codeFromHash(location.hash);
  if (!code) return false;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  try {
    const track = decodeTrack(code);
    screens.show(editor);
    editor.openTrack(track, `«${track.name}» carregat des de l'enllaç`);
    return true;
  } catch {
    return false;
  }
}

window.addEventListener('hashchange', () => openFromHash());
if (!openFromHash()) race(FIRST_CIRCUIT, 'Esc: editor');

const loop = new FixedStepLoop(
  () => screens.tick(),
  (alpha, frameDt) => screens.render(alpha, frameDt),
);
loop.start();

// Eina de depuració només en desenvolupament: permet avançar la simulació
// des de la consola del navegador (p. ex. __drift.advance(2)).
if (import.meta.env.DEV) {
  Object.assign(window, {
    __drift: {
      screens,
      advance(seconds: number): void {
        for (let t = 0; t < seconds; t += 1 / 60) {
          screens.tick();
          screens.render(1, 1 / 60);
        }
      },
    },
  });
}
