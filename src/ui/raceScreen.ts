// Pantalla de cursa: circuit, decoració, cotxe del jugador, fantasma,
// efectes, so, càmera, HUD, pausa i resultats.

import type { AudioEngine, CarSound } from '../audio/audio';
import type { InputManager } from '../core/input';
import { seedFrom } from '../core/random';
import type { Screen } from '../core/screen';
import { getSettings, onSettingsChange } from '../core/settings';
import { type CarStats, carById } from '../data/cars';
import { formatTime } from '../race/format';
import { MEDAL_LABELS, medalFor, nextMedal } from '../race/medals';
import { COUNTDOWN_TICKS, type RaceEvent } from '../race/race';
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
import { medalBadge } from './medalBadge';
import { type OverlayAction, PauseMenu, ResultsPanel } from './raceOverlays';

export interface RaceScreenOptions {
  track: TrackData;
  car: CarStats;
  /** Prova d'un circuit des de l'editor. */
  testMode?: boolean;
  /** Surt de la cursa (al menú o a l'editor). */
  onQuit: () => void;
  /** Torna a la selecció de circuit (només fora del mode de prova). */
  onChangeTrack?: () => void;
}

const RESULTS_DELAY_TICKS = 70;
const IMPACT_SOUND_THRESHOLD = 5;

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
  private readonly pause = new PauseMenu();
  private readonly results = new ResultsPanel();
  private carSound: CarSound | null = null;
  private paused = false;
  private finishedTicks = -1;
  private lastCountdown = 0;
  private impactCooldown = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly view: SceneRenderer,
    private readonly input: InputManager,
    private readonly ui: HTMLElement,
    private readonly audio: AudioEngine,
    private readonly options: RaceScreenOptions,
  ) {
    this.track = buildTrack(options.track);
    this.trackView = new TrackView(this.track);
    this.decoration = new Decoration(this.track, seedFrom(trackKey(options.track)));
    this.carView = new CarView(options.car, { headlights: true });
    this.chase = new ChaseCamera(view.camera);
    this.hud = new Hud(
      'WASD/fletxes: conduir · Espai: derrapar · Shift: turbo · R: reaparèixer · Enter: reiniciar · Esc: pausa',
    );
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
    this.ui.append(this.speedLines.canvas, this.hud.root, this.pause.root, this.results.root);
    this.carSound = this.audio.createCarSound();
    this.unsubscribe = onSettingsChange(() => this.applySettings());
    this.applySettings();
    this.restart();
  }

  exit(): void {
    this.unsubscribe?.();
    this.carSound?.dispose();
    this.carSound = null;
    this.trackView.dispose();
    this.decoration.dispose();
    this.carView.dispose();
    this.ghostView?.dispose();
    this.effects.dispose();
    this.skidMarks.dispose();
    for (const e of [this.speedLines.canvas, this.hud.root, this.pause.root, this.results.root]) {
      e.remove();
    }
  }

  /** Comença (o reinicia) la cursa, carregant el fantasma del millor temps. */
  restart(): void {
    this.session = new RaceSession(this.track, this.options.car, {
      ghostEnabled: getSettings().ghost,
      carById,
    });
    this.ghostView?.dispose();
    this.ghostView = null;
    if (this.session.ghostVehicle) {
      this.ghostView = new CarView(this.session.ghostVehicle.stats, { ghost: true });
      this.view.scene.add(this.ghostView.root);
    }
    this.paused = false;
    this.finishedTicks = -1;
    this.lastCountdown = 0;
    this.pause.hide();
    this.results.hide();
    this.carSound?.setMuted(false);
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
    this.effects.root.visible = s.particles;
    this.skidMarks.mesh.visible = s.particles;
  }

  // --- Pausa i resultats ---

  private quitAction(): OverlayAction {
    return this.options.testMode
      ? { label: "Tornar a l'editor", onClick: () => this.options.onQuit() }
      : { label: 'Menú principal', onClick: () => this.options.onQuit() };
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.carSound?.setMuted(paused);
    if (!paused) {
      this.pause.hide();
      return;
    }
    const actions: OverlayAction[] = [
      { label: 'Continuar', onClick: () => this.setPaused(false), primary: true, key: 'Esc' },
      { label: 'Reiniciar', onClick: () => this.restart(), key: 'Enter' },
      { label: 'Opcions', onClick: () => this.pause.showOptions(() => this.setPaused(true)) },
    ];
    if (this.options.onChangeTrack) {
      const onChange = this.options.onChangeTrack;
      actions.push({ label: 'Canviar de circuit', onClick: () => onChange() });
    }
    actions.push(this.quitAction());
    this.pause.show(actions);
  }

  private showResults(): void {
    const { session } = this;
    const result = session.result;
    if (!result) return;
    const actions: OverlayAction[] = [
      { label: 'Tornar a córrer', onClick: () => this.restart(), primary: true, key: 'Enter' },
    ];
    if (this.options.onChangeTrack) {
      const onChange = this.options.onChangeTrack;
      actions.push({ label: 'Canviar de circuit', onClick: () => onChange() });
    }
    actions.push({ ...this.quitAction(), key: 'Esc' });
    const medals = this.options.track.medals;
    const medal = medals ? medalFor(result.time, medals) : null;
    const best = session.best ? Math.min(session.best.time, result.time) : result.time;
    const next = medals ? nextMedal(best, medals) : null;
    this.results.show(
      {
        title: result.improved ? 'Nou rècord!' : 'Meta!',
        time: result.time,
        improved: result.improved,
        delta: result.previous ? result.time - result.previous.time : null,
        lapTimes: session.race.lapTimes,
        medal: medal ? medalBadge(medal, 'big') : undefined,
        nextTarget:
          medals && next
            ? `Següent: ${MEDAL_LABELS[next]} en ${formatTime(medals[next])}`
            : undefined,
      },
      actions,
    );
  }

  // --- Bucle ---

  tick(): void {
    const { input } = this;
    if (this.results.visible) {
      if (input.consumePressed('Enter')) this.restart();
      else if (input.consumePressed('Escape')) this.options.onQuit();
      else this.session.tick(input.readDrive(), false);
      return;
    }
    if (this.paused) {
      if (input.consumePressed('Escape')) this.setPaused(false);
      else if (input.consumePressed('Enter')) this.restart();
      return;
    }
    if (input.consumePressed('Escape')) {
      this.setPaused(true);
      return;
    }
    if (input.consumePressed('Enter')) {
      this.restart();
      this.hud.showHint();
    }

    const events = this.session.tick(input.readDrive(), input.consumeRespawn());
    this.playSounds(events);
    if (events.some((e) => e.type === 'respawn')) this.chase.snap();
    this.hud.onEvents(events, this.session);

    if (this.session.race.phase === 'finished') {
      this.finishedTicks++;
      if (this.finishedTicks === RESULTS_DELAY_TICKS) this.showResults();
    }
  }

  private playSounds(events: readonly RaceEvent[]): void {
    const { race } = this.session;
    if (race.phase === 'countdown') {
      const second = Math.ceil(race.countdown / (COUNTDOWN_TICKS / 3));
      if (second !== this.lastCountdown) {
        this.lastCountdown = second;
        this.audio.countdown(false);
      }
    }
    for (const e of events) {
      switch (e.type) {
        case 'go':
          this.audio.countdown(true);
          break;
        case 'checkpoint': {
          const delta = this.session.splitDelta(e.split, e.time);
          this.audio.checkpoint(delta === null ? null : delta <= 0);
          break;
        }
        case 'lap':
          this.audio.lap();
          break;
        case 'finish':
          this.audio.finish(this.session.result?.improved ?? false);
          break;
        case 'boost':
          this.audio.boost();
          break;
        case 'respawn':
          this.audio.respawn();
          break;
        default:
          break;
      }
    }
    const impact = this.session.vehicle.impact;
    this.impactCooldown = Math.max(0, this.impactCooldown - 1);
    if (impact > IMPACT_SOUND_THRESHOLD && this.impactCooldown === 0) {
      this.audio.impact(impact);
      this.impactCooldown = 12;
    }
  }

  render(alpha: number, frameDt: number): void {
    const { session } = this;
    const vehicle = session.vehicle;
    this.carView.update(vehicle, alpha, frameDt);
    if (this.ghostView && session.ghostVehicle) {
      this.ghostView.update(session.ghostVehicle, alpha, frameDt);
    }
    this.chase.update(this.carView.root, vehicle, frameDt);
    if (!this.paused) {
      this.effects.update(vehicle, frameDt, this.view.camera, this.view.renderer.domElement.height);
      this.skidMarks.update(vehicle);
    }
    this.speedLines.update(vehicle.turboActive && !this.paused, vehicle.speed / 60, frameDt);
    this.carSound?.update(
      {
        speed: Math.abs(vehicle.forwardSpeed),
        maxSpeed: vehicle.stats.maxSpeed,
        throttle: session.race.phase === 'finished' ? 0 : this.input.readDrive().throttle,
        slip: vehicle.drifting ? 0.8 : Math.max(0, Math.abs(vehicle.slipAngle) - 0.15) * 2,
        grounded: vehicle.grounded,
        turbo: vehicle.turboActive,
        scraping: vehicle.scraping,
      },
      frameDt,
    );
    this.view.followTarget(this.carView.root.position);
    this.view.render();
    this.hud.update(session, vehicle, frameDt);
  }
}
