// Entrada de teclat i comandament. Es llegeix un cop per tick de física.

export interface DriveInput {
  /** Accelerador, de 0 a 1. */
  throttle: number;
  /** Fre / marxa enrere, de 0 a 1. */
  brake: number;
  /** Direcció: -1 esquerra, +1 dreta. */
  steer: number;
  /** Fre de mà / derrapada. */
  handbrake: boolean;
  /** Turbo. */
  boost: boolean;
}

export function neutralInput(): DriveInput {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
}

const PREVENT_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

const STICK_DEADZONE = 0.15;

// Botons del comandament (mapatge estàndard).
const PAD_A = 0;
const PAD_X = 2;
const PAD_Y = 3;
const PAD_LB = 4;
const PAD_RB = 5;
const PAD_LT = 6;
const PAD_RT = 7;

function applyDeadzone(v: number): number {
  const a = Math.abs(v);
  if (a < STICK_DEADZONE) return 0;
  return (Math.sign(v) * (a - STICK_DEADZONE)) / (1 - STICK_DEADZONE);
}

export class InputManager {
  private readonly keys = new Set<string>();
  /** Tecles premudes des de l'últim `consumePressed`. */
  private readonly pressed = new Set<string>();
  private readonly padWasDown = new Set<number>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
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

  /** Retorna cert un sol cop per cada pulsació de la tecla. */
  consumePressed(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  private anyDown(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  private gamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    for (const pad of navigator.getGamepads()) {
      if (pad && pad.connected) return pad;
    }
    return null;
  }

  private padButton(pad: Gamepad | null, index: number): number {
    return pad?.buttons[index]?.value ?? 0;
  }

  /** Flanc de pujada d'un botó del comandament. */
  private padPressed(pad: Gamepad | null, index: number): boolean {
    const down = this.padButton(pad, index) > 0.5;
    const was = this.padWasDown.has(index);
    if (down) this.padWasDown.add(index);
    else this.padWasDown.delete(index);
    return down && !was;
  }

  readDrive(): DriveInput {
    let throttle = this.anyDown('KeyW', 'ArrowUp') ? 1 : 0;
    let brake = this.anyDown('KeyS', 'ArrowDown') ? 1 : 0;
    let steer =
      (this.anyDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.anyDown('KeyA', 'ArrowLeft') ? 1 : 0);
    let handbrake = this.isDown('Space');
    let boost = this.anyDown('ShiftLeft', 'ShiftRight');

    const pad = this.gamepad();
    if (pad) {
      const stick = applyDeadzone(pad.axes[0] ?? 0);
      if (Math.abs(stick) > Math.abs(steer)) steer = stick;
      throttle = Math.max(throttle, this.padButton(pad, PAD_RT));
      brake = Math.max(brake, this.padButton(pad, PAD_LT));
      handbrake ||= this.padButton(pad, PAD_A) > 0.5 || this.padButton(pad, PAD_RB) > 0.5;
      boost ||= this.padButton(pad, PAD_X) > 0.5 || this.padButton(pad, PAD_LB) > 0.5;
    }

    return {
      throttle: Math.min(1, Math.max(0, throttle)),
      brake: Math.min(1, Math.max(0, brake)),
      steer: Math.min(1, Math.max(-1, steer)),
      handbrake,
      boost,
    };
  }

  /** Cert un cop quan es demana reaparèixer (R o botó Y). */
  consumeRespawn(): boolean {
    const key = this.consumePressed('KeyR');
    const pad = this.padPressed(this.gamepad(), PAD_Y);
    return key || pad;
  }
}
