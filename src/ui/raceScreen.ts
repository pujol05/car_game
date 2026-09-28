// Pantalla de cursa: circuit, decoració, cotxe del jugador, fantasma,
// efectes, càmera i HUD.

import type { InputManager } from '../core/input';
import { seedFrom } from '../core/random';
import type { Screen } from '../core/screen';
import { TIMES_OF_DAY, getSettings, updateSettings } from '../core/settings';
import { type CarStats, carById } from '../data/cars';
import { trackKey } from '../race/records';
import { RaceSession } from '../race/session';
import { ChaseCamera } from '../render/camera';
import { CarEffects } from '../render/carEffects';
import { CarView } from '../render/carMesh';
import { Decoration } from '../render/decoration';
import type { SceneRenderer } from '../render/scene';
import { SkidMarks } from '../render/skidMarks';
import { SpeedLines } from '../render/speedLines';
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

const TIME_LABELS = { day: 'Dia', sunset: 'Posta de sol', night: 'Nit' } as const;

export class RaceScreen implements Screen {
  readonly track: BuiltTrack;
  session!: RaceSession;
  private readonly trackView: TrackView;
  private readonly decoration: Decoration;
  private readonly carView: CarView;
  private ghostView: CarView | null = null;
  private readonly effects = new CarEffects();
  private readonly skidMarks = new SkidMarks();
  private readonly speedLines = new SpeedLines();
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
    this.decoration = new Decoration(this.track, seedFrom(trackKey(options.track)));
    this.carView = new CarView(options.car, { headlights: true });
    this.chase = new ChaseCamera(view.camera);
    const hints = ['N: hora del dia', 'V: línies de velocitat'];
    if (options.onBack) hints.push(options.backLabel ?? 'Esc: tornar');
    this.hud = new Hud(hints.join(' · '));
  }

  enter(): void {
    this.input.clearPressed();
    this.view.scene.add(
      this.trackView.root,
      this.decoration.root,
      this.carView.root,
      this.effects.root,
      this.skidMarks.mesh,
    );
    this.ui.append(this.speedLines.canvas, this.hud.root);
    this.applySettings();
    this.restart();
  }

  exit(): void {
    this.trackView.dispose();
    this.decoration.dispose();
    this.carView.dispose();
    this.ghostView?.dispose();
    this.effects.dispose();
    this.skidMarks.dispose();
    this.speedLines.canvas.remove();
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
    this.effects.clear();
    this.skidMarks.clear();
    this.speedLines.clear();
    this.chase.snap();
  }

  private applySettings(): void {
    const s = getSettings();
    this.view.setTimeOfDay(s.timeOfDay);
    this.decoration.setNight(this.view.isNight);
    this.carView.setNight(this.view.isNight);
    this.speedLines.enabled = s.speedLines;
  }

  tick(): void {
    const { input } = this;
    if (this.options.onBack && input.consumePressed('Escape')) {
      this.options.onBack();
      return;
    }
    if (input.consumePressed('KeyN')) {
      const current = TIMES_OF_DAY.indexOf(getSettings().timeOfDay);
      const next = TIMES_OF_DAY[(current + 1) % TIMES_OF_DAY.length];
      updateSettings({ timeOfDay: next });
      this.applySettings();
      this.hud.flash(TIME_LABELS[next]);
    }
    if (input.consumePressed('KeyV')) {
      updateSettings({ speedLines: !getSettings().speedLines });
      this.applySettings();
      this.hud.flash(
        getSettings().speedLines ? 'Línies de velocitat: sí' : 'Línies de velocitat: no',
      );
    }
    if (input.consumePressed('Enter')) this.restart();
    const events = this.session.tick(input.readDrive(), input.consumeRespawn());
    if (events.some((e) => e.type === 'respawn')) this.chase.snap();
    this.hud.onEvents(events, this.session);
  }

  render(alpha: number, frameDt: number): void {
    const { session } = this;
    const vehicle = session.vehicle;
    this.carView.update(vehicle, alpha, frameDt);
    if (this.ghostView && session.ghostVehicle) {
      this.ghostView.update(session.ghostVehicle, alpha, frameDt);
    }
    this.chase.update(this.carView.root, vehicle, frameDt);
    this.effects.update(vehicle, frameDt, this.view.camera, this.view.renderer.domElement.height);
    this.skidMarks.update(vehicle);
    this.speedLines.update(vehicle.turboActive, vehicle.speed / 60, frameDt);
    this.view.followTarget(this.carView.root.position);
    this.view.render();
    this.hud.update(session, vehicle, frameDt);
  }
}
