// Línies de velocitat radials sobre la pantalla quan el turbo és actiu.

export class SpeedLines {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private intensity = 0;
  enabled = true;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'speed-lines';
    this.ctx = this.canvas.getContext('2d');
  }

  update(active: boolean, speedRatio: number, frameDt: number): void {
    const target = this.enabled && active ? Math.min(1, 0.4 + speedRatio * 0.8) : 0;
    const rate = target > this.intensity ? 6 : 3;
    this.intensity += (target - this.intensity) * Math.min(1, rate * frameDt);
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    if (this.intensity < 0.02) return;

    const cx = w / 2;
    const cy = h * 0.45;
    const outer = Math.hypot(w, h) / 2;
    ctx.lineCap = 'round';
    const count = Math.round(50 * this.intensity);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r0 = outer * (0.45 + Math.random() * 0.25);
      const r1 = r0 + outer * (0.15 + Math.random() * 0.3);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 + 0.25 * this.intensity * Math.random()})`;
      ctx.lineWidth = 1 + Math.random() * 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + cos * r0, cy + sin * r0);
      ctx.lineTo(cx + cos * r1, cy + sin * r1);
      ctx.stroke();
    }
  }

  clear(): void {
    this.intensity = 0;
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
