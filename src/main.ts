// Punt d'entrada: connecta el game loop, l'entrada, la física i el render.

import './ui/styles.css';
import { InputManager } from './core/input';
import { DT, FixedStepLoop } from './core/loop';
import { Vec3 } from './core/math';
import { DEFAULT_CAR } from './data/cars';
import { buildPlayground } from './data/playground';
import { CollisionWorld, Surface } from './physics/collision';
import { RIDE_HEIGHT, Vehicle } from './physics/vehicle';
import { ChaseCamera } from './render/camera';
import { CarView } from './render/carMesh';
import { meshFromPlain } from './render/plainMesh';
import { SceneRenderer } from './render/scene';

const appEl = document.getElementById('app');
const uiEl = document.getElementById('ui');
if (!appEl || !uiEl) throw new Error('Falten els contenidors #app o #ui');

const view = new SceneRenderer(appEl);
const input = new InputManager();

const world = new CollisionWorld();
world.groundY = 0;
world.groundMaterial = Surface.Road;
view.scene.add(meshFromPlain(buildPlayground(world)));
world.build();

const spawn = new Vec3(0, RIDE_HEIGHT + 0.2, 0);
const vehicle = new Vehicle(DEFAULT_CAR, world);
vehicle.reset(spawn, 0);

const carView = new CarView(DEFAULT_CAR);
view.scene.add(carView.root);
const chase = new ChaseCamera(view.camera);

const hint = document.createElement('div');
hint.className = 'hint';
hint.textContent = 'WASD / fletxes: conduir · Espai: derrapar · Shift: turbo · R: reaparèixer';
const speedEl = document.createElement('div');
speedEl.className = 'speed';
const turboEl = document.createElement('div');
turboEl.className = 'turbo-bar';
const turboFill = document.createElement('div');
turboEl.append(turboFill);
uiEl.append(hint, speedEl, turboEl);

const loop = new FixedStepLoop(
  () => {
    if (input.consumeRespawn()) {
      vehicle.reset(spawn, 0);
      chase.snap();
    }
    vehicle.step(input.readDrive(), DT);
  },
  (alpha, frameDt) => {
    carView.update(vehicle, alpha, frameDt);
    chase.update(carView.root, vehicle, frameDt);
    view.followTarget(carView.root.position);
    view.render();
    speedEl.innerHTML = `${Math.round(Math.abs(vehicle.forwardSpeed) * 3.6)}<small>km/h</small>`;
    turboFill.style.width = `${Math.round(vehicle.turbo * 100)}%`;
    turboEl.classList.toggle('active', vehicle.turboActive);
  },
);
loop.start();
