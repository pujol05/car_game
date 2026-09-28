// Pantalla de cursa: circuit, cotxe del jugador, fantasma, càmera i HUD.

import type { InputManager } from '../core/input';
import type { Screen } from '../core/screen';
import { type CarStats, carById } from '../data/cars';
import { RaceSession } from '../race/session';
import { ChaseCamera } from '../render/camera';
import { CarView } from '../render/carMesh';
import type { SceneRenderer } from '../render/scene';
import { TrackView } from '../render/trackView';
import { type BuiltTrack, buildTrack } from '../track/builder';
import type { TrackData } from '../track/types';
import { Hud } from './hud';

export interface RaceScreenOptions {
  track: TrackData;
  car: CarStats;
  /** Si hi és, Esc torna enrere (p. ex. a l'editor quan es prova un circuit). */
  onBack?: () => void;
  backLabel?: string;
}

export class RaceScreen implements Screen {
  readonly track: BuiltTrack;
  session!: RaceSession;
  private readonly trackView: TrackView;
  private readonly carView: CarView;
  private ghostView: CarView | null = null;
  private readonly chase: ChaseCamera;
  private readonly hud: Hud;

  constructor(
    private readonly view: SceneRenderer,
    private readonly input: InputManager,
    private readonly ui: HTMLElement,
    private readonly options: RaceScreenOptions,
  ) {
    this.track = buildTrack(options.track);
    this.trackView = new TrackView(this.track);
    this.carView = new CarView(options.car);
    this.chase = new ChaseCamera(view.camera);
    this.hud = new Hud(options.onBack ? (options.backLabel ?? 'Esc: tornar') : undefined);
  }

  enter(): void {
    this.input.clearPressed();
    this.view.scene.add(this.trackView.root, this.carView.root);
    this.ui.append(this.hud.root);
    this.restart();
  }

  exit(): void {
    this.trackView.dispose();
    this.carView.dispose();
    this.ghostView?.dispose();
    this.hud.root.remove();
  }

  /** Comença (o reinicia) la cursa, carregant el fantasma del millor temps. */
  restart(): void {
    this.session = new RaceSession(this.track, this.options.car, { ghostEnabled: true, carById });
    this.ghostView?.dispose();
    this.ghostView = null;
    if (this.session.ghostVehicle) {
      this.ghostView = new CarView(this.session.ghostVehicle.stats, { ghost: true });
      this.view.scene.add(this.ghostView.root);
    }
    this.chase.snap();
  }

  tick(): void {
    const { input } = this;
    if (this.options.onBack && input.consumePressed('Escape')) {
      this.options.onBack();
      return;
    }
    if (input.consumePressed('Enter')) this.restart();
    const events = this.session.tick(input.readDrive(), input.consumeRespawn());
    if (events.some((e) => e.type === 'respawn')) this.chase.snap();
    this.hud.onEvents(events, this.session);
  }

  render(alpha: number, frameDt: number): void {
    const { session } = this;
    this.carView.update(session.vehicle, alpha, frameDt);
    if (this.ghostView && session.ghostVehicle) {
      this.ghostView.update(session.ghostVehicle, alpha, frameDt);
    }
    this.chase.update(this.carView.root, session.vehicle, frameDt);
    this.view.followTarget(this.carView.root.position);
    this.view.render();
    this.hud.update(session, session.vehicle, frameDt);
  }
}
