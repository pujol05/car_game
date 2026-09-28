// Punt d'entrada: crea el renderer, l'entrada, l'àudio i les pantalles del
// joc, gestiona la navegació entre elles i arrenca el game loop.

import './ui/styles.css';
import { AudioEngine } from './audio/audio';
import { InputManager } from './core/input';
import { FixedStepLoop } from './core/loop';
import { ScreenManager } from './core/screen';
import { getSettings, onSettingsChange } from './core/settings';
import { CARS, type CarStats } from './data/cars';
import { EditorScreen } from './editor/editorScreen';
import { SceneRenderer } from './render/scene';
import { codeFromHash, decodeTrack } from './track/serialize';
import type { TrackData } from './track/types';
import { MenuScreen, type MenuView } from './ui/menuScreen';
import { RaceScreen } from './ui/raceScreen';

const appEl = document.getElementById('app');
const uiEl = document.getElementById('ui');
if (!appEl || !uiEl) throw new Error('Falten els contenidors #app o #ui');
const ui: HTMLElement = uiEl;

const view = new SceneRenderer(appEl);
const input = new InputManager();
const screens = new ScreenManager();
const audio = new AudioEngine();

function applyGlobalSettings(): void {
  const s = getSettings();
  audio.setVolume(s.volume);
  view.setQuality(s.quality);
}
applyGlobalSettings();
onSettingsChange(applyGlobalSettings);

// L'àudio només es pot activar després d'un gest de l'usuari.
window.addEventListener('pointerdown', () => audio.unlock());
window.addEventListener('keydown', () => audio.unlock());
// So de clic a tots els botons de la interfície.
ui.addEventListener('click', (e) => {
  if (e.target instanceof HTMLElement && e.target.closest('button')) audio.click();
});

let lastCar: CarStats = CARS[0];

const menu = new MenuScreen(view, input, ui, {
  onRace: (track, car) => startRace(track, car, false),
  onEditor: () => screens.show(editor),
});

const editor = new EditorScreen(view, input, ui, {
  onTest: (track) => startRace(track, lastCar, true),
  onExit: () => showMenu('main'),
});

function showMenu(name: MenuView): void {
  menu.setView(name);
  screens.show(menu);
}

function startRace(track: TrackData, car: CarStats, testMode: boolean): void {
  lastCar = car;
  screens.show(
    new RaceScreen(view, input, ui, audio, {
      track,
      car,
      testMode,
      onQuit: () => (testMode ? screens.show(editor) : showMenu('main')),
      onChangeTrack: testMode ? undefined : () => showMenu('select'),
    }),
  );
}

/** Si l'URL porta un circuit (#track=...), l'obre a l'editor. */
function openFromHash(): boolean {
  const code = codeFromHash(location.hash);
  if (!code) return false;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  try {
    const track = decodeTrack(code);
    screens.show(editor);
    editor.openTrack(track, `«${track.name}» carregat des de l'enllaç. Prem Provar per córrer-hi!`);
    return true;
  } catch {
    return false;
  }
}

window.addEventListener('hashchange', () => openFromHash());
if (!openFromHash()) showMenu('main');

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
