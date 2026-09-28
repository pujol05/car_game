// Punt d'entrada: connecta el game loop, l'entrada, la física, la cursa i el render.

import './ui/styles.css';
import { InputManager } from './core/input';
import { FixedStepLoop } from './core/loop';
import { DEFAULT_CAR } from './data/cars';
import { FIRST_CIRCUIT } from './data/tracks';
import { Vehicle } from './physics/vehicle';
import { RaceTracker } from './race/race';
import { ChaseCamera } from './render/camera';
import { CarView } from './render/carMesh';
import { SceneRenderer } from './render/scene';
import { TrackView } from './render/trackView';
import { buildTrack } from './track/builder';
import { Hud } from './ui/hud';

const appEl = document.getElementById('app');
const uiEl = document.getElementById('ui');
if (!appEl || !uiEl) throw new Error('Falten els contenidors #app o #ui');

const view = new SceneRenderer(appEl);
const input = new InputManager();

const track = buildTrack(FIRST_CIRCUIT);
view.scene.add(new TrackView(track).root);

const vehicle = new Vehicle(DEFAULT_CAR, track.world);
let race = new RaceTracker(track, vehicle);

const carView = new CarView(DEFAULT_CAR);
view.scene.add(carView.root);
const chase = new ChaseCamera(view.camera);
const hud = new Hud(uiEl);

function tick(): void {
  if (input.consumePressed('Enter')) {
    race = new RaceTracker(track, vehicle);
    chase.snap();
  }
  const respawn = input.consumeRespawn();
  const events = race.update(input.readDrive(), respawn && race.phase === 'running');
  if (events.some((e) => e.type === 'respawn')) chase.snap();
  hud.onEvents(events, race);
}

function render(alpha: number, frameDt: number): void {
  carView.update(vehicle, alpha, frameDt);
  chase.update(carView.root, vehicle, frameDt);
  view.followTarget(carView.root.position);
  view.render();
  hud.update(race, vehicle, frameDt);
}

const loop = new FixedStepLoop(tick, render);
loop.start();

// Eina de depuració només en desenvolupament: permet avançar la simulació
// des de la consola del navegador (p. ex. __drift.advance(2)).
if (import.meta.env.DEV) {
  Object.assign(window, {
    __drift: {
      advance(seconds: number): void {
        for (let t = 0; t < seconds; t += 1 / 60) {
          tick();
          render(1, 1 / 60);
        }
      },
    },
  });
}
