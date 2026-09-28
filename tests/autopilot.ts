// Pilot automàtic per als tests: segueix la línia central del circuit.
// No forma part del joc; serveix per verificar que els circuits són
// completables i per estimar temps de referència.

import { type DriveInput, neutralInput } from '../src/core/input';
import { Vec3, clamp } from '../src/core/math';
import type { Vehicle } from '../src/physics/vehicle';
import type { BuiltTrack } from '../src/track/builder';
import { traceRoute } from '../src/track/connectivity';
import type { Frame } from '../src/track/sweep';

/** Ordre de cursa segons la connectivitat real de les peces. */
export function raceOrder(track: BuiltTrack): { order: number[]; reversed: boolean[] } {
  const route = traceRoute(track.data.pieces);
  return {
    order: route.steps.map((s) => s.piece),
    reversed: route.steps.map((s) => s.reversed),
  };
}

/** Concatena les línies centrals de les peces en ordre de cursa. */
export function buildRoute(track: BuiltTrack, order: number[], reversed: boolean[]): Frame[] {
  const route: Frame[] = [];
  order.forEach((pieceIndex, i) => {
    const frames = track.pieces[pieceIndex].route;
    const list = reversed[i]
      ? [...frames].reverse().map((f) => ({ p: f.p, t: f.t.clone().scale(-1), u: f.u }))
      : frames;
    for (const f of list) {
      const last = route[route.length - 1];
      if (!last || last.p.distanceTo(f.p) > 0.01) route.push(f);
    }
  });
  return route;
}

export class Autopilot {
  private idx = 0;
  private stuckTime = 0;
  private readonly local = new Vec3();
  private readonly dist: number[] = [];

  constructor(
    private readonly route: Frame[],
    private readonly cyclic: boolean,
    private readonly caution = 0.85,
  ) {
    // Distància acumulada per trobar punts per distància.
    let d = 0;
    this.dist.push(0);
    for (let i = 1; i < route.length; i++) {
      d += route[i].p.distanceTo(route[i - 1].p);
      this.dist.push(d);
    }
  }

  private wrap(i: number): number {
    const n = this.route.length;
    return this.cyclic ? ((i % n) + n) % n : Math.min(Math.max(i, 0), n - 1);
  }

  /** Retorna l'entrada i si cal reaparèixer. */
  control(v: Vehicle, dt: number, racing = true): { input: DriveInput; respawn: boolean } {
    const n = this.route.length;
    // Punt més proper, buscant endavant des de l'últim.
    let best = this.idx;
    let bestD = Infinity;
    for (let k = -3; k < 40; k++) {
      const i = this.wrap(this.idx + k);
      const d = this.route[i].p.distanceTo(v.pos);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (bestD > 15) {
      // Perdut (p. ex. després de reaparèixer): cerca global.
      for (let i = 0; i < n; i++) {
        const d = this.route[i].p.distanceTo(v.pos);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    this.idx = best;

    const speed = v.speed;
    // Punt objectiu a una distància de previsió.
    const look = 5 + speed * 0.28;
    let target = this.idx;
    let acc = 0;
    for (let k = 1; k < n && acc < look; k++) {
      const a = this.wrap(this.idx + k - 1);
      const b = this.wrap(this.idx + k);
      acc += this.route[a].p.distanceTo(this.route[b].p);
      target = b;
    }
    const local = this.local.copy(this.route[target].p).sub(v.pos).applyQuatInverse(v.rot);
    const angle = Math.atan2(-local.x, local.z);
    const steer = clamp(angle * 2.2, -1, 1);

    // Velocitat permesa segons la curvatura en el pla de la calçada.
    const grip = v.stats.grip * this.caution;
    let allowed = Infinity;
    acc = 0;
    for (let k = 1; k < n && acc < 140; k++) {
      const a = this.route[this.wrap(this.idx + k - 1)];
      const b = this.route[this.wrap(this.idx + k)];
      const ds = a.p.distanceTo(b.p);
      acc += ds;
      if (ds < 1e-3) continue;
      const right = new Vec3().crossVectors(a.t, a.u);
      const turn = Math.abs(new Vec3().copy(b.t).sub(a.t).dot(right));
      const curvature = turn / ds;
      if (curvature < 1e-4) continue;
      const vCorner = Math.sqrt(grip / curvature);
      allowed = Math.min(allowed, Math.sqrt(vCorner * vCorner + 2 * 22 * Math.max(0, acc - 8)));
    }

    const input = neutralInput();
    if (v.grounded) input.steer = steer;
    if (!v.grounded) {
      // A l'aire no toquem res: el cotxe s'anivella sol.
      input.throttle = 0;
    } else if (speed < allowed - 1) {
      input.throttle = 1;
    } else if (speed > allowed + 2) {
      input.brake = 1;
    } else {
      input.throttle = 0.3;
    }

    // Si s'encalla, reapareix.
    this.stuckTime = racing && speed < 1.5 ? this.stuckTime + dt : 0;
    const respawn = this.stuckTime > 3 || bestD > 25;
    if (respawn) this.stuckTime = 0;
    return { input, respawn };
  }
}
