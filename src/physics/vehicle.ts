// Física arcade del cotxe: cos rígid amb suspensió per raycasts.
//
// Convencions: Y amunt, el davant del cotxe és +Z local i la dreta és
// cross(davant, amunt) = -X local. Un gir a la dreta és una rotació negativa
// sobre l'eix vertical. La massa és unitària: forces = acceleracions.
//
// El model prioritza la diversió: la direcció controla directament la
// velocitat de gir (limitada per l'adherència), l'adherència fa girar el
// vector velocitat cap al morro sense perdre velocitat, i la derrapada redueix
// aquesta adherència i carrega el turbo.

import type { DriveInput } from '../core/input';
import { Quat, UP, Vec3, approach, clamp, damp } from '../core/math';
import type { CarStats } from '../data/cars';
import {
  type CollisionWorld,
  type Contact,
  type SurfaceId,
  Surface,
  createRayHit,
} from './collision';

// --- Geometria ---
export const WHEEL_RADIUS = 0.38;
/** Recorregut total de la suspensió. */
export const SUSPENSION_TRAVEL = 0.45;
const MOUNT_Y = -0.03;
const MOUNT_X = 0.95;
const MOUNT_Z = 1.3;
/** Punts d'ancoratge de la suspensió: davant esq., davant dreta, darrere esq., darrere dreta. */
export const WHEEL_MOUNTS: readonly (readonly [number, number, number])[] = [
  [MOUNT_X, MOUNT_Y, MOUNT_Z],
  [-MOUNT_X, MOUNT_Y, MOUNT_Z],
  [MOUNT_X, MOUNT_Y, -MOUNT_Z],
  [-MOUNT_X, MOUNT_Y, -MOUNT_Z],
];
/** Esferes de col·lisió de la carrosseria [x, y, z, radi] en coordenades locals. */
const BODY_SPHERES: readonly (readonly [number, number, number, number])[] = [
  [0.62, -0.05, 1.45, 0.45],
  [-0.62, -0.05, 1.45, 0.45],
  [0.62, -0.05, -1.45, 0.45],
  [-0.62, -0.05, -1.45, 0.45],
  [0, 0, 1.85, 0.4],
  [0, 0, -1.85, 0.4],
  [0, 0.4, -0.2, 0.5],
];
/** Alçada aproximada del centre del cotxe sobre la superfície en repòs. */
export const RIDE_HEIGHT = 0.75;

// --- Constants físiques ---
export const GRAVITY = 18;
const SUBSTEPS = 4;
const SPRING = 40;
const DAMPER = 4;
const BUMP_START = 0.32;
const BUMP_SPRING = 1500;
const DOWNFORCE = 0.22;
const INERTIA = new Vec3(1.6, 1.8, 0.9); // capcineig (X), guinyada (Y), balanceig (Z)

const BRAKE_DECEL = 38;
const HANDBRAKE_DECEL = 10;
const REVERSE_ACCEL = 14;
const REVERSE_MAX_SPEED = 14;
const ROLLING_DECEL = 1.5;
const AIR_DRAG = 0.0005;
const STEER_SPEED = 5;
const STEER_RETURN_SPEED = 8;
const MIN_TURN_RADIUS = 5.5;
const MAX_YAW_RATE = 2.3;
const YAW_RESPONSE = 12;
const GRIP_RATE = 14;
const SLIDE_DRAG = 5;

const DRIFT_MIN_SPEED = 12;
const DRIFT_EXIT_SPEED = 8;
const DRIFT_YAW = 1.9;
const DRIFT_KICK = 1.1;
const DRIFT_GRIP_RATE = 2.5;
const DRIFT_GRIP_MULT = 1.25;
const DRIFT_MAX_ANGLE = 0.55;
const DRIFT_DRAG = 2;
const DRIFT_CHARGE_RATE = 0.3;

const TURBO_DRAIN_RATE = 0.45;
const TURBO_ACCEL = 20;
const TURBO_SPEED_MULT = 1.3;
/** Durada i empenta inicial dels pads de turbo del circuit. */
const PAD_BOOST_TIME = 1;
const PAD_BOOST_KICK = 5;

const ALIGN_STIFFNESS = 30;
const ALIGN_DAMPING = 6;
const AIR_CONTROL_DELAY = 0.12;
const AIR_PITCH_OFFSET = 0.35;
const AIR_LEVEL_STIFFNESS = 12;
const AIR_LEVEL_DAMPING = 4.5;
const AIR_YAW_RATE = 2;
const AIR_YAW_RESPONSE = 3;
const MAX_ANGULAR_SPEED = 9;

const WALL_RESTITUTION = 0.15;
const WALL_FRICTION = 0.15;
const ANGULAR_IMPULSE_SCALE = 0.5;

/** Estat mínim per restaurar el cotxe (p. ex. en reaparèixer a un checkpoint). */
export interface VehicleSnapshot {
  pos: Vec3;
  rot: Quat;
  vel: Vec3;
  turbo: number;
}

export interface WheelState {
  grounded: boolean;
  compression: number;
  /** Distància del punt d'ancoratge al centre de la roda. */
  suspensionLength: number;
  readonly contactPoint: Vec3;
  readonly normal: Vec3;
  material: SurfaceId;
}

export class Vehicle {
  readonly pos = new Vec3();
  readonly vel = new Vec3();
  readonly rot = new Quat();
  /** Velocitat angular en coordenades de món (rad/s). */
  readonly angVel = new Vec3();
  /** Estat del tick anterior, per interpolar el render. */
  readonly prevPos = new Vec3();
  readonly prevRot = new Quat();

  /** Direcció suavitzada (-1..1). */
  steer = 0;
  readonly wheels: WheelState[] = WHEEL_MOUNTS.map(() => ({
    grounded: false,
    compression: 0,
    suspensionLength: SUSPENSION_TRAVEL,
    contactPoint: new Vec3(),
    normal: new Vec3(0, 1, 0),
    material: Surface.Road as SurfaceId,
  }));
  groundedWheels = 0;
  readonly groundNormal = new Vec3(0, 1, 0);
  /** Segons seguits a l'aire. */
  airTime = 0;

  drifting = false;
  /** Sentit de la derrapada: +1 dreta, -1 esquerra, 0 sense derrapar. */
  driftDir = 0;
  /** Angle entre el morro i la velocitat (rad). */
  slipAngle = 0;
  /** Càrrega del turbo (0..1). */
  turbo = 0;
  /** Cert si aquest tick s'ha fet servir el turbo (de la barra o d'un pad). */
  turboActive = false;
  /** Temps restant de turbo d'un pad del circuit (s). */
  padBoost = 0;
  /** Impuls de l'impacte més fort d'aquest tick (per a efectes i so). */
  impact = 0;
  /** Cert si la carrosseria frega una paret aquest tick. */
  scraping = false;
  readonly scrapePoint = new Vec3();

  private readonly prevCompression = [0, 0, 0, 0];
  private gripBlend = 1;

  // Temporals reutilitzats.
  private readonly fwd = new Vec3();
  private readonly up = new Vec3();
  private readonly right = new Vec3();
  private readonly fwdP = new Vec3();
  private readonly rightP = new Vec3();
  private readonly tmp = new Vec3();
  private readonly tmp2 = new Vec3();
  private readonly force = new Vec3();
  private readonly torque = new Vec3();
  private readonly mount = new Vec3();
  private readonly down = new Vec3();
  private readonly hit = createRayHit();
  private readonly contacts: Contact[] = [];

  constructor(
    readonly stats: CarStats,
    private readonly world: CollisionWorld,
  ) {}

  reset(position: Vec3, heading: number): void {
    this.pos.copy(position);
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.rot.setFromAxisAngle(UP, heading);
    this.steer = 0;
    this.drifting = false;
    this.driftDir = 0;
    this.slipAngle = 0;
    this.turbo = 0;
    this.turboActive = false;
    this.padBoost = 0;
    this.gripBlend = 1;
    this.airTime = 0;
    this.impact = 0;
    this.scraping = false;
    this.groundedWheels = 0;
    this.groundNormal.set(0, 1, 0);
    this.prevCompression.fill(0);
    for (const w of this.wheels) {
      w.grounded = false;
      w.compression = 0;
      w.suspensionLength = SUSPENSION_TRAVEL;
    }
    this.prevPos.copy(this.pos);
    this.prevRot.copy(this.rot);
  }

  snapshot(): VehicleSnapshot {
    return {
      pos: this.pos.clone(),
      rot: this.rot.clone(),
      vel: this.vel.clone(),
      turbo: this.turbo,
    };
  }

  /** Restaura una instantània: conserva la velocitat però no la rotació. */
  restore(s: VehicleSnapshot): void {
    const turbo = s.turbo;
    this.reset(s.pos, 0);
    this.rot.copy(s.rot);
    this.prevRot.copy(s.rot);
    this.vel.copy(s.vel);
    this.turbo = turbo;
  }

  /** Activa un pad de turbo del circuit. */
  triggerPadBoost(): void {
    if (this.padBoost <= 0 && this.grounded) {
      this.vel.addScaled(this.forward(this.tmp), PAD_BOOST_KICK);
    }
    this.padBoost = PAD_BOOST_TIME;
  }

  forward(out: Vec3): Vec3 {
    return out.set(0, 0, 1).applyQuat(this.rot);
  }

  upVector(out: Vec3): Vec3 {
    return out.set(0, 1, 0).applyQuat(this.rot);
  }

  /** Velocitat en la direcció del davant (m/s, negativa enrere). */
  get forwardSpeed(): number {
    return this.vel.dot(this.forward(this.tmp));
  }

  get speed(): number {
    return this.vel.length();
  }

  get grounded(): boolean {
    return this.groundedWheels > 0;
  }

  step(input: DriveInput, dt: number): void {
    this.prevPos.copy(this.pos);
    this.prevRot.copy(this.rot);
    this.impact = 0;
    this.scraping = false;
    this.turboActive = false;

    const steerRate =
      Math.abs(input.steer) > Math.abs(this.steer) ? STEER_SPEED : STEER_RETURN_SPEED;
    this.steer = approach(this.steer, input.steer, steerRate * dt);

    const h = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) this.substep(input, h);

    if (this.groundedWheels === 0) {
      this.airTime += dt;
      if (this.airTime > 0.3) this.drifting = false;
    } else {
      this.airTime = 0;
    }
    if (!this.drifting) this.driftDir = 0;
  }

  private substep(input: DriveInput, h: number): void {
    const { stats } = this;
    const fwd = this.forward(this.fwd);
    const up = this.upVector(this.up);
    const right = this.right.crossVectors(fwd, up);
    const force = this.force.set(0, -GRAVITY, 0);
    const torque = this.torque.set(0, 0, 0);

    // --- Suspensió ---
    this.updateSuspension(up, force, torque, h);
    const grounded = this.groundedWheels > 0;
    const traction = Math.min(1, this.groundedWheels / 2);
    const n = this.groundNormal;

    let onGrass = false;
    for (const w of this.wheels) if (w.grounded && w.material === Surface.Grass) onGrass = true;
    const grip = stats.grip * (onGrass ? 0.6 : 1);
    let maxSpeed = stats.maxSpeed * (onGrass ? 0.55 : 1);

    if (grounded) {
      // Força cap avall proporcional a la velocitat: enganxa el cotxe als loopings.
      force.addScaled(up, -DOWNFORCE * this.vel.length());
    }

    // --- Turbo ---
    let boosting = false;
    if (this.padBoost > 0) {
      boosting = true;
      this.padBoost = Math.max(0, this.padBoost - h);
    } else if (input.boost && this.turbo > 0) {
      boosting = true;
      this.turbo = Math.max(0, this.turbo - TURBO_DRAIN_RATE * h);
    }
    if (boosting) {
      this.turboActive = true;
      maxSpeed *= TURBO_SPEED_MULT;
    }

    // Forces lineals (gravetat, suspensió, downforce).
    this.vel.addScaled(force, h);

    if (grounded) {
      this.applyTireForces(input, n, fwd, grip, maxSpeed, traction, boosting, onGrass, h);
      // Alinea l'orientació amb la superfície (capcineig i balanceig).
      torque.addScaled(this.tmp.crossVectors(up, n), ALIGN_STIFFNESS * traction);
      const along = this.angVel.dot(n);
      const perp = this.tmp2.copy(this.angVel).addScaled(n, -along);
      torque.addScaled(perp, -ALIGN_DAMPING * traction);
    } else {
      if (boosting) this.vel.addScaled(fwd, TURBO_ACCEL * h);
      this.applyAirControl(input, fwd, up, right, torque, h);
    }

    this.applyAngularAccel(torque, h);
    const w = this.angVel.length();
    if (w > MAX_ANGULAR_SPEED) this.angVel.scale(MAX_ANGULAR_SPEED / w);

    this.pos.addScaled(this.vel, h);
    this.rot.integrate(this.angVel, h);

    this.resolveBodyCollisions();
  }

  private updateSuspension(up: Vec3, force: Vec3, torque: Vec3, h: number): void {
    const down = this.down.copy(up).scale(-1);
    const rayLength = SUSPENSION_TRAVEL + WHEEL_RADIUS;
    let count = 0;
    const nSum = this.tmp2.set(0, 0, 0);
    for (let i = 0; i < 4; i++) {
      const wheel = this.wheels[i];
      const [mx, my, mz] = WHEEL_MOUNTS[i];
      const mount = this.mount.set(mx, my, mz).applyQuat(this.rot).add(this.pos);
      if (this.world.raycast(mount, down, rayLength, this.hit)) {
        const compression = clamp(rayLength - this.hit.distance, 0, SUSPENSION_TRAVEL);
        const compressionVel = (compression - this.prevCompression[i]) / h;
        let f = SPRING * compression + DAMPER * compressionVel;
        if (compression > BUMP_START) f += BUMP_SPRING * (compression - BUMP_START);
        f = Math.max(0, f);
        wheel.grounded = true;
        wheel.compression = compression;
        wheel.suspensionLength = SUSPENSION_TRAVEL - compression;
        wheel.contactPoint.copy(this.hit.point);
        wheel.normal.copy(this.hit.normal);
        wheel.material = this.hit.material;
        this.prevCompression[i] = compression;
        // Força al llarg de l'eix de la suspensió, aplicada a l'ancoratge.
        force.addScaled(up, f);
        const r = this.tmp.subVectors(mount, this.pos);
        torque.x += (r.y * up.z - r.z * up.y) * f;
        torque.y += (r.z * up.x - r.x * up.z) * f;
        torque.z += (r.x * up.y - r.y * up.x) * f;
        nSum.add(this.hit.normal);
        count++;
      } else {
        wheel.grounded = false;
        wheel.compression = 0;
        wheel.suspensionLength = SUSPENSION_TRAVEL;
        this.prevCompression[i] = 0;
      }
    }
    this.groundedWheels = count;
    if (count > 0) this.groundNormal.copy(nSum).normalize();
  }

  private applyTireForces(
    input: DriveInput,
    n: Vec3,
    fwd: Vec3,
    grip: number,
    maxSpeed: number,
    traction: number,
    boosting: boolean,
    onGrass: boolean,
    h: number,
  ): void {
    const { stats } = this;
    // Base del pla de contacte.
    const fwdP = this.fwdP.copy(fwd).addScaled(n, -fwd.dot(n)).normalize();
    const rightP = this.rightP.crossVectors(fwdP, n);
    const vN = this.vel.dot(n);
    let vF = this.vel.dot(fwdP);
    let vR = this.vel.dot(rightP);

    // --- Derrapada ---
    if (this.drifting) {
      if (!input.handbrake || Math.hypot(vF, vR) < DRIFT_EXIT_SPEED || vF < 0) {
        this.drifting = false;
      }
    } else if (
      input.handbrake &&
      Math.abs(input.steer) > 0.3 &&
      vF > DRIFT_MIN_SPEED &&
      this.groundedWheels >= 2
    ) {
      this.drifting = true;
      this.driftDir = Math.sign(input.steer);
      // Petit cop de gir inicial per entrar a la derrapada.
      this.angVel.addScaled(n, -this.driftDir * DRIFT_KICK);
    }
    this.gripBlend = approach(this.gripBlend, this.drifting ? 0 : 1, 4 * h);

    // --- Longitudinal ---
    let a = 0;
    if (input.throttle > 0) {
      if (vF >= -0.5) {
        const ratio = clamp(vF / maxSpeed, 0, 1);
        a += stats.accel * input.throttle * (1 - ratio * ratio);
      } else {
        a += BRAKE_DECEL * input.throttle;
      }
    }
    if (input.brake > 0) {
      if (vF > 0.5) a -= BRAKE_DECEL * input.brake;
      else if (vF > -REVERSE_MAX_SPEED) a -= REVERSE_ACCEL * input.brake;
    }
    if (boosting) a += TURBO_ACCEL;
    a *= traction;

    let resist = ROLLING_DECEL + AIR_DRAG * vF * vF + (onGrass ? 6 : 0);
    if (input.handbrake && !this.drifting) resist += HANDBRAKE_DECEL;
    if (this.drifting) resist += DRIFT_DRAG;
    // Per sobre de la velocitat màxima (p. ex. després del turbo) frena suaument.
    if (vF > maxSpeed) resist += (vF - maxSpeed) * 0.8;
    resist *= traction;
    if (vF > 0) vF = Math.max(0, vF - resist * h);
    else if (vF < 0) vF = Math.min(0, vF + resist * h);
    vF += a * h;

    // --- Lateral: l'adherència gira la velocitat cap al morro ---
    const driftAmount = 1 - this.gripBlend;
    const gripRate = GRIP_RATE * this.gripBlend + DRIFT_GRIP_RATE * driftAmount;
    const latMax = grip * (1 + (DRIFT_GRIP_MULT - 1) * driftAmount) * traction;
    const speed = Math.hypot(vF, vR);
    const reversing = vF < 0;
    const beta = reversing ? Math.atan2(-vR, -vF) : Math.atan2(vR, vF);
    this.slipAngle = beta;
    if (speed > 3 && Math.abs(beta) < 0.9) {
      const maxTurn = (latMax * h) / speed;
      const dBeta = clamp(-beta * damp(gripRate * traction, h), -maxTurn, maxTurn);
      const newBeta = beta + dBeta;
      const newSpeed = Math.max(0, speed - SLIDE_DRAG * Math.abs(Math.sin(newBeta)) * h);
      const sgn = reversing ? -1 : 1;
      vF = sgn * newSpeed * Math.cos(newBeta);
      vR = sgn * newSpeed * Math.sin(newBeta);
    } else {
      // Lliscament molt lateral o molt lent: fricció pura.
      const maxLat = latMax * h;
      vR -= clamp(vR * damp(gripRate, h), -maxLat, maxLat);
    }

    this.vel.set(0, 0, 0).addScaled(n, vN).addScaled(fwdP, vF).addScaled(rightP, vR);

    // --- Gir (guinyada al voltant de la normal del terra) ---
    const absF = Math.abs(vF);
    let target: number;
    if (this.drifting) {
      const into = this.steer * this.driftDir; // +1 cap a dins, -1 contravolant
      target = -this.driftDir * DRIFT_YAW * (0.55 + 0.45 * into) * Math.min(1, absF / 20);
      // Limita l'angle de derrapada perquè el cotxe no faci trompos.
      const excess = Math.abs(beta) - DRIFT_MAX_ANGLE;
      if (excess > 0) target += this.driftDir * excess * 6;
      // Carrega el turbo mentre es derrapa de veritat.
      if (Math.abs(beta) > 0.15) {
        this.turbo = Math.min(1, this.turbo + DRIFT_CHARGE_RATE * Math.min(1, absF / 30) * h);
      }
    } else {
      const turnRate = Math.min(
        absF / MIN_TURN_RADIUS,
        MAX_YAW_RATE,
        (grip * 1.1) / Math.max(absF, 1),
      );
      target = -this.steer * turnRate * Math.sign(vF);
    }
    const yaw = this.angVel.dot(n);
    this.angVel.addScaled(n, (target - yaw) * damp(YAW_RESPONSE, h) * traction);
  }

  /**
   * Control a l'aire: la direcció fa girar el cotxe i accelerador/fre
   * inclinen el morro. El cotxe tendeix a anivellar-se per aterrar bé.
   */
  private applyAirControl(
    input: DriveInput,
    fwd: Vec3,
    up: Vec3,
    right: Vec3,
    torque: Vec3,
    h: number,
  ): void {
    // Els efectes entren progressivament: una pèrdua de contacte breu
    // (p. ex. a dalt d'un looping) no ha de redreçar el cotxe.
    const control = clamp((this.airTime - AIR_CONTROL_DELAY) / 0.25, 0, 1);
    if (control <= 0) return;

    const pitchOffset = (input.throttle - input.brake) * AIR_PITCH_OFFSET;
    const fh = this.tmp.set(fwd.x, 0, fwd.z);
    if (fh.lengthSq() < 1e-6) fh.set(-right.z, 0, right.x);
    fh.normalize();
    const targetUp = this.tmp2
      .set(0, Math.cos(pitchOffset), 0)
      .addScaled(fh, Math.sin(pitchOffset));
    const level = this.tmp.crossVectors(up, targetUp);
    torque.addScaled(level, AIR_LEVEL_STIFFNESS * control);

    const yaw = this.angVel.dot(up);
    const perp = this.tmp2.copy(this.angVel).addScaled(up, -yaw);
    torque.addScaled(perp, -AIR_LEVEL_DAMPING * control);

    const yawTarget = -input.steer * AIR_YAW_RATE;
    this.angVel.addScaled(up, (yawTarget - yaw) * damp(AIR_YAW_RESPONSE, h) * control);
  }

  /** angVel += I⁻¹ · torque · h, amb el tensor d'inèrcia en coordenades locals. */
  private applyAngularAccel(torque: Vec3, h: number): void {
    this.angVel.addScaled(this.inverseInertia(torque, this.tmp), h);
  }

  private inverseInertia(v: Vec3, out: Vec3): Vec3 {
    out.copy(v).applyQuatInverse(this.rot);
    out.x /= INERTIA.x;
    out.y /= INERTIA.y;
    out.z /= INERTIA.z;
    return out.applyQuat(this.rot);
  }

  private readonly sphereCenter = new Vec3();
  private readonly rel = new Vec3();
  private readonly vc = new Vec3();
  private readonly rxn = new Vec3();

  private readonly normal = new Vec3();
  private readonly correction = new Vec3();

  private resolveBodyCollisions(): void {
    const up = this.upVector(this.up);
    for (const [sx, sy, sz, radius] of BODY_SPHERES) {
      const center = this.sphereCenter.set(sx, sy, sz).applyQuat(this.rot).add(this.pos);
      const count = this.world.sphereContacts(center, radius, this.contacts);
      const corr = this.correction.set(0, 0, 0);
      for (let i = 0; i < count; i++) {
        const c = this.contacts[i];
        const n = this.normal.copy(c.normal);
        // Les parets només empenyen de costat: així el cotxe no s'hi enfila
        // quan en toca l'aresta superior.
        const nUp = n.dot(up);
        if (c.material === Surface.Wall && Math.abs(nUp) < 0.8) {
          n.addScaled(up, -nUp).normalize();
        }
        // Correcció de posició, descomptant el que ja s'ha corregit (arestes
        // compartides entre triangles donen contactes duplicats).
        const remaining = c.depth - corr.dot(n);
        if (remaining > 0) {
          this.pos.addScaled(n, remaining * 0.8);
          corr.addScaled(n, remaining * 0.8);
        }

        const r = this.rel.subVectors(c.point, this.pos);
        const vc = this.vc.crossVectors(this.angVel, r).add(this.vel);
        const vn = vc.dot(n);
        if (vn >= 0) continue;

        // Massa efectiva al punt de contacte: 1/m + n·((I⁻¹(r×n))×r).
        const rxn = this.rxn.crossVectors(r, n);
        const iRxn = this.inverseInertia(rxn, this.tmp);
        const angTerm = this.tmp2.crossVectors(iRxn, r).dot(n);
        const j = (-(1 + WALL_RESTITUTION) * vn) / (1 + angTerm * ANGULAR_IMPULSE_SCALE);

        this.vel.addScaled(n, j);
        this.angVel.addScaled(iRxn, j * ANGULAR_IMPULSE_SCALE);

        // Fricció tangencial (les parets són relliscoses per no encallar-se).
        const vt = vc.addScaled(n, -vn);
        const vtLen = vt.length();
        if (vtLen > 1e-4) {
          const jt = Math.min(vtLen, WALL_FRICTION * j);
          this.vel.addScaled(vt, -jt / vtLen);
        }

        if (j > this.impact) this.impact = j;
        if (c.material === Surface.Wall && vtLen > 4) {
          this.scraping = true;
          this.scrapePoint.copy(c.point);
        }
      }
    }
  }
}
