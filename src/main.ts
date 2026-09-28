// Punt d'entrada: connecta el game loop, l'entrada, la física i el render.

import './ui/styles.css';
import { InputManager } from './core/input';
import { DT, FixedStepLoop } from './core/loop';
import { Vec3 } from './core/math';
import { DEFAULT_CAR } from './data/cars';
import { RIDE_HEIGHT, Vehicle } from './physics/vehicle';
import { ChaseCamera } from './render/camera';
import { CarView } from './render/carMesh';
import { SceneRenderer } from './render/scene';

const appEl = document.getElementById('app');
const uiEl = document.getElementById('ui');
if (!appEl || !uiEl) throw new Error('Falten els contenidors #app o #ui');

const view = new SceneRenderer(appEl);
const input = new InputManager();
const vehicle = new Vehicle(DEFAULT_CAR);
vehicle.reset(new Vec3(0, RIDE_HEIGHT, 0), 0);

const carView = new CarView(DEFAULT_CAR);
view.scene.add(carView.root);
const chase = new ChaseCamera(view.camera);

const hint = document.createElement('div');
hint.className = 'hint';
hint.textContent = 'WASD / fletxes per conduir';
const speedEl = document.createElement('div');
speedEl.className = 'speed';
uiEl.append(hint, speedEl);

const loop = new FixedStepLoop(
  () => vehicle.step(input.readDrive(), DT),
  (alpha, frameDt) => {
    carView.update(vehicle, alpha, frameDt);
    chase.update(carView.root);
    view.followTarget(carView.root.position);
    view.render();
    speedEl.innerHTML = `${Math.round(Math.abs(vehicle.forwardSpeed) * 3.6)}<small>km/h</small>`;
  },
);
loop.start();
