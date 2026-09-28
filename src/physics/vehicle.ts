// Física arcade del cotxe (versió bàsica sobre un pla).
// Convencions: Y amunt, el davant del cotxe és +Z local i la dreta és
// cross(davant, amunt). Un gir a la dreta és una rotació negativa sobre Y.

import type { DriveInput } from '../core/input';
import { Quat, UP, Vec3, approach, clamp, damp } from '../core/math';
import type { CarStats } from '../data/cars';

/** Alçada del centre del cotxe sobre el terra. */
export const RIDE_HEIGHT = 0.75;
export const WHEEL_RADIUS = 0.38;
/** Centre de cada roda en coordenades locals: davant esq., davant dreta, darrere esq., darrere dreta. */
export const WHEEL_POSITIONS: readonly (readonly [number, number, number])[] = [
  [0.95, WHEEL_RADIUS - RIDE_HEIGHT, 1.3],
  [-0.95, WHEEL_RADIUS - RIDE_HEIGHT, 1.3],
  [0.95, WHEEL_RADIUS - RIDE_HEIGHT, -1.3],
  [-0.95, WHEEL_RADIUS - RIDE_HEIGHT, -1.3],
];

const BRAKE_DECEL = 38;
const REVERSE_ACCEL = 14;
const REVERSE_MAX_SPEED = 14;
const ROLLING_DECEL = 2;
const AIR_DRAG = 0.0006;
const STEER_SPEED = 5;
const STEER_RETURN_SPEED = 8;
const MIN_TURN_RADIUS = 5.5;
const MAX_YAW_RATE = 2.3;
const YAW_RESPONSE = 12;
const LATERAL_GRIP_RATE = 14;

export class Vehicle {
  readonly pos = new Vec3(0, RIDE_HEIGHT, 0);
  readonly vel = new Vec3();
  readonly rot = new Quat();
  /** Estat del tick anterior, per interpolar el render. */
  readonly prevPos = new Vec3(0, RIDE_HEIGHT, 0);
  readonly prevRot = new Quat();

  yawRate = 0;
  /** Direcció suavitzada (-1..1). */
  steer = 0;

  private readonly fwd = new Vec3();
  private readonly right = new Vec3();
  private readonly tmpQ = new Quat();

  constructor(readonly stats: CarStats) {}

  reset(position: Vec3, heading: number): void {
    this.pos.copy(position);
    this.vel.set(0, 0, 0);
    this.rot.setFromAxisAngle(UP, heading);
    this.yawRate = 0;
    this.steer = 0;
    this.prevPos.copy(this.pos);
    this.prevRot.copy(this.rot);
  }

  /** Velocitat en la direcció del davant (m/s, negativa enrere). */
  get forwardSpeed(): number {
    return this.vel.dot(this.forward(this.fwd));
  }

  forward(out: Vec3): Vec3 {
    return out.set(0, 0, 1).applyQuat(this.rot);
  }

  step(input: DriveInput, dt: number): void {
    this.prevPos.copy(this.pos);
    this.prevRot.copy(this.rot);

    const fwd = this.forward(this.fwd);
    const right = this.right.crossVectors(fwd, UP).normalize();
    let vF = this.vel.dot(fwd);
    let vR = this.vel.dot(right);

    // Direcció suavitzada: canvia ràpid però no instantàniament.
    const steerRate =
      Math.abs(input.steer) > Math.abs(this.steer) ? STEER_SPEED : STEER_RETURN_SPEED;
    this.steer = approach(this.steer, input.steer, steerRate * dt);

    // --- Longitudinal ---
    const { maxSpeed, accel, grip } = this.stats;
    let a = 0;
    if (input.throttle > 0) {
      if (vF >= -0.5) {
        const ratio = clamp(vF / maxSpeed, 0, 1);
        a += accel * input.throttle * (1 - ratio * ratio);
      } else {
        a += BRAKE_DECEL * input.throttle;
      }
    }
    if (input.brake > 0) {
      if (vF > 0.5) {
        a -= BRAKE_DECEL * input.brake;
      } else if (vF > -REVERSE_MAX_SPEED) {
        a -= REVERSE_ACCEL * input.brake;
      }
    }
    // Resistència a rodolar i aerodinàmica. No pot invertir el sentit.
    const resist = ROLLING_DECEL + AIR_DRAG * vF * vF;
    if (vF > 0) vF = Math.max(0, vF - resist * dt);
    else if (vF < 0) vF = Math.min(0, vF + resist * dt);
    vF += a * dt;

    // --- Lateral: l'adherència elimina el lliscament fins a un límit ---
    const maxLat = grip * dt;
    vR -= clamp(vR * damp(LATERAL_GRIP_RATE, dt), -maxLat, maxLat);

    // --- Gir ---
    const speed = Math.abs(vF);
    const turnRate = Math.min(
      speed / MIN_TURN_RADIUS,
      MAX_YAW_RATE,
      (grip * 1.1) / Math.max(speed, 1),
    );
    const target = -this.steer * turnRate * Math.sign(vF);
    this.yawRate += (target - this.yawRate) * damp(YAW_RESPONSE, dt);

    this.vel.set(0, 0, 0).addScaled(fwd, vF).addScaled(right, vR);
    this.pos.addScaled(this.vel, dt);
    this.tmpQ.setFromAxisAngle(UP, this.yawRate * dt);
    this.rot.premultiply(this.tmpQ).normalize();
  }
}
