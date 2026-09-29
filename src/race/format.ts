// Format de temps de cursa.

/** Formata mil·lisegons com a m:ss.mmm. */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/** Diferència amb signe, p. ex. "+0.250" o "-1.034". */
export function formatDelta(ms: number): string {
  const sign = ms < 0 ? '-' : '+';
  const abs = Math.abs(Math.round(ms));
  const seconds = Math.floor(abs / 1000);
  const millis = abs % 1000;
  return `${sign}${seconds}.${String(millis).padStart(3, '0')}`;
}
