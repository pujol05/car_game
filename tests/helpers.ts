import { neutralInput, type DriveInput } from '../src/core/input';
import { DT } from '../src/core/loop';
import type { Vehicle } from '../src/physics/vehicle';

export function drive(v: Vehicle, input: Partial<DriveInput>, seconds: number): void {
  const full: DriveInput = { ...neutralInput(), ...input };
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) v.step(full, DT);
}
