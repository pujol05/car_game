// Matemàtiques bàsiques (vectors i quaternions) independents de three.js.
// La física i la lògica del circuit només depenen d'aquest mòdul, de manera
// que es poden testejar sense cap dependència gràfica.

export class Vec3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v: Vec3): this {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }

  add(v: Vec3): this {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  sub(v: Vec3): this {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  subVectors(a: Vec3, b: Vec3): this {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    return this;
  }

  addScaled(v: Vec3, s: number): this {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }

  scale(s: number): this {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  dot(v: Vec3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  /** this = a × b */
  crossVectors(a: Vec3, b: Vec3): this {
    const x = a.y * b.z - a.z * b.y;
    const y = a.z * b.x - a.x * b.z;
    const z = a.x * b.y - a.y * b.x;
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  normalize(): this {
    const len = this.length();
    if (len > 1e-12) this.scale(1 / len);
    return this;
  }

  distanceTo(v: Vec3): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  lerp(v: Vec3, t: number): this {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    this.z += (v.z - this.z) * t;
    return this;
  }

  /** Rota el vector amb el quaternió q (v' = q v q*). */
  applyQuat(q: Quat): this {
    const { x, y, z } = this;
    // t = 2 * (q.xyz × v)
    const tx = 2 * (q.y * z - q.z * y);
    const ty = 2 * (q.z * x - q.x * z);
    const tz = 2 * (q.x * y - q.y * x);
    // v' = v + w * t + q.xyz × t
    this.x = x + q.w * tx + (q.y * tz - q.z * ty);
    this.y = y + q.w * ty + (q.z * tx - q.x * tz);
    this.z = z + q.w * tz + (q.x * ty - q.y * tx);
    return this;
  }

  /** Rota el vector amb la inversa de q (de món a local). */
  applyQuatInverse(q: Quat): this {
    const { x, y, z } = this;
    const qx = -q.x;
    const qy = -q.y;
    const qz = -q.z;
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    this.x = x + q.w * tx + (qy * tz - qz * ty);
    this.y = y + q.w * ty + (qz * tx - qx * tz);
    this.z = z + q.w * tz + (qx * ty - qy * tx);
    return this;
  }
}

export class Quat {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public w = 1,
  ) {}

  set(x: number, y: number, z: number, w: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  copy(q: Quat): this {
    this.x = q.x;
    this.y = q.y;
    this.z = q.z;
    this.w = q.w;
    return this;
  }

  clone(): Quat {
    return new Quat(this.x, this.y, this.z, this.w);
  }

  identity(): this {
    return this.set(0, 0, 0, 1);
  }

  /** L'eix ha d'estar normalitzat. */
  setFromAxisAngle(axis: Vec3, angle: number): this {
    const half = angle / 2;
    const s = Math.sin(half);
    this.x = axis.x * s;
    this.y = axis.y * s;
    this.z = axis.z * s;
    this.w = Math.cos(half);
    return this;
  }

  /** this = a * b (primer s'aplica b, després a). */
  multiplyQuats(a: Quat, b: Quat): this {
    const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
    const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
    const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
    const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  /** this = q * this */
  premultiply(q: Quat): this {
    return this.multiplyQuats(q, this);
  }

  normalize(): this {
    const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
    if (len < 1e-12) return this.identity();
    const inv = 1 / len;
    this.x *= inv;
    this.y *= inv;
    this.z *= inv;
    this.w *= inv;
    return this;
  }

  dot(q: Quat): number {
    return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w;
  }

  /**
   * Integra una velocitat angular expressada en coordenades de món:
   * dq/dt = 0.5 * (ω, 0) * q
   */
  integrate(angVel: Vec3, dt: number): this {
    const hx = angVel.x * dt * 0.5;
    const hy = angVel.y * dt * 0.5;
    const hz = angVel.z * dt * 0.5;
    const { x, y, z, w } = this;
    this.x = x + (hx * w + hy * z - hz * y);
    this.y = y + (hy * w + hz * x - hx * z);
    this.z = z + (hz * w + hx * y - hy * x);
    this.w = w + (-hx * x - hy * y - hz * z);
    return this.normalize();
  }

  /** Interpolació esfèrica cap a q (t entre 0 i 1). */
  slerp(q: Quat, t: number): this {
    let cos = this.dot(q);
    let bx = q.x;
    let by = q.y;
    let bz = q.z;
    let bw = q.w;
    if (cos < 0) {
      cos = -cos;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }
    let s0: number;
    let s1: number;
    if (cos > 0.9995) {
      s0 = 1 - t;
      s1 = t;
    } else {
      const angle = Math.acos(cos);
      const sin = Math.sin(angle);
      s0 = Math.sin((1 - t) * angle) / sin;
      s1 = Math.sin(t * angle) / sin;
    }
    this.x = this.x * s0 + bx * s1;
    this.y = this.y * s0 + by * s1;
    this.z = this.z * s0 + bz * s1;
    this.w = this.w * s0 + bw * s1;
    return this.normalize();
  }
}

export const UP = Object.freeze(new Vec3(0, 1, 0)) as Readonly<Vec3>;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Mou `current` cap a `target` com a màxim `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

/** Factor de suavitzat exponencial independent del framerate. */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}
