// Punt d'entrada: connecta el game loop, l'entrada, la física, la cursa i el render.

import './ui/styles.css';
import { InputManager } from './core/input';
import { FixedStepLoop } from './core/loop';
import { DEFAULT_CAR, carById } from './data/cars';
import { FIRST_CIRCUIT } from './data/tracks';
import { RaceSession } from './race/session';
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

const carView = new CarView(DEFAULT_CAR);
view.scene.add(carView.root);
const chase = new ChaseCamera(view.camera);
const hud = new Hud(uiEl);

let session: RaceSession;
let ghostView: CarView | null = null;

/** Comença (o reinicia) una cursa, carregant el fantasma del millor temps. */
function startSession(): void {
  session = new RaceSession(track, DEFAULT_CAR, { ghostEnabled: true, carById });
  ghostView?.dispose();
  ghostView = null;
  if (session.ghostVehicle) {
    ghostView = new CarView(session.ghostVehicle.stats, { ghost: true });
    view.scene.add(ghostView.root);
  }
  chase.snap();
}
startSession();

function tick(): void {
  if (input.consumePressed('Enter')) startSession();
  const events = session.tick(input.readDrive(), input.consumeRespawn());
  if (events.some((e) => e.type === 'respawn')) chase.snap();
  hud.onEvents(events, session);
}

function render(alpha: number, frameDt: number): void {
  carView.update(session.vehicle, alpha, frameDt);
  if (ghostView && session.ghostVehicle) ghostView.update(session.ghostVehicle, alpha, frameDt);
  chase.update(carView.root, session.vehicle, frameDt);
  view.followTarget(carView.root.position);
  view.render();
  hud.update(session, session.vehicle, frameDt);
}

const loop = new FixedStepLoop(tick, render);
loop.start();

// Eina de depuració només en desenvolupament: permet avançar la simulació
// des de la consola del navegador (p. ex. __drift.advance(2)).
if (import.meta.env.DEV) {
  Object.assign(window, {
    __drift: {
      get session(): RaceSession {
        return session;
      },
      advance(seconds: number): void {
        for (let t = 0; t < seconds; t += 1 / 60) {
          tick();
          render(1, 1 / 60);
        }
      },
    },
  });
}
