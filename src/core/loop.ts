// Game loop amb timestep fix per a la simulació i render desacoblat.
// La física sempre avança en passos de 1/60 s; el render rep un factor
// d'interpolació (alpha) entre l'estat anterior i l'actual.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
/** Límit de temps acumulat per frame per evitar l'"espiral de la mort". */
export const MAX_FRAME_TIME = 0.25;

export class FixedStepLoop {
  private accumulator = 0;
  private lastTime = -1;
  private rafId = 0;
  private running = false;

  constructor(
    private readonly tick: () => void,
    private readonly render: (alpha: number, frameDt: number) => void,
  ) {}

  /** Factor d'interpolació entre el tick anterior (0) i l'actual (1). */
  get alpha(): number {
    return this.accumulator / DT;
  }

  /**
   * Avança el temps real `elapsed` (segons) i executa els ticks necessaris.
   * Retorna quants ticks s'han executat. Separat de requestAnimationFrame
   * per poder-ho testejar.
   */
  advance(elapsed: number): number {
    this.accumulator += Math.min(Math.max(elapsed, 0), MAX_FRAME_TIME);
    let ticks = 0;
    // Petita tolerància per errors d'arrodoniment en sumar fraccions.
    while (this.accumulator >= DT - 1e-9) {
      this.tick();
      this.accumulator = Math.max(0, this.accumulator - DT);
      ticks++;
    }
    return ticks;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = -1;
    const frame = (now: number): void => {
      if (!this.running) return;
      const elapsed = this.lastTime < 0 ? 0 : (now - this.lastTime) / 1000;
      this.lastTime = now;
      this.advance(elapsed);
      this.render(this.alpha, elapsed);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Descarta el temps acumulat (p. ex. després d'una pausa o reinici). */
  resetAccumulator(): void {
    this.accumulator = 0;
  }
}
