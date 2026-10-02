export function wrapAngle(a: number): number {
  const tau = Math.PI * 2
  a = ((a % tau) + tau) % tau
  if (a > Math.PI) a -= tau
  return a
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Shortest signed distance from `b` to `a` along a loop of `length`. */
export function alongDelta(a: number, b: number, length: number): number {
  let d = a - b
  const half = length * 0.5
  if (d > half) d -= length
  if (d < -half) d += length
  return d
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '–:––.––'
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}

export function ordinal(n: number): string {
  const v = n % 100
  const suf =
    v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${suf}`
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
