// Pantalles del joc (cursa, editor...). Només n'hi ha una d'activa.

export interface Screen {
  enter(): void;
  exit(): void;
  /** Un tick de simulació (60 per segon). */
  tick(): void;
  /** Un frame de render; alpha interpola entre ticks. */
  render(alpha: number, frameDt: number): void;
}

export class ScreenManager {
  private current: Screen | null = null;

  get active(): Screen | null {
    return this.current;
  }

  show(screen: Screen): void {
    this.current?.exit();
    this.current = screen;
    screen.enter();
  }

  tick(): void {
    this.current?.tick();
  }

  render(alpha: number, frameDt: number): void {
    this.current?.render(alpha, frameDt);
  }
}
