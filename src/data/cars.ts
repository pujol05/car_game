// Estadístiques dels cotxes.

export interface CarStats {
  id: string;
  name: string;
  /** Velocitat màxima amb el motor (m/s). */
  maxSpeed: number;
  /** Acceleració del motor en sortida (m/s²). */
  accel: number;
  /** Acceleració lateral màxima amb adherència (m/s²). */
  grip: number;
  /** Color principal de la carrosseria. */
  color: number;
}

export const DEFAULT_CAR: CarStats = {
  id: 'balanced',
  name: 'Brisa',
  maxSpeed: 58,
  accel: 26,
  grip: 38,
  color: 0xff3b5c,
};
