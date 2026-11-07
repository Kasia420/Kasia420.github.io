/** Smooth 3D value noise in [-1, 1] (deterministic), used to carve the irregular shapes. */
function hash(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const u = fade(x - xi)
  const v = fade(y - yi)
  const w = fade(z - zi)
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz, seed)
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u)
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), u)
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u)
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), u)
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 2 - 1
}

/** A few octaves of noise: large lumps plus finer weathering. */
export function fbm(x: number, y: number, z: number, seed = 0): number {
  return noise3(x, y, z, seed) * 0.62 + noise3(x * 2.1, y * 2.1, z * 2.1, seed + 7) * 0.28 + noise3(x * 4.3, y * 4.3, z * 4.3, seed + 13) * 0.1
}
