import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * Everything that stands in the field, built from code (no models, no photos).
 * The photographs Kasia sent are references for shapes, textures and colours
 * only. Each part records which surface it is, for the shader in shaders.ts:
 * 0 whitewashed clapboard, 1 dark shingles, 2 black openings,
 * 3 bare weathered wood, 4 bark, 5 rusted iron, 6 old brick.
 */

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One stalk: a strip with more rows near the top, where the seed head swells. */
export function stalkGeometry(): THREE.BufferGeometry {
  const rows = [0, 0.3, 0.55, 0.75, 0.86, 0.93, 1]
  const pos: number[] = []
  const idx: number[] = []
  rows.forEach((y) => pos.push(-0.5, y, 0, 0.5, y, 0))
  for (let r = 0; r < rows.length - 1; r++) {
    const a = r * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

// ---- helpers ----
function arch(w: number, h: number): THREE.Shape {
  const r = w / 2
  const s = new THREE.Shape()
  s.moveTo(-r, 0)
  s.lineTo(r, 0)
  s.lineTo(r, h - w * 0.75)
  s.quadraticCurveTo(r, h - w * 0.15, 0, h)
  s.quadraticCurveTo(-r, h - w * 0.15, -r, h - w * 0.75)
  s.closePath()
  return s
}

const at = (x: number, y: number, z: number, ry = 0, rz = 0, rx = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1),
  )

/** Bakes a part: position (and, for round things, its own smooth normals), plus which surface it is. */
function piece(g: THREE.BufferGeometry, mat: number, m: THREE.Matrix4, keepNormals = false): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g.clone()
  geo.applyMatrix4(m)
  geo.clearGroups()
  for (const name of Object.keys(geo.attributes)) if (name !== 'position' && !(keepNormals && name === 'normal')) geo.deleteAttribute(name)
  geo.setAttribute('aMat', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(mat), 1))
  return geo
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts)
  if (!g) throw new Error('build: could not merge the parts')
  return g
}

/** A window: black glass, a frame and sill (painted, surface 0, unless told otherwise), glazing bars. */
function addWindow(parts: THREE.BufferGeometry[], M: THREE.Matrix4, w: number, h: number, bars = true, frame = 0): void {
  const rel = (m: THREE.Matrix4) => M.clone().multiply(m)
  const t = 0.08
  parts.push(piece(new THREE.PlaneGeometry(w, h), 2, M))
  parts.push(piece(new THREE.BoxGeometry(w + t * 2, t * 1.4, 0.07), frame, rel(at(0, h / 2 + t * 0.7, 0.02))))
  parts.push(piece(new THREE.BoxGeometry(w + t * 3, t * 1.2, 0.12), frame, rel(at(0, -h / 2 - t * 0.6, 0.04))))
  for (const sx of [-1, 1]) parts.push(piece(new THREE.BoxGeometry(t, h, 0.07), frame, rel(at(sx * (w / 2 + t / 2), 0, 0.02))))
  if (bars) {
    parts.push(piece(new THREE.BoxGeometry(0.035, h, 0.03), 3, rel(at(0, 0, 0.015))))
    parts.push(piece(new THREE.BoxGeometry(w, 0.035, 0.03), 3, rel(at(0, 0, 0.015))))
  }
}

/** A roof slab of a gable, between two points (u, y) of its cross-section, `length` long along the other axis. */
function slab(parts: THREE.BufferGeometry[], along: 'x' | 'z', a: [number, number], b: [number, number], length: number, mid: number, mat = 1, segs = 6): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.06
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
  const cu = (a[0] + b[0]) / 2
  const cy = (a[1] + b[1]) / 2
  if (along === 'z') parts.push(piece(new THREE.BoxGeometry(len, 0.13, length, 1, 1, segs), mat, at(cu, cy, mid, 0, ang))) // cross-section in x
  else parts.push(piece(new THREE.BoxGeometry(length, 0.13, len, segs, 1, 1), mat, at(mid, cy, cu, 0, 0, -ang))) // cross-section in z
}

const tri = (w: number, h: number) => new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)])

function warp(g: THREE.BufferGeometry, f: (v: THREE.Vector3) => void): void {
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    f(v)
    p.setXYZ(i, v.x, v.y, v.z)
  }
}

// ---- the church (highlights), after Kasia's reference photo ----
/**
 * A long weathered nave, its side boards silver and almost bare, the front gable
 * still white; a little gabled porch at the front; the belfry at the far end of
 * the roof with open arches and a tall mossy spire; one window broken, a torn
 * curtain behind it. Front at z = 0, facing +z; the nave runs back to z = -10.
 */
export function chapelGeometry(): THREE.BufferGeometry {
  const W = 5.0
  const L = 10.0
  const H = 4.0
  const rise = 2.6
  const parts: THREE.BufferGeometry[] = []
  const box = (w: number, h: number, d: number, mat: number, m: THREE.Matrix4, seg: [number, number, number] = [1, 1, 1]) =>
    parts.push(piece(new THREE.BoxGeometry(w, h, d, ...seg), mat, m))
  // walls: the front still painted, the rest weathered bare
  box(W, H, 0.16, 0, at(0, H / 2, -0.08), [2, 2, 1])
  box(W, H, 0.16, 8, at(0, H / 2, -L + 0.08), [2, 2, 1])
  for (const sx of [-1, 1]) box(0.16, H, L, 8, at(sx * (W / 2 - 0.08), H / 2, -L / 2), [1, 2, 6])
  parts.push(piece(new THREE.ShapeGeometry(tri(W, rise - 0.1)), 0, at(0, H, 0.005)))
  parts.push(piece(new THREE.ShapeGeometry(tri(W, rise - 0.1)), 8, at(0, H, -L - 0.005, Math.PI)))
  // the roof, its ridge running front to back
  slab(parts, 'z', [-W / 2 - 0.3, H - 0.15], [0, H + rise], L + 0.6, -L / 2, 1, 10)
  slab(parts, 'z', [W / 2 + 0.3, H - 0.15], [0, H + rise], L + 0.6, -L / 2, 1, 10)
  // the porch at the front, a little to one side, with its own gable
  const px = -0.9
  box(2.4, 3.0, 2.0, 0, at(px, 1.5, 1.0))
  parts.push(piece(new THREE.ShapeGeometry(tri(2.4, 0.95)), 0, at(px, 3.0, 2.005)))
  slab(parts, 'z', [px - 1.4, 2.9], [px, 4.0], 2.3, 1.1)
  slab(parts, 'z', [px + 1.4, 2.9], [px, 4.0], 2.3, 1.1)
  addWindow(parts, at(px, 1.75, 2.02), 0.6, 1.0)
  addWindow(parts, at(px + 1.21, 1.15, 1.0, Math.PI / 2), 0.9, 2.1, false) // its door
  // tall windows down both long sides; one is broken, a curtain hanging torn behind it
  for (const sx of [-1, 1])
    for (const z of [-3.0, -5.5, -8.0]) addWindow(parts, at(sx * (W / 2 + 0.01), 2.1, z, (sx * Math.PI) / 2), 0.7, 1.6, !(sx < 0 && z === -5.5), 8)
  parts.push(piece(new THREE.PlaneGeometry(0.42, 1.25, 1, 4), 9, at(-W / 2 - 0.03, 2.0, -5.45, -Math.PI / 2 + 0.2, 0.09)))
  // the belfry at the far end of the ridge: open arches, a little eave, a tall spire
  const bz = -L + 1.4
  box(1.7, 3.4, 1.7, 8, at(0, H + rise + 0.2, bz), [1, 3, 1])
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    parts.push(piece(new THREE.ShapeGeometry(arch(0.62, 1.0), 6), 2, at(Math.sin(a) * 0.86, H + rise + 0.75, bz + Math.cos(a) * 0.86, a)))
  }
  box(2.1, 0.15, 2.1, 1, at(0, H + rise + 1.95, bz))
  parts.push(piece(new THREE.ConeGeometry(1.3, 3.8, 4, 3), 1, at(0, H + rise + 1.95 + 1.9, bz, Math.PI / 4)))
  parts.push(piece(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 8), 5, at(1.3, H + 1.6, -4.0))) // a stovepipe

  const all = merged(parts)
  warp(all, (v) => {
    // the ridge sags between porch and belfry; the belfry leans a little
    if (v.y > H + rise - 0.4 && v.z < -0.5 && v.z > -L + 2.4) v.y -= 0.28 * Math.sin(Math.PI * THREE.MathUtils.clamp((v.z + 0.5) / -(L - 2.9), 0, 1))
    if (v.y > H + rise + 0.3) v.x += (v.y - H - rise) * 0.035
    v.x += v.y * 0.01
  })
  all.computeVertexNormals()
  return all
}

// ---- the fence (experience): a split-rail fence, one tall post per job ----
/**
 * Runs along z from zNear to zFar (zNear > zFar) at local x = 0. `jobs` are the
 * z positions of the tall posts that carry a plaque; they stand straight, the
 * others lean. Some rails are missing and some hang broken into the grass.
 */
export function fenceGeometry(zNear: number, zFar: number, jobs: number[], seed = 5): THREE.BufferGeometry {
  const r = mulberry32(seed)
  const posts: { z: number; job: boolean }[] = []
  for (let z = zNear; z > zFar; z -= 2.4) {
    const zz = z + (r() - 0.5) * 0.3
    if (!jobs.some((j) => Math.abs(j - zz) < 1.1)) posts.push({ z: zz, job: false })
  }
  for (const j of jobs) posts.push({ z: j, job: true })
  posts.sort((a, b) => b.z - a.z)

  const parts: THREE.BufferGeometry[] = []
  for (const p of posts) {
    const h = p.job ? 1.8 : 1.12 + r() * 0.24
    const w = p.job ? 0.2 : 0.13 + r() * 0.03
    // job posts stand straight, turned toward the path so their plaques face whoever walks up it
    const lean = p.job ? new THREE.Euler(0, 0.75, 0) : new THREE.Euler((r() - 0.5) * 0.1, r() * 0.6, (r() - 0.5) * 0.14)
    const m = new THREE.Matrix4()
      .makeRotationFromEuler(lean)
      .premultiply(new THREE.Matrix4().makeTranslation(0, 0, p.z))
      .multiply(new THREE.Matrix4().makeTranslation(0, h / 2, 0))
    parts.push(piece(new THREE.BoxGeometry(w, h, w), 3, m))
  }
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i].z
    const b = posts[i + 1].z
    const side = i % 2 ? 1 : -1
    for (const [upper, y0] of [
      [false, 0.5],
      [true, 0.92],
    ] as const) {
      const roll = r()
      const y = y0 + (r() - 0.5) * 0.06
      if (!upper && roll < 0.08) continue // gone
      if (upper && roll < 0.14) {
        // broken: hangs from one post down into the grass
        const len = 1.5 + r() * 0.5
        const m = new THREE.Matrix4()
          .makeTranslation(side * 0.08, y, a)
          .multiply(new THREE.Matrix4().makeRotationX(-(0.55 + r() * 0.3)))
          .multiply(new THREE.Matrix4().makeTranslation(0, 0, -len / 2))
        parts.push(piece(new THREE.BoxGeometry(0.06, 0.09, len), 3, m))
        continue
      }
      const m = at(side * 0.08, y, (a + b) / 2, 0, (r() - 0.5) * 0.05, (r() - 0.5) * 0.08)
      parts.push(piece(new THREE.BoxGeometry(0.06, 0.1, a - b + 0.12), 3, m))
    }
  }
  const g = merged(parts)
  g.computeVertexNormals()
  return g
}

/** A painted tin plaque for a job post: the years, in the site's typewriter face. */
export function plaqueTexture(label: string, seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')
  if (g) {
    const r = mulberry32(seed)
    g.fillStyle = '#3b2a1d'
    g.fillRect(0, 0, 256, 128)
    for (let i = 0; i < 240; i++) {
      g.fillStyle = `rgba(${(110 + r() * 70) | 0}, ${(55 + r() * 35) | 0}, ${(28 + r() * 22) | 0}, ${(0.06 + r() * 0.2).toFixed(2)})`
      g.beginPath()
      g.arc(r() * 256, r() * 128, 2 + r() * 11, 0, Math.PI * 2)
      g.fill()
    }
    g.strokeStyle = 'rgba(237, 227, 207, 0.4)'
    g.lineWidth = 3
    g.strokeRect(9, 9, 238, 110)
    g.fillStyle = '#ede3cf'
    g.font = `400 ${label.length > 5 ? 38 : 58}px "Courier Prime", "Courier New", monospace`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(label, 128, 68)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.NoColorSpace // raw sRGB values, like every other colour here
  return tex
}

// ---- the farmhouse (education), after Kasia's reference photo ----
/**
 * Two storeys under a wide side-gabled roof; a steep gable in the middle of the
 * front rises above the ridge, with a pointed attic window; two brick chimneys
 * stand just behind it. Upstairs: a window each side and a three-part window in
 * the middle. A porch runs the whole width, with a low gable over the steps and
 * turned posts with brackets. Front at z = 0, facing +z.
 */
export function houseGeometry(): THREE.BufferGeometry {
  const W = 6.6 // width
  const D = 4.4 // depth
  const H = 5.6 // wall height, two storeys
  const parts: THREE.BufferGeometry[] = []
  const box = (w: number, h: number, d: number, mat: number, m: THREE.Matrix4, seg: [number, number, number] = [1, 1, 1]) =>
    parts.push(piece(new THREE.BoxGeometry(w, h, d, ...seg), mat, m))
  /** a roof plane: a slab of `width` running from (a) to (b) in the plane across `axis` */
  const slope = (axis: 'x' | 'z', a: [number, number], b: [number, number], width: number, at3: number, segs = 6) =>
    axis === 'z' ? slabZ(a, b, width, at3, segs) : slab(parts, 'z', a, b, width, at3, 1, segs)
  const slabZ = (a: [number, number], b: [number, number], width: number, at3: number, segs: number) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.06
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
    box(width, 0.14, len, 1, at(at3, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2, 0, 0, -ang), [segs, 1, 1])
  }
  const opening = (x: number, y: number, z: number, w: number, h: number, ry = 0, bars = true) => addWindow(parts, at(x, y, z, ry), w, h, bars)

  // walls, with the triangles of the side gables
  box(W, H, D, 0, at(0, H / 2, -D / 2), [3, 3, 2])
  const rise = 2.0 // main roof, eaves to ridge
  const run = D / 2 + 0.35
  for (const sx of [-1, 1])
    parts.push(piece(new THREE.ShapeGeometry(tri(D, rise * ((D / 2) / run))), 0, at(sx * (W / 2 + 0.01), H, -D / 2, (sx * Math.PI) / 2)))
  // corner boards and the band under the eaves
  for (const sx of [-1, 1]) for (const z of [0.02, -D - 0.02]) box(0.16, H, 0.16, 0, at(sx * (W / 2 + 0.02), H / 2, z))
  box(W + 0.1, 0.24, 0.08, 0, at(0, H - 0.12, 0.05))

  // the main roof: two slabs meeting at a ridge that runs side to side; at the front, the
  // middle part starts behind the gable, so the eaves do not cross in front of it
  const k = rise / run
  const side = (W + 0.5) / 2 - 1.65
  for (const sx of [-1, 1]) slope('z', [0.35, H], [-D / 2, H + rise], side, sx * (1.65 + side / 2), 3)
  slope('z', [-0.05, H + 0.4 * k], [-D / 2, H + rise], 3.3, 0, 3)
  slope('z', [-D - 0.35, H], [-D / 2, H + rise], W + 0.5, 0)

  // the front gable, steeper and taller than the ridge behind it
  const gw = 3.3
  const gh = 2.65
  parts.push(piece(new THREE.ShapeGeometry(tri(gw, gh)), 0, at(0, H, 0.0)))
  const eave = H - 0.15
  const apex = H + gh + 0.15
  slope('x', [-gw / 2 - 0.2, eave], [0, apex], 3.3, -1.35)
  slope('x', [gw / 2 + 0.2, eave], [0, apex], 3.3, -1.35)
  parts.push(piece(new THREE.ShapeGeometry(arch(0.72, 1.18), 6), 0, at(0, H + 0.42, 0.02))) // the window's surround
  parts.push(piece(new THREE.ShapeGeometry(arch(0.55, 1.0), 6), 2, at(0, H + 0.5, 0.035)))

  // two brick chimneys just behind the gable, standing above it
  for (const sx of [-1, 1]) {
    box(0.55, 2.4, 0.75, 6, at(sx * 0.95, H + rise + 0.25, -D / 2))
    box(0.68, 0.14, 0.88, 6, at(sx * 0.95, H + rise + 1.48, -D / 2))
  }

  // upstairs: a window each side, a three-part window in the middle
  const up = 4.25
  opening(-2.15, up, 0.03, 0.8, 1.35)
  opening(2.15, up, 0.03, 0.8, 1.35)
  opening(0, up, 0.03, 0.82, 1.35)
  for (const sx of [-1, 1]) opening(sx * 0.74, up, 0.03, 0.3, 1.35, 0, false)
  // downstairs, under the porch: the door and a window each side
  opening(0, 1.38, 0.03, 0.95, 2.15, 0, false)
  for (const sx of [-1, 1]) opening(sx * 2.15, 1.65, 0.03, 0.8, 1.55)
  // and along the sides
  for (const sx of [-1, 1])
    for (const [y, z] of [
      [up, -1.3],
      [up, -3.1],
      [1.65, -2.2],
    ] as const)
      opening(sx * (W / 2 + 0.03), y, z, 0.75, 1.3, (sx * Math.PI) / 2)

  // the porch: deck, a low roof, a beam, a little gable over the steps, turned posts with brackets
  const pd = 2.15 // porch depth
  box(W + 0.3, 0.3, pd, 3, at(0, 0.15, pd / 2))
  slope('z', [pd + 0.1, 2.86], [0, 3.16], W + 0.4, 0, 8)
  box(W + 0.4, 0.22, 0.12, 0, at(0, 2.76, pd + 0.02), [6, 1, 1])
  parts.push(piece(new THREE.ShapeGeometry(tri(3.2, 0.82)), 0, at(0, 2.87, pd + 0.06)))
  slope('x', [-1.72, 2.86], [0, 3.74], 1.8, pd - 0.75)
  slope('x', [1.72, 2.86], [0, 3.74], 1.8, pd - 0.75)
  const lathe = new THREE.LatheGeometry(
    [
      [0.1, 0],
      [0.1, 0.22],
      [0.065, 0.32],
      [0.055, 0.85],
      [0.08, 0.95],
      [0.055, 1.05],
      [0.055, 2.0],
      [0.085, 2.12],
      [0.085, 2.46],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    8,
  )
  for (const x of [-3.05, -0.98, 0.98, 3.05]) {
    parts.push(piece(lathe, 0, at(x, 0.3, pd - 0.18)))
    for (const sx of [-1, 1]) box(0.045, 0.5, 0.045, 0, at(x + sx * 0.16, 2.52, pd - 0.18, 0, -sx * 0.95)) // brackets
  }

  const all = merged(parts)
  warp(all, (v) => {
    // the main ridge sags a little in the middle, and the porch roof droops at one end
    if (v.y > H + rise - 0.3 && v.z < -1.6 && v.z > -2.8 && Math.abs(v.x) > 1.3) v.y -= 0.1 * Math.sin(Math.PI * THREE.MathUtils.clamp((v.x + W / 2) / W, 0, 1))
    if (v.y > 2.55 && v.y < 3.3 && v.z > 0.2) v.y -= 0.12 * THREE.MathUtils.smoothstep(v.x, 0.5, W / 2 + 0.2)
    v.x += v.y * 0.012 // settled to one side
  })
  all.computeVertexNormals()
  return all
}

// ---- a bare tree, gnarled, its branches reaching over the path ----
/** `lean` is +1 to reach toward +x, -1 toward -x. */
export function treeGeometry(seed: number, lean: 1 | -1): THREE.BufferGeometry {
  const r = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  const UP = new THREE.Vector3(0, 1, 0)
  const limb = (a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number) => {
    const dir = b.clone().sub(a)
    const len = dir.length()
    const seg = new THREE.CylinderGeometry(rb, ra, len, ra > 0.05 ? 7 : 4, 1, true)
    const m = new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()), new THREE.Vector3(1, 1, 1))
    parts.push(piece(seg, 4, m, true))
  }
  const grow = (start: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    // each limb has a kink in the middle, so nothing is quite straight
    const kink = dir.clone().add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.45)).normalize()
    const mid = start.clone().addScaledVector(dir, len * 0.5)
    const end = mid.clone().addScaledVector(kink, len * 0.5)
    limb(start, mid, rad, rad * 0.85)
    limb(mid, end, rad * 0.85, rad * 0.7)
    if (depth === 0) return
    const n = depth >= 5 ? 2 : r() < 0.55 ? 2 : 3
    let across = new THREE.Vector3(r() - 0.5, r() * 0.2, r() - 0.5).cross(kink)
    if (across.lengthSq() < 1e-6) across = new THREE.Vector3(1, 0, 0).cross(kink)
    across.normalize()
    for (let i = 0; i < n; i++) {
      const axis = across.clone().applyAxisAngle(kink, (i / n) * Math.PI * 2 + r())
      const next = kink.clone().applyAxisAngle(axis, 0.35 + r() * 0.55)
      next.y += 0.1 // reaching up a little
      next.x += 0.09 * lean // and over the path
      next.normalize()
      grow(end, next, len * (0.68 + r() * 0.2), rad * 0.66, depth - 1)
    }
  }
  grow(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0.22 * lean, 1, 0.05).normalize(), 2.1, 0.16, 6)
  return merged(parts)
}

// ---- a rusted tube gate, hanging open, its free end dropped ----
export function gateGeometry(open: number): THREE.BufferGeometry {
  const tube = (len: number) => new THREE.CylinderGeometry(0.028, 0.028, len, 6, 1, true)
  const leaf: THREE.BufferGeometry[] = []
  for (const y of [0.28, 0.58, 0.88, 1.18]) leaf.push(piece(tube(3.3), 5, at(1.7, y, 0, 0, Math.PI / 2)))
  for (const x of [0.05, 3.35]) leaf.push(piece(tube(1.0), 5, at(x, 0.73, 0)))
  leaf.push(piece(tube(1.88), 5, at(0.875, 0.73, 0, 0, -(Math.PI / 2 - 0.5)))) // the brace
  const l = merged(leaf)
  warp(l, (v) => {
    v.y -= (v.x / 3.35) * 0.14
  })
  l.applyMatrix4(new THREE.Matrix4().makeRotationY(open))
  const all = merged([
    l,
    piece(new THREE.BoxGeometry(0.2, 1.7, 0.2), 3, at(-0.14, 0.85, 0)),
    piece(new THREE.BoxGeometry(0.18, 1.5, 0.18), 3, at(3.6, 0.72, 0, 0, 0.12)),
  ])
  all.computeVertexNormals()
  return all
}

// ---- a shed beside the farmhouse, falling apart: steep gable, boards gone, roof caved in, leaning hard ----
export function shedGeometry(): THREE.BufferGeometry {
  const r = mulberry32(606)
  const W = 3.0
  const D = 2.8
  const Hw = 2.5
  const rise = 1.7
  const parts: THREE.BufferGeometry[] = []
  const plank = (w: number, h: number, d: number, m: THREE.Matrix4) => parts.push(piece(new THREE.BoxGeometry(w, h, d), 3, m))
  // gable ends of upright boards; a few gone, some snapped off short, a doorway in the front
  for (const [zf, front] of [
    [0, true],
    [-D, false],
  ] as const) {
    for (let x = -W / 2 + 0.1; x < W / 2; x += 0.21) {
      if (r() < 0.12) continue
      let h = Hw + rise * (1 - Math.abs(x) / (W / 2))
      if (r() < 0.18) h *= 0.5 + r() * 0.4
      const bottom = front && x > -0.6 && x < 0.4 ? 1.95 : 0
      if (h <= bottom + 0.1) continue
      plank(0.2, h - bottom, 0.05, at(x, bottom + (h - bottom) / 2, zf, 0, (r() - 0.5) * 0.04))
    }
  }
  // the side walls
  for (const sx of [-1, 1])
    for (let z = -0.1; z > -D; z -= 0.21) {
      if (r() < 0.15) continue
      const h = r() < 0.2 ? Hw * (0.55 + r() * 0.4) : Hw
      plank(0.05, h, 0.2, at((sx * W) / 2, h / 2, z))
    }
  // the roof: planks down both slopes; on one side a hole where it has fallen in, a few torn up
  const run = W / 2 + 0.15
  const len = Math.hypot(run, rise)
  const ang = Math.atan2(rise, run)
  for (const sx of [-1, 1])
    for (let z = 0.12; z > -D - 0.12; z -= 0.23) {
      const hole = sx > 0 && z < -0.8 && z > -2.0
      if (hole && r() < 0.8) continue
      if (r() < 0.1) continue
      const torn = r() < 0.14 ? 0.35 + r() * 0.35 : 0
      plank(len, 0.04, 0.2, at((-sx * run) / 2, Hw + rise / 2, z, 0, sx * (ang + torn))) // rising to the ridge; torn ones stick up
    }
  // two planks fallen through the hole, and the door hanging off one hinge
  plank(len, 0.04, 0.2, at(0.7, Hw * 0.6, -1.3, 0.3, 1.1))
  plank(len * 0.8, 0.04, 0.2, at(0.4, Hw * 0.35, -1.6, -0.5, 0.6))
  const door = new THREE.Matrix4()
    .makeTranslation(-0.6, 0, 0.04)
    .multiply(new THREE.Matrix4().makeRotationY(-1.25))
    .multiply(new THREE.Matrix4().makeRotationZ(0.12))
    .multiply(new THREE.Matrix4().makeTranslation(0.5, 0.95, 0))
  plank(0.95, 1.85, 0.05, door)
  parts.push(piece(new THREE.PlaneGeometry(1.0, 1.95), 2, at(-0.1, 0.98, -0.05))) // the dark inside
  const all = merged(parts)
  warp(all, (v) => {
    v.x += v.y * 0.11 // leaning hard, about to go
    v.z += v.y * 0.03 * Math.sin(v.x)
  })
  all.computeVertexNormals()
  return all
}

// ---- a barn with a gambrel roof and a silo beside it (between the church and the house) ----
/** Front gable end at z = 0, facing +z; the barn runs back to z = -12. */
export function barnGeometry(): THREE.BufferGeometry {
  const W = 8
  const D = 12
  const H = 4.6
  const parts: THREE.BufferGeometry[] = []
  const box = (w: number, h: number, d: number, mat: number, m: THREE.Matrix4, seg: [number, number, number] = [1, 1, 1]) =>
    parts.push(piece(new THREE.BoxGeometry(w, h, d, ...seg), mat, m))
  // the gambrel ends: steep lower slopes, shallow upper ones
  const end = new THREE.Shape(
    [
      [-W / 2, 0],
      [W / 2, 0],
      [W / 2, H],
      [2.6, H + 2.4],
      [0, H + 3.3],
      [-2.6, H + 2.4],
      [-W / 2, H],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
  )
  parts.push(piece(new THREE.ShapeGeometry(end), 0, at(0, 0, 0)))
  parts.push(piece(new THREE.ShapeGeometry(end), 0, at(0, 0, -D, Math.PI)))
  for (const sx of [-1, 1]) box(0.16, H, D, 0, at(sx * (W / 2 - 0.08), H / 2, -D / 2), [1, 2, 6])
  // a rusted tin roof in four planes
  for (const sx of [-1, 1]) {
    slab(parts, 'z', [sx * (W / 2 + 0.25), H - 0.15], [sx * 2.6, H + 2.4], D + 0.5, -D / 2, 5, 8)
    slab(parts, 'z', [sx * 2.6, H + 2.4], [0, H + 3.3], D + 0.5, -D / 2, 5, 8)
  }
  // the front: a big doorway, a hayloft door high up, small square windows, a louvre under the peak
  parts.push(piece(new THREE.PlaneGeometry(2.6, 3.2), 2, at(-1.6, 1.6, 0.02)))
  parts.push(piece(new THREE.PlaneGeometry(1.2, 1.4), 2, at(0, H + 0.55, 0.02)))
  for (const [x, y] of [
    [1.7, 1.9],
    [3.0, 1.9],
    [-2.2, H - 0.6],
    [2.2, H - 0.6],
  ] as const)
    addWindow(parts, at(x, y, 0.02), 0.65, 0.65, true, 3)
  parts.push(piece(new THREE.PlaneGeometry(0.7, 0.5), 2, at(0, H + 2.35, 0.02)))
  for (let i = 0; i < 4; i++) box(0.7, 0.05, 0.05, 3, at(0, H + 2.18 + i * 0.12, 0.05))
  // a lean-to along one side, half open
  box(2.6, 3.0, 8, 0, at(W / 2 + 1.3, 1.5, -6.5), [1, 1, 3])
  slab(parts, 'z', [W / 2 + 2.8, 2.9], [W / 2, 3.6], 8.4, -6.5, 5, 4)
  parts.push(piece(new THREE.PlaneGeometry(4.5, 2.6), 2, at(W / 2 + 2.62, 1.3, -6.5, Math.PI / 2)))
  const all = merged(parts)
  warp(all, (v) => {
    if (v.y > H + 2.0 && v.z < -1 && v.z > -D + 1) v.y -= 0.25 * Math.sin(Math.PI * ((-v.z - 1) / (D - 2))) // the ridge has sagged
    v.x += v.y * 0.008
  })
  all.computeVertexNormals()
  return all
}

/** A stave silo with a domed tin cap. */
export function siloGeometry(): THREE.BufferGeometry {
  const all = merged([
    piece(new THREE.CylinderGeometry(1.7, 1.75, 10, 18, 6, true), 7, at(0, 5, 0)),
    piece(new THREE.SphereGeometry(1.76, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), 5, at(0, 10, 0)),
  ])
  warp(all, (v) => {
    v.x += v.y * 0.012
  })
  all.computeVertexNormals()
  return all
}

// ---- laundry left on the line (between the field and the church) ----
/**
 * Two T-posts and a sagging line along x from 0 to 5, and what hangs on it:
 * sheets, a dress, a shirt, a pillowcase. The cloth carries, per vertex, the
 * height of its pegs and its length, so the shader can blow it about.
 */
export function clotheslineGeometry(): { frame: THREE.BufferGeometry; cloth: THREE.BufferGeometry } {
  const span = 5
  const top = 2.2
  const lineY = (x: number) => top - 0.16 * Math.sin((Math.PI * x) / span)
  const frame: THREE.BufferGeometry[] = []
  for (const x of [0, span]) {
    frame.push(piece(new THREE.BoxGeometry(0.12, top + 0.1, 0.12), 3, at(x, (top + 0.1) / 2, 0, 0, x === 0 ? 0.05 : -0.08)))
    frame.push(piece(new THREE.BoxGeometry(0.1, 0.08, 1.0), 3, at(x, top, 0)))
  }
  for (let i = 0; i < 10; i++) {
    const x0 = (span * i) / 10
    const x1 = (span * (i + 1)) / 10
    const y0 = lineY(x0)
    const y1 = lineY(x1)
    frame.push(piece(new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0), 0.02, 0.02), 5, at((x0 + x1) / 2, (y0 + y1) / 2, 0, 0, Math.atan2(y1 - y0, x1 - x0))))
  }
  const f = merged(frame)
  f.computeVertexNormals()

  const pieces: THREE.BufferGeometry[] = []
  const hang = (x: number, w: number, h: number, phase: number, flare = 1) => {
    const g = new THREE.PlaneGeometry(w, h, 6, 10)
    g.translate(0, -h / 2, 0) // the top edge at the line
    const pos = g.attributes.position as THREE.BufferAttribute
    if (flare !== 1)
      for (let i = 0; i < pos.count; i++) {
        const t = -pos.getY(i) / h
        pos.setX(i, pos.getX(i) * THREE.MathUtils.lerp(flare, 1, t)) // a dress: narrow at the shoulders, wide at the hem
      }
    const yTop = lineY(x) - 0.02
    g.translate(x, yTop, 0.0)
    const n = pos.count
    g.deleteAttribute('uv')
    g.deleteAttribute('normal')
    g.setAttribute('aTop', new THREE.Float32BufferAttribute(new Float32Array(n).fill(yTop), 1))
    g.setAttribute('aLen', new THREE.Float32BufferAttribute(new Float32Array(n).fill(h), 1))
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(new Float32Array(n).fill(phase), 1))
    pieces.push(g.toNonIndexed())
  }
  hang(0.85, 1.3, 1.55, 0.3)
  hang(2.2, 0.85, 1.75, 1.9, 0.45)
  hang(3.15, 0.6, 0.75, 3.1)
  hang(4.15, 1.1, 1.35, 4.4)
  hang(4.75, 0.42, 0.55, 5.2)
  const c = mergeGeometries(pieces)
  if (!c) throw new Error('build: could not merge the laundry')
  return { frame: f, cloth: c }
}

// ---- the marsh at the end: bald cypresses hung with moss, and a gate standing in the water ----
export interface Strands {
  hook: number[]
  len: number[]
  phase: number[]
  tone: number[]
}

/** One cypress: a flared, fluted foot, a tall trunk, crooked branches; moss strands are added to `out`. */
function cypress(seed: number, where: THREE.Vector3, scale: number, out: Strands, density: number): THREE.BufferGeometry {
  const r = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  const UP = new THREE.Vector3(0, 1, 0)
  const T = new THREE.Matrix4().compose(
    where,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * Math.PI * 2, 0)),
    new THREE.Vector3(scale, scale, scale),
  )
  const trunk = new THREE.LatheGeometry(
    [
      [1.05, -0.3],
      [0.85, 0.15],
      [0.58, 0.6],
      [0.42, 1.3],
      [0.34, 2.4],
      [0.29, 4.4],
      [0.21, 6.8],
      [0.13, 8.8],
      [0.06, 10.2],
    ].map(([rr, y]) => new THREE.Vector2(rr, y)),
    14,
  )
  const lean = (r() - 0.5) * 0.06
  warp(trunk, (v) => {
    const k = 1 + 0.16 * Math.sin(Math.atan2(v.z, v.x) * 5 + seed) * (1 - THREE.MathUtils.smoothstep(v.y, 0.5, 3.0)) // fluted foot
    v.x = v.x * k + v.y * lean
    v.z *= k
  })
  trunk.computeVertexNormals()
  parts.push(piece(trunk, 4, T, true))

  const limb = (a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number) => {
    const dir = b.clone().sub(a)
    const len = dir.length()
    const m = new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()), new THREE.Vector3(1, 1, 1))
    parts.push(piece(new THREE.CylinderGeometry(rb, ra, len, 6, 1, true), 4, T.clone().multiply(m), true))
  }
  const hang = (a: THREE.Vector3, b: THREE.Vector3, n: number, maxLen: number) => {
    for (let i = 0; i < n; i++) {
      const p = a.clone().lerp(b, r()).applyMatrix4(T)
      const cluster = Math.max(2, Math.round((4 + Math.floor(r() * 5)) * density)) // a beard of thin strands
      for (let j = 0; j < cluster; j++) {
        out.hook.push(p.x + (r() - 0.5) * 0.35 * scale, p.y - r() * 0.15 * scale, p.z + (r() - 0.5) * 0.35 * scale)
        out.len.push((0.35 + r() * maxLen) * scale)
        out.phase.push(r() * Math.PI * 2)
        out.tone.push(r())
      }
    }
  }
  const branches = 8 + Math.floor(r() * 5)
  for (let i = 0; i < branches; i++) {
    const y0 = 4.2 + r() * 5.2
    const ang = r() * Math.PI * 2
    const dir = new THREE.Vector3(Math.cos(ang), 0.2 + r() * 0.45, Math.sin(ang)).normalize()
    const start = new THREE.Vector3(0, y0, 0)
    const len = (1.4 + r() * 1.8) * (1.1 - (y0 - 4.2) / 9)
    const kink = dir.clone().add(new THREE.Vector3(r() - 0.5, -0.15 - r() * 0.2, r() - 0.5).multiplyScalar(0.5)).normalize()
    const mid = start.clone().addScaledVector(dir, len * 0.55)
    const end = mid.clone().addScaledVector(kink, len * 0.45)
    const rad = 0.11 * (1 - (y0 - 4.2) / 11)
    limb(start, mid, rad, rad * 0.75)
    limb(mid, end, rad * 0.75, rad * 0.4)
    hang(start.clone().lerp(mid, 0.4), end, Math.max(2, Math.round((7 + Math.floor(r() * 5)) * Math.min(1, density * 1.3))), 2.2)
    for (let k = 0; k < 2; k++) {
      const td = kink.clone().add(new THREE.Vector3(r() - 0.5, r() * 0.3, r() - 0.5)).normalize()
      const te = end.clone().addScaledVector(td, len * (0.3 + r() * 0.25))
      limb(end, te, rad * 0.4, rad * 0.15)
      if (density > 0.3) hang(end, te, 3, 1.4)
    }
  }
  return merged(parts)
}

/**
 * The grove, relative to the middle of the shore (z = 0, water toward -z), and all its moss:
 * four near trees framing the view, more round the gate, and a stand fading into the dark.
 * `density` thins the moss on small screens.
 */
export function groveGeometry(density = 1): { trees: THREE.BufferGeometry; strands: Strands } {
  const strands: Strands = { hook: [], len: [], phase: [], tone: [] }
  const placed = (
    [
      [-4.2, 0.8, 1.0, 3],
      [5.2, -1.5, 1.05, 5],
      [-7.5, -4.5, 1.15, 8],
      [8.5, -6, 1.2, 13],
      [-2.2, -9, 1.1, 21],
      [4.8, -11, 1.2, 34],
      [-10.5, -12, 1.3, 55],
      [11.5, -13, 1.25, 89],
      [-5, -18, 1.3, 144],
      [2, -21, 1.35, 233],
      [8, -24, 1.4, 377],
      [-12, -23, 1.35, 610],
      [-1, -30, 1.45, 987],
      [13, -30, 1.4, 1597],
    ] as const
  ).map(([x, z, sc, seed]) => [x, z, sc, seed] as [number, number, number, number])
  // the edge of a swamp forest: a treeline right across the far side of the water, and trees
  // closing in along both banks, so that from far off it reads as woods, not a clump
  const r = mulberry32(4242)
  const extra: [number, number, number, number][] = []
  const clear = (x: number, z: number) => ![...placed, ...extra].some(([px, pz]) => Math.hypot(px - x, pz - z) < 3.4)
  for (let i = 0; i < 26; i++) {
    const x = -48 + (96 * (i + r())) / 26
    const z = -6 - r() * 40
    if (Math.abs(x) < 5 && z > -15) continue // keep the view to the gate open
    if (clear(x, z)) extra.push([x, z, 1.1 + r() * 0.5, 3000 + i])
  }
  for (let i = 0; i < 10; i++) {
    const x = (i % 2 ? 1 : -1) * (8 + r() * 18)
    const z = 1 + r() * 16
    if (clear(x, z)) extra.push([x, z, 1.0 + r() * 0.4, 5000 + i])
  }
  const trees = [
    ...placed.map(([x, z, sc, seed]) => cypress(seed, new THREE.Vector3(x, 0, z), sc, strands, density)),
    ...extra.map(([x, z, sc, seed]) => cypress(seed, new THREE.Vector3(x, 0, z), sc, strands, density * 0.25)),
  ]
  return { trees: merged(trees), strands }
}

/** Moss strands as one instanced mesh of hanging ribbons. */
export function mossGeometry(s: Strands): THREE.InstancedBufferGeometry {
  const rows = [0, 0.2, 0.45, 0.7, 1]
  const pos: number[] = []
  const idx: number[] = []
  rows.forEach((y) => pos.push(-0.5, y, 0, 0.5, y, 0))
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 2
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const g = new THREE.InstancedBufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.setAttribute('aHook', new THREE.InstancedBufferAttribute(new Float32Array(s.hook), 3))
  g.setAttribute('aLen', new THREE.InstancedBufferAttribute(new Float32Array(s.len), 1))
  g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(s.phase), 1))
  g.setAttribute('aTone', new THREE.InstancedBufferAttribute(new Float32Array(s.tone), 1))
  g.instanceCount = s.len.length
  return g
}

/** Two brick pillars, one crumbling, and wrought-iron gates standing ajar; front faces +z. */
export function swampGateGeometry(): THREE.BufferGeometry {
  const r = mulberry32(77)
  const parts: THREE.BufferGeometry[] = []
  const box = (w: number, h: number, d: number, mat: number, m: THREE.Matrix4) => parts.push(piece(new THREE.BoxGeometry(w, h, d), mat, m))
  box(0.95, 3.4, 0.95, 6, at(-1.62, 1.6, 0))
  box(1.15, 0.24, 1.15, 6, at(-1.62, 3.42, 0))
  box(0.95, 2.9, 0.95, 6, at(1.62, 1.35, 0))
  for (let i = 0; i < 7; i++) box(0.26, 0.1, 0.13, 6, at(1.62 + (r() - 0.5) * 0.6, 2.85 + r() * 0.35, (r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.5)) // loose on top
  for (let i = 0; i < 12; i++) box(0.26, 0.1, 0.13, 6, at(2.2 + r() * 1.3, 0.02 + r() * 0.18, (r() - 0.3) * 1.6, r() * 3, (r() - 0.5) * 0.8, (r() - 0.5) * 0.6)) // fallen
  const leaf = (dir: 1 | -1, open: number) => {
    const L: THREE.BufferGeometry[] = []
    const w = 1.1
    const top = (t: number) => 2.0 + 0.5 * t * t // t = 1 at the pillar, 0 in the middle
    for (let i = 0; i <= 9; i++) {
      const u = i / 9
      const h = top(1 - u)
      L.push(piece(new THREE.BoxGeometry(0.03, h, 0.03), 5, at(dir * u * w, h / 2, 0)))
    }
    for (const y of [0.35, 1.05, 1.8]) L.push(piece(new THREE.BoxGeometry(w, 0.045, 0.035), 5, at((dir * w) / 2, y, 0)))
    for (let i = 0; i < 9; i++) {
      const x0 = (dir * i * w) / 9
      const x1 = (dir * (i + 1) * w) / 9
      const y0 = top(1 - i / 9)
      const y1 = top(1 - (i + 1) / 9)
      L.push(piece(new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0), 0.04, 0.035), 5, at((x0 + x1) / 2, (y0 + y1) / 2, 0, 0, Math.atan2(y1 - y0, x1 - x0))))
    }
    const g = merged(L)
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(-dir * 1.12, 0, 0).multiply(new THREE.Matrix4().makeRotationY(open)))
    return g
  }
  parts.push(leaf(1, 0.4), leaf(-1, -0.65))
  const g = merged(parts)
  g.computeVertexNormals()
  return g
}

// ---- ruins in the background: what is left of some building nobody could name ----
/**
 * A broken gable end and a long side wall meeting it at a corner, both holed
 * with arches and ragged breaches; a pillar stump with a fallen arch; rubble.
 */
export function ruinGeometry(): THREE.BufferGeometry {
  const r = mulberry32(919)
  const parts: THREE.BufferGeometry[] = []
  type Hole = [cx: number, cy: number, w: number, h: number, kind: 'arch' | 'rect' | 'ragged']
  const wall = (outline: [number, number][], holes: Hole[], thick: number, m: THREE.Matrix4) => {
    const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)))
    for (const [cx, cy, w, h, kind] of holes) {
      const p = new THREE.Path()
      if (kind === 'arch') {
        p.moveTo(cx - w / 2, cy - h / 2)
        p.lineTo(cx + w / 2, cy - h / 2)
        p.lineTo(cx + w / 2, cy + h / 2 - w * 0.6)
        p.quadraticCurveTo(cx + w / 2, cy + h / 2 - w * 0.1, cx, cy + h / 2)
        p.quadraticCurveTo(cx - w / 2, cy + h / 2 - w * 0.1, cx - w / 2, cy + h / 2 - w * 0.6)
      } else if (kind === 'rect') {
        p.moveTo(cx - w / 2, cy - h / 2)
        p.lineTo(cx + w / 2, cy - h / 2)
        p.lineTo(cx + w / 2, cy + h / 2)
        p.lineTo(cx - w / 2, cy + h / 2)
      } else {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2
          const k = 0.75 + r() * 0.5
          const x = cx + (Math.cos(a) * w * k) / 2
          const y = cy + (Math.sin(a) * h * k) / 2
          if (i) p.lineTo(x, y)
          else p.moveTo(x, y)
        }
      }
      p.closePath()
      sh.holes.push(p)
    }
    parts.push(piece(new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 6 }), 7, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -thick / 2))))
  }
  // a gable end, its peak broken off
  wall(
    [
      [-3.2, -0.3],
      [3.2, -0.3],
      [3.2, 3.6],
      [2.4, 4.3],
      [1.6, 5.9],
      [0.9, 6.6],
      [0.3, 6.1],
      [-0.4, 7.0],
      [-1.0, 5.6],
      [-1.8, 5.1],
      [-2.5, 3.9],
      [-3.2, 3.1],
    ],
    [
      [0, 3.6, 1.0, 2.2, 'arch'],
      [-1.9, 1.3, 0.9, 1.5, 'ragged'],
      [1.9, 2.0, 0.7, 1.2, 'rect'],
      [0.9, 5.2, 0.5, 0.6, 'ragged'],
    ],
    0.7,
    at(0, 0, 0),
  )
  // a long side wall running back from its corner, broken down to stumps in places
  wall(
    [
      [0, -0.3],
      [9, -0.3],
      [9, 1.2],
      [8.2, 2.1],
      [7.1, 1.6],
      [6.4, 3.2],
      [5.3, 3.6],
      [4.6, 2.4],
      [3.9, 2.9],
      [3.0, 4.1],
      [2.1, 4.4],
      [1.0, 3.9],
      [0, 4.2],
    ],
    [
      [1.6, 1.9, 0.8, 1.6, 'arch'],
      [4.2, 1.2, 1.2, 1.6, 'ragged'],
      [6.0, 1.9, 0.7, 1.4, 'arch'],
      [2.9, 3.4, 0.4, 0.5, 'ragged'],
    ],
    0.6,
    at(3.2, 0, -0.35, Math.PI / 2 - 0.25),
  )
  // a pillar stump with the start of an arch still on it, the rest fallen beside it
  parts.push(piece(new THREE.BoxGeometry(0.8, 3.2, 0.8), 7, at(-5.6, 1.6, 2.2, 0.2)))
  parts.push(piece(new THREE.BoxGeometry(0.75, 0.5, 1.4), 7, at(-5.2, 3.35, 2.2, 0.2, 0.5)))
  parts.push(piece(new THREE.BoxGeometry(0.8, 1.3, 0.8), 7, at(-2.9, 0.65, 2.9, -0.3)))
  parts.push(piece(new THREE.BoxGeometry(1.9, 0.55, 0.7), 7, at(-4.1, 0.3, 3.6, 0.7, 0.15, 0.1)))
  // rubble everywhere
  for (let i = 0; i < 34; i++) {
    const sz = 0.2 + r() * 0.55
    parts.push(piece(new THREE.BoxGeometry(sz * (1 + r()), sz * 0.7, sz), 7, at(-7 + r() * 17, sz * 0.2, -4 + r() * 9, r() * 3, (r() - 0.5) * 0.7, (r() - 0.5) * 0.7)))
  }
  const g = merged(parts)
  warp(g, (v) => {
    v.z -= v.y * 0.02 + 0.06 * Math.sin(v.x * 0.7) * (v.y / 6) // leaning, bellied
  })
  g.computeVertexNormals()
  return g
}

// ---- writing: a table alone in the field, the manuscript, pages blown about ----

export function tableGeometry(): THREE.BufferGeometry {
  const r = mulberry32(31)
  const parts: THREE.BufferGeometry[] = []
  const box = (w: number, h: number, d: number, mat: number, m: THREE.Matrix4) => parts.push(piece(new THREE.BoxGeometry(w, h, d), mat, m))
  box(1.7, 0.06, 0.95, 3, at(0, 0.78, 0))
  for (const [x, z] of [
    [-0.78, -0.4],
    [0.78, -0.4],
    [-0.78, 0.4],
    [0.78, 0.4],
  ] as const)
    box(0.07, 0.75, 0.07, 3, at(x, 0.375, z))
  for (const z of [0.42, -0.42]) box(1.55, 0.1, 0.03, 3, at(0, 0.7, z))
  // the chair, pushed back and turned away
  const C = at(0.95, 0, 0.55, 0.6)
  const rel = (m: THREE.Matrix4) => C.clone().multiply(m)
  parts.push(piece(new THREE.BoxGeometry(0.46, 0.05, 0.44), 3, rel(at(0, 0.46, 0))))
  for (const [x, z] of [
    [-0.2, -0.19],
    [0.2, -0.19],
    [-0.2, 0.19],
    [0.2, 0.19],
  ] as const)
    parts.push(piece(new THREE.BoxGeometry(0.04, 0.46, 0.04), 3, rel(at(x, 0.23, z))))
  for (const x of [-0.2, 0.2]) parts.push(piece(new THREE.BoxGeometry(0.045, 0.55, 0.045), 3, rel(at(x, 0.74, -0.2, 0, 0, -0.08))))
  for (const y of [0.62, 0.78, 0.94]) parts.push(piece(new THREE.BoxGeometry(0.42, 0.06, 0.03), 3, rel(at(0, y, -0.21, 0, 0, -0.08))))
  // the manuscript, loose sheets, an ink bottle
  box(0.3, 0.07, 0.42, 9, at(0.18, 0.845, 0.05, 0.15))
  for (let i = 0; i < 4; i++) box(0.21, 0.004, 0.3, 9, at(-0.15 + r() * 0.6, 0.812 + i * 0.002, -0.25 + r() * 0.5, r() * 1.2 - 0.6))
  parts.push(piece(new THREE.CylinderGeometry(0.035, 0.04, 0.07, 8), 2, at(0.55, 0.845, -0.22)))
  // pages caught in the grass all round
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2
    const d = 1.1 + r() * 2.6
    box(0.21, 0.004, 0.3, 9, at(Math.cos(a) * d + 0.8, 0.35 + r() * 0.5, Math.sin(a) * d, r() * 3, (r() - 0.5) * 1.4, (r() - 0.5) * 1.2))
  }
  const g = merged(parts)
  g.computeVertexNormals()
  return g
}

/** One loose page, for the ones blowing about. */
export function pageGeometry(): THREE.BufferGeometry {
  const g = merged([piece(new THREE.BoxGeometry(0.21, 0.004, 0.3), 9, new THREE.Matrix4())])
  g.computeVertexNormals()
  return g
}

// ---- a cornfield (languages and skills): dry stalks in rows either side of a trodden path ----
function ribbon(rows: number[]): THREE.BufferGeometry {
  const pos: number[] = []
  const idx: number[] = []
  rows.forEach((y) => pos.push(-0.5, y, 0, 0.5, y, 0))
  for (let r = 0; r < rows.length - 1; r++) {
    const a = r * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

/**
 * Rows of corn from zNear to zFar (zNear > zFar), either side of a path down the
 * middle; a few gaps, a few stalks broken or fallen. `density` thins it on phones,
 * `wide` is how far out the field runs either side, and on the right everything past
 * the path's own rows starts earlier, at `besideZ` (behind the church).
 */
export function cornGeometry(
  zNear: number,
  zFar: number,
  density = 1,
  wide = 70,
  besideZ = zNear,
): { stalks: THREE.InstancedBufferGeometry; leaves: THREE.InstancedBufferGeometry } {
  const r = mulberry32(1313)
  const S = { root: [] as number[], height: [] as number[], lean: [] as number[], yaw: [] as number[], phase: [] as number[], tone: [] as number[] }
  const L = { root: [] as number[], y: [] as number[], yaw: [] as number[], len: [] as number[], droop: [] as number[], phase: [] as number[], tone: [] as number[] }
  // rows closer together and staggered, so you cannot see down between them; ragged starts and ends instead of a straight edge.
  // Wide enough that its sides are never in view. Past 16 units out nobody sees more than the front of the field (from the
  // path the near rows hide the rest), so out there only a band along the front is planted, the rows further apart, and the
  // far edge thins out into the dark instead of stopping.
  const gap = 0.6 / Math.sqrt(Math.max(0.25, density))
  const step = 0.3 / Math.sqrt(Math.max(0.25, density))
  for (const side of [-1, 1])
    for (let x0 = 1.25, g = gap; x0 < wide; x0 += g) {
      g = x0 < 12 ? gap : x0 < 24 ? gap * 1.6 : x0 < 45 ? gap * 2.2 : gap * 3
      const near = x0 < 7
      const band = x0 >= 16
      const z0 = side > 0 && x0 >= 5 ? besideZ : zNear
      const start = z0 - r() * (band ? 4 : 2.5)
      const end = band ? Math.max(zFar + r() * 2.5, start - 18 - r() * 5) : zFar + r() * 2.5
      const st = band ? step * 1.3 : step
      const thin = 0.03 + 0.6 * Math.max(0, (x0 - (wide - 20)) / 20) // the odd gap, more of them toward the far edge
      for (let z = start; z > end; z -= st) {
        if (r() < thin) continue
        const x = side * (x0 + (r() - 0.5) * g * 0.9)
        const zz = z + (r() - 0.5) * st * 0.8
        const broken = r() < 0.05
        const height = broken ? 0.9 + r() * 1.2 : 2.1 + r() * 0.9
        const yaw = r() * Math.PI * 2
        const tone = r()
        const phase = r() * Math.PI * 2
        S.root.push(x, 0, zz)
        S.height.push(height)
        S.lean.push(broken ? 0.4 + r() * 0.7 : r() * 0.08)
        S.yaw.push(yaw)
        S.phase.push(phase)
        S.tone.push(tone)
        if (broken) continue
        const n = near ? 7 + Math.floor(r() * 4) : x0 < 12 ? 3 + Math.floor(r() * 2) : 1 // fewer leaves where nobody looks closely
        for (let i = 0; i < n; i++) {
          L.root.push(x, 0, zz)
          L.y.push(height * (0.18 + (0.7 * i) / n))
          L.yaw.push(yaw + i * 2.6 + (r() - 0.5) * 0.8) // leaves alternate round the stalk
          L.len.push(0.7 + r() * 0.6)
          L.droop.push(0.6 + r() * 0.6)
          L.phase.push(phase + i)
          L.tone.push(Math.min(1, tone * 0.7 + r() * 0.4))
        }
      }
    }
  const inst = (base: THREE.BufferGeometry, attrs: Record<string, [number[], number]>) => {
    const g = new THREE.InstancedBufferGeometry()
    g.index = base.index
    g.setAttribute('position', base.getAttribute('position'))
    let count = 0
    for (const [name, [data, size]] of Object.entries(attrs)) {
      g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(data), size))
      count = data.length / size
    }
    g.instanceCount = count
    return g
  }
  return {
    stalks: inst(ribbon([0, 0.45, 0.88, 0.95, 1]), {
      aRoot: [S.root, 3],
      aHeight: [S.height, 1],
      aLean: [S.lean, 1],
      aYaw: [S.yaw, 1],
      aPhase: [S.phase, 1],
      aTone: [S.tone, 1],
    }),
    leaves: inst(ribbon([0, 0.2, 0.45, 0.7, 1]), {
      aRoot: [L.root, 3],
      aY: [L.y, 1],
      aYaw: [L.yaw, 1],
      aLen: [L.len, 1],
      aDroop: [L.droop, 1],
      aPhase: [L.phase, 1],
      aTone: [L.tone, 1],
    }),
  }
}
