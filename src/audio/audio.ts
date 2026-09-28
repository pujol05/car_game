// So generat per codi amb la Web Audio API, sense fitxers externs.
// L'AudioContext es crea amb la primera interacció de l'usuari (els
// navegadors no deixen reproduir so abans).

const SMOOTH = 0.05;

export interface CarSoundState {
  speed: number;
  maxSpeed: number;
  throttle: number;
  /** Intensitat del lliscament (0..1). */
  slip: number;
  grounded: boolean;
  turbo: boolean;
  scraping: boolean;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.7;
  private readonly cars = new Set<CarSound>();

  /** Crea o reprèn l'AudioContext (cal cridar-ho des d'un gest de l'usuari). */
  unlock(): void {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.noise = this.createNoise(this.ctx);
      for (const car of this.cars) car.attach(this.ctx, this.master, this.noise);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, SMOOTH);
    }
  }

  private createNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** So continu d'un cotxe (motor, derrapada, turbo, vent). */
  createCarSound(): CarSound {
    const car = new CarSound(() => this.cars.delete(car));
    this.cars.add(car);
    if (this.ctx && this.master && this.noise) car.attach(this.ctx, this.master, this.noise);
    return car;
  }

  // --- Sons puntuals ---

  private tone(
    freq: number,
    start: number,
    duration: number,
    type: OscillatorType = 'sine',
    gain = 0.2,
    endFreq?: number,
  ): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private noiseBurst(
    duration: number,
    gain: number,
    filter: BiquadFilterType,
    freq: number,
    endFreq?: number,
  ): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }

  click(): void {
    this.tone(700, 0, 0.06, 'triangle', 0.12);
  }

  countdown(go: boolean): void {
    if (go) this.tone(880, 0, 0.45, 'square', 0.12);
    else this.tone(440, 0, 0.18, 'square', 0.1);
  }

  checkpoint(better: boolean | null): void {
    if (better === false) {
      this.tone(520, 0, 0.12, 'triangle', 0.15);
      this.tone(390, 0.1, 0.2, 'triangle', 0.15);
    } else {
      this.tone(660, 0, 0.12, 'triangle', 0.15);
      this.tone(990, 0.1, 0.25, 'triangle', 0.15);
    }
  }

  lap(): void {
    [523, 659, 784].forEach((f, i) => this.tone(f, i * 0.09, 0.2, 'triangle', 0.14));
  }

  finish(record: boolean): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.12, 0.35, 'triangle', 0.16));
    if (record) {
      [1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.55 + i * 0.08, 0.3, 'sine', 0.1));
    }
  }

  boost(): void {
    this.noiseBurst(0.5, 0.35, 'bandpass', 500, 3500);
  }

  respawn(): void {
    this.tone(300, 0, 0.25, 'sine', 0.15, 900);
  }

  impact(strength: number): void {
    const g = Math.min(0.6, 0.08 + strength * 0.02);
    this.noiseBurst(0.3, g, 'lowpass', 900, 150);
    this.tone(70, 0, 0.25, 'sine', g * 0.8, 40);
  }
}

/** So continu d'un cotxe. Es pot crear abans que hi hagi AudioContext. */
export class CarSound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private engineA: OscillatorNode | null = null;
  private engineB: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private skidGain: GainNode | null = null;
  private turboGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private scrapeGain: GainNode | null = null;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private rpm = 0;
  private muted = false;

  constructor(private readonly onDispose: () => void) {}

  attach(ctx: AudioContext, master: GainNode, noise: AudioBuffer): void {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 1;
    this.out.connect(master);

    this.engineA = ctx.createOscillator();
    this.engineA.type = 'sawtooth';
    this.engineB = ctx.createOscillator();
    this.engineB.type = 'square';
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    this.engineA.connect(this.engineFilter);
    this.engineB.connect(subGain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.out);

    const noiseLayer = (type: BiquadFilterType, freq: number, q: number): GainNode => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src
        .connect(f)
        .connect(g)
        .connect(this.out as GainNode);
      src.start(0, Math.random() * 1.5);
      this.sources.push(src);
      return g;
    };
    this.skidGain = noiseLayer('bandpass', 1300, 1.2);
    this.turboGain = noiseLayer('bandpass', 2600, 0.8);
    this.windGain = noiseLayer('lowpass', 450, 0.5);
    this.scrapeGain = noiseLayer('highpass', 3200, 0.7);

    this.engineA.start();
    this.engineB.start();
    this.sources.push(this.engineA, this.engineB);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.out) {
      this.out.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.03);
    }
  }

  update(s: CarSoundState, dt: number): void {
    const { ctx } = this;
    if (!ctx || !this.engineA || !this.engineB || !this.engineFilter || !this.engineGain) return;
    // Canvi de marxes simulat: 5 marxes repartides fins a la velocitat màxima.
    const gearSpan = s.maxSpeed / 5;
    const speed = Math.max(0, s.speed);
    const gear = Math.min(4, Math.floor(speed / gearSpan));
    let target = (speed - gear * gearSpan) / gearSpan;
    if (gear > 0) target = 0.35 + target * 0.65;
    if (!s.grounded) target = Math.max(target, s.throttle * 0.9);
    target = Math.min(1.1, target + s.throttle * 0.08);
    this.rpm += (target - this.rpm) * Math.min(1, dt * 8);

    const t = ctx.currentTime;
    const freq = 42 + this.rpm * 120;
    this.engineA.frequency.setTargetAtTime(freq, t, SMOOTH);
    this.engineB.frequency.setTargetAtTime(freq * 0.5, t, SMOOTH);
    this.engineFilter.frequency.setTargetAtTime(
      350 + s.throttle * 1400 + this.rpm * 900,
      t,
      SMOOTH,
    );
    this.engineGain.gain.setTargetAtTime(0.07 + s.throttle * 0.07, t, SMOOTH);
    this.skidGain?.gain.setTargetAtTime(s.grounded ? Math.min(1, s.slip) * 0.22 : 0, t, SMOOTH);
    this.turboGain?.gain.setTargetAtTime(s.turbo ? 0.12 : 0, t, 0.08);
    const wind = Math.min(1, speed / 80);
    this.windGain?.gain.setTargetAtTime(wind * wind * 0.18, t, 0.1);
    this.scrapeGain?.gain.setTargetAtTime(s.scraping ? 0.14 : 0, t, 0.03);
  }

  dispose(): void {
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        // Ja estava aturat.
      }
    }
    this.sources.length = 0;
    this.out?.disconnect();
    this.onDispose();
  }
}
