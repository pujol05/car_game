// Entrada de teclat i comandament. Es llegeix un cop per tick de física.

export interface DriveInput {
  /** Accelerador, de 0 a 1. */
  throttle: number;
  /** Fre / marxa enrere, de 0 a 1. */
  brake: number;
  /** Direcció: -1 esquerra, +1 dreta. */
  steer: number;
}

export function neutralInput(): DriveInput {
  return { throttle: 0, brake: 0, steer: 0 };
}

const PREVENT_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

const STICK_DEADZONE = 0.15;

function applyDeadzone(v: number): number {
  const a = Math.abs(v);
  if (a < STICK_DEADZONE) return 0;
  return (Math.sign(v) * (a - STICK_DEADZONE)) / (1 - STICK_DEADZONE);
}

export class InputManager {
  private readonly keys = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    target.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    // Si la finestra perd el focus, deixem anar totes les tecles.
    target.addEventListener('blur', () => this.keys.clear());
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  private anyDown(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  private readGamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    for (const pad of navigator.getGamepads()) {
      if (pad && pad.connected) return pad;
    }
    return null;
  }

  readDrive(): DriveInput {
    let throttle = this.anyDown('KeyW', 'ArrowUp') ? 1 : 0;
    let brake = this.anyDown('KeyS', 'ArrowDown') ? 1 : 0;
    let steer =
      (this.anyDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.anyDown('KeyA', 'ArrowLeft') ? 1 : 0);

    const pad = this.readGamepad();
    if (pad) {
      const stick = applyDeadzone(pad.axes[0] ?? 0);
      if (Math.abs(stick) > Math.abs(steer)) steer = stick;
      throttle = Math.max(throttle, pad.buttons[7]?.value ?? 0);
      brake = Math.max(brake, pad.buttons[6]?.value ?? 0);
    }

    return {
      throttle: Math.min(1, Math.max(0, throttle)),
      brake: Math.min(1, Math.max(0, brake)),
      steer: Math.min(1, Math.max(-1, steer)),
    };
  }
}
