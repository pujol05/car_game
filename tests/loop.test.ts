import { describe, expect, it } from 'vitest';
import { DT, FixedStepLoop, MAX_FRAME_TIME } from '../src/core/loop';

describe('FixedStepLoop', () => {
  it('executa ticks fixos independentment del framerate', () => {
    let ticks = 0;
    const loop = new FixedStepLoop(
      () => ticks++,
      () => {},
    );
    // 144 Hz durant 1 segon ha de donar 60 ticks.
    for (let i = 0; i < 144; i++) loop.advance(1 / 144);
    expect(ticks).toBe(60);
  });

  it('dona un alpha entre 0 i 1', () => {
    const loop = new FixedStepLoop(
      () => {},
      () => {},
    );
    loop.advance(DT * 1.5);
    expect(loop.alpha).toBeCloseTo(0.5);
  });

  it('limita el temps acumulat en frames molt llargs', () => {
    let ticks = 0;
    const loop = new FixedStepLoop(
      () => ticks++,
      () => {},
    );
    loop.advance(10);
    expect(ticks).toBe(Math.round(MAX_FRAME_TIME / DT));
  });
});
