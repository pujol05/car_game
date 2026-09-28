// Estadístiques dels cotxes.

export type CarBody = 'coupe' | 'wedge' | 'rally';

export interface CarStats {
  id: string;
  name: string;
  description: string;
  /** Velocitat màxima amb el motor (m/s). */
  maxSpeed: number;
  /** Acceleració del motor en sortida (m/s²). */
  accel: number;
  /** Acceleració lateral màxima amb adherència (m/s²). */
  grip: number;
  /** Color principal de la carrosseria. */
  color: number;
  body: CarBody;
}

export const CARS: readonly CarStats[] = [
  {
    id: 'balanced',
    name: 'Brisa',
    description: 'Equilibrat: bo en tot, perfecte per començar.',
    maxSpeed: 58,
    accel: 26,
    grip: 38,
    color: 0xff3b5c,
    body: 'coupe',
  },
  {
    id: 'speed',
    name: 'Fletxa',
    description: 'El més ràpid en recta, però costa més fer-lo girar.',
    maxSpeed: 68,
    accel: 25,
    grip: 34,
    color: 0x2f9bff,
    body: 'wedge',
  },
  {
    id: 'grip',
    name: 'Grapa',
    description: 'Accelera molt i s’enganxa a les corbes; punta més baixa.',
    maxSpeed: 51,
    accel: 28,
    grip: 44,
    color: 0xffb81f,
    body: 'rally',
  },
];

export const DEFAULT_CAR: CarStats = CARS[0];

/** Cotxe per identificador (el cotxe per defecte si no existeix). */
export function carById(id: string): CarStats {
  return CARS.find((c) => c.id === id) ?? DEFAULT_CAR;
}
