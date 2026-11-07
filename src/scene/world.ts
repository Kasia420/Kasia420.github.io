import * as THREE from 'three'
import {
  barnGeometry,
  chapelGeometry,
  clotheslineGeometry,
  cornGeometry,
  fenceGeometry,
  gateGeometry,
  groveGeometry,
  houseGeometry,
  mossGeometry,
  mulberry32,
  pageGeometry,
  plaqueTexture,
  ruinGeometry,
  shedGeometry,
  siloGeometry,
  stalkGeometry,
  swampGateGeometry,
  tableGeometry,
  treeGeometry,
} from './build'
import * as GL from './shaders'

/**
 * The night field: one fixed WebGL canvas behind the whole page.
 *
 *  - the hero is the field from the first design: thin straw stalks with seed
 *    heads, swaying, under a black sky; nothing else stands in it
 *  - the flashlight is a soft pool of light that follows the pointer (when the
 *    pointer rests, or on touch screens, it drifts on its own); a click fires a
 *    camera flash that overexposes the field and fades
 *  - scrolling walks forward. The first stretch dips down into the grass and
 *    comes up again; only then do the places appear, one per theme of the CV:
 *    a big weathered church, and far off the ruins of something unrecognisable
 *    (highlights), a path through dry corn (languages and skills), a broken split-rail fence with reeds behind and a barn and silo far beyond
 *    it, a painted plaque for each job and laundry left on a line (experience), a farm with a
 *    leaning house, a collapsing shed, a bare tree and a rusted gate (education),
 *    a table alone in a clearing with the manuscript and
 *    pages blowing about (writing)
 *  - at the very end the field gives way to a marsh: reeds along the bank, black
 *    still water that mirrors what stands in it, bald cypresses hung with moss,
 *    low mist, and a brick gate with iron gates ajar standing in the water
 *  - while a card is read, the camera keeps its place on the other side of the
 *    screen; between sections it looks ahead again
 *  - the field never ends, so the waving and the light go on under every section
 *
 * Reduced motion: one still frame of the field; the camera does not move.
 */
export interface Shot {
  /** scroll (px) at which this card is centred on screen */
  at: number
  /** what to keep in view while the card is read: 'chapel', 'house', 'post:<n>', 'wall', 'table' or 'gate' */
  target: string
  /** the side of the screen the card is on; the place is framed on the other side */
  card: 'left' | 'right'
}

export interface WorldLayout {
  /** scroll (px) at which the dive from the hero ends and the highlights begin */
  diveEnd: number
  /** scroll (px) at which the last highlight is read; the chapel is close by then */
  chapel: number
  /** the experience section: the scroll range it covers, and each job's card */
  fence: { from: number; to: number; posts: { at: number; label: string }[] }
  /** scroll (px) at which the last education card is read; the house is close by then */
  house: number
  /** the scroll range (px) of languages and skills: a walk down a path through the corn */
  corn: { from: number; to: number }
  /** scroll (px) at which the writing card is read */
  table: number
  /** the largest scroll (px): the walk ends a few steps before the water */
  marsh: number
  shots: Shot[]
}

export interface LightInfo {
  /** the centre of the pool of light, in CSS px from the top left of the viewport */
  x: number
  y: number
  flash: number
}

export interface World {
  layout(spec: WorldLayout): void
  setScroll(y: number): void
  flash(): void
}

const K = 1 / 52 // world units walked per scrolled pixel
const TILE = 46 // depth of the strip of grass that travels with the viewer
const SPREAD = 30 // half-width of the field
const FENCE_X = 2.6 // the fence runs on the right of the path
const HOUSE_X = -8.6 // the farm is on the left

const srgb = (hex: string): THREE.Vector3 => {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}
const { smoothstep, lerp, degToRad } = THREE.MathUtils

export function createWorld(
  canvas: HTMLCanvasElement,
  opts: { reducedMotion: boolean; onFrame?: (light: LightInfo) => void },
): World | null {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  const small = matchMedia('(pointer: coarse)').matches || window.innerWidth < 760
  let ratio = Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.5)
  renderer.setPixelRatio(ratio)
  renderer.setClearColor(0x0a0907, 1)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 170)
  const shared = {
    uLightPx: { value: new THREE.Vector2() },
    uR: { value: 400 },
    uFlash: { value: 0 },
    uHorizon: { value: 0 },
    uSpan: { value: 100 },
    uGrainT: { value: 0 },
    uShore: { value: new THREE.Vector2(0, 0) },
  }
  const straw = srgb('#c9ad6a')
  const paper = srgb('#f6f1e7')

  // ---- sky ----
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader: GL.SKY_VERT, fragmentShader: GL.SKY_FRAG, depthTest: false, depthWrite: false, uniforms: { ...shared } }),
  )
  sky.frustumCulled = false
  sky.renderOrder = -10
  scene.add(sky)

  // ---- grass ----
  const N = small ? 16000 : 44000
  const rand = mulberry32(2026)
  const offset = new Float32Array(N * 3)
  const height = new Float32Array(N)
  const tone = new Float32Array(N)
  const phase = new Float32Array(N)
  const head = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const r = rand() * 2 - 1
    offset[i * 3] = Math.sign(r) * Math.abs(r) ** 1.3 * SPREAD // a little denser where the walk goes, but no thin patches at the sides
    offset[i * 3 + 2] = -rand() * TILE
    height[i] = 0.55 + rand() * 0.8
    tone[i] = rand()
    phase[i] = rand() * Math.PI * 2
    head[i] = rand() < 0.38 ? 1 : 0
  }
  const stalk = stalkGeometry()
  const grassGeo = new THREE.InstancedBufferGeometry()
  grassGeo.index = stalk.index
  grassGeo.setAttribute('position', stalk.getAttribute('position'))
  grassGeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 3))
  grassGeo.setAttribute('aHeight', new THREE.InstancedBufferAttribute(height, 1))
  grassGeo.setAttribute('aTone', new THREE.InstancedBufferAttribute(tone, 1))
  grassGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1))
  grassGeo.setAttribute('aHead', new THREE.InstancedBufferAttribute(head, 1))
  grassGeo.instanceCount = N
  const grassMat = new THREE.ShaderMaterial({
    vertexShader: GL.GRASS_VERT,
    fragmentShader: GL.GRASS_FRAG,
    side: THREE.DoubleSide,
    uniforms: {
      ...shared,
      uTime: { value: 0 },
      uCamZ: { value: 0 },
      uTile: { value: TILE },
      uWidth: { value: 0.012 },
      uReed: { value: new THREE.Vector4(0, 0, 0, 0) },
      uYard: { value: new THREE.Vector4(0, 0, 0, 0) },
      uClear: { value: new THREE.Vector3(1e5, 1e5, 1) },
      uClear2: { value: new THREE.Vector3(1e5, 1e5, 1) },
      uPath: { value: new THREE.Vector3(1e5, 1e5 - 1, 1) },
      uLo: { value: srgb('#6b5a35') },
      uHi: { value: srgb('#d9c7a1') },
      uReedLo: { value: srgb('#4a2f1c') },
      uReedHi: { value: srgb('#b88a5c') },
      uPaper: { value: paper },
      uFog: { value: 0.028 },
    },
  })
  const grass = new THREE.Mesh(grassGeo, grassMat)
  grass.frustumCulled = false
  scene.add(grass)

  // ---- ground ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.ShaderMaterial({
      vertexShader: GL.SURFACE_VERT,
      fragmentShader: GL.GROUND_FRAG,
      uniforms: { ...shared, uSoil: { value: srgb('#2a2216') }, uStraw: { value: straw }, uFog: { value: 0.04 } },
    }),
  )
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)

  // ---- the places ----
  type Colours = { paint: string; bare: string; roof: string }
  const WHITEWASH: Colours = { paint: '#dbd1bd', bare: '#595247', roof: '#302b24' }
  const FARM: Colours = { paint: '#d1ba8f', bare: '#664c33', roof: '#33271c' } // warm cream, brown wood, brown roof
  const structure = (flood: number, dir: [number, number, number], c: Colours = WHITEWASH) =>
    new THREE.ShaderMaterial({
      vertexShader: GL.STRUCT_VERT,
      fragmentShader: GL.STRUCT_FRAG,
      uniforms: {
        ...shared,
        uReveal: { value: 0 },
        uFlood: { value: flood },
        uFloodDir: { value: new THREE.Vector3(...dir).normalize() },
        uPaper: { value: paper },
        uPaint: { value: srgb(c.paint) },
        uBare: { value: srgb(c.bare) },
        uRoof: { value: srgb(c.roof) },
        uDim: { value: 1 },
        uFog: { value: 0.012 },
      },
    })
  const thing = (geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial) => {
    const m = new THREE.Mesh(geo, mat)
    m.visible = false
    scene.add(m)
    return m
  }
  // floodlit from the viewer's side, so they show far off; the rest only where the light falls
  const chapel = thing(chapelGeometry(), structure(0.62, [-0.45, 0.4, 1]))
  chapel.rotation.y = 0.12
  const fence = thing(new THREE.BufferGeometry(), structure(0, [0, 1, 0]))
  const house = thing(houseGeometry(), structure(0.5, [0.55, 0.45, 1], FARM))
  house.rotation.y = 0.55
  const shed = thing(shedGeometry(), structure(0.22, [0.55, 0.45, 1], FARM))
  shed.rotation.y = 1.2
  const tree = thing(treeGeometry(41, -1), structure(0.05, [0.55, 0.45, 1]))
  const gate = thing(gateGeometry(0.55), structure(0, [0, 1, 0]))
  gate.rotation.y = Math.PI
  // the marsh: everything that stands in the water is drawn twice, the second time upside down and dimmer,
  // under the water, which is see-through enough to show it: a reflection without a second render pass
  const marsh = new THREE.Group()
  const mirror = new THREE.Group()
  mirror.scale.y = -1
  scene.add(marsh, mirror)
  const dimmed = (m: THREE.ShaderMaterial) => {
    const c = m.clone()
    for (const [k, v] of Object.entries(m.uniforms)) c.uniforms[k] = k in shared ? v : { value: v.value }
    c.uniforms.uDim = { value: 0.4 }
    return c
  }
  const grove = groveGeometry(small ? 0.45 : 0.75)
  const treeMat = structure(0.13, [0.3, 0.5, 1])
  const gateMat = structure(0.14, [0.3, 0.5, 1])
  const mossMat = new THREE.ShaderMaterial({
    vertexShader: GL.MOSS_VERT,
    fragmentShader: GL.MOSS_FRAG,
    side: THREE.DoubleSide,
    uniforms: { ...shared, uTime: { value: 0 }, uWidth: { value: 0.032 }, uMoss: { value: srgb('#a9a88c') }, uReveal: { value: 0 }, uDim: { value: 1 }, uFog: { value: 0.02 } },
  })
  const mossGeo = mossGeometry(grove.strands)
  const swampGate = swampGateGeometry()
  const marshMats: THREE.ShaderMaterial[] = [treeMat, gateMat, mossMat]
  const solid = (geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial, parent: THREE.Group, x = 0, z = 0, ry = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, 0, z)
    m.rotation.y = ry
    m.frustumCulled = false
    parent.add(m)
    return m
  }
  for (const [parent, dim] of [
    [marsh, false],
    [mirror, true],
  ] as const) {
    const tm = dim ? dimmed(treeMat) : treeMat
    const gm = dim ? dimmed(gateMat) : gateMat
    if (dim) marshMats.push(tm, gm)
    solid(grove.trees, tm, parent)
    solid(swampGate, gm, parent, 1.8, -8, -0.15)
    if (!dim) solid(mossGeo, mossMat, parent) // the moss's reflection would hardly show; not worth drawing
  }
  const waterMat = new THREE.ShaderMaterial({
    vertexShader: GL.SURFACE_VERT,
    fragmentShader: GL.WATER_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: { ...shared, uTime: { value: 0 }, uReveal: { value: 0 } },
  })
  const water = new THREE.Mesh(new THREE.PlaneGeometry(160, 100), waterMat)
  water.rotation.x = -Math.PI / 2
  water.position.set(0, 0.02, -45)
  marsh.add(water)
  marshMats.push(waterMat)
  for (const [i, y] of [0.25, 0.8].entries()) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: GL.SURFACE_VERT,
      fragmentShader: GL.MIST_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: { ...shared, uTime: { value: 0 }, uReveal: { value: 0 }, uSeed: { value: i * 17.3 } },
    })
    const mist = new THREE.Mesh(new THREE.PlaneGeometry(140, 80), mat)
    mist.rotation.x = -Math.PI / 2
    mist.position.set(0, y, -36)
    mist.renderOrder = 2
    marsh.add(mist)
    marshMats.push(mat)
  }
  marsh.visible = mirror.visible = false

  // ruins of something nobody could name, far off in the field
  const ruin = new THREE.Group()
  ruin.rotation.y = 0.7 // turned toward the path
  scene.add(ruin)
  const wallMat = structure(0.2, [0.6, 0.45, 0.7])
  ruin.add(new THREE.Mesh(ruinGeometry(), wallMat))

  // the writing table and its pages
  const desk = new THREE.Group()
  scene.add(desk)
  const deskMat = structure(0.08, [0.4, 0.5, 1])
  desk.add(new THREE.Mesh(tableGeometry(), deskMat))
  const pageGeo = pageGeometry()
  const flying = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(pageGeo, deskMat)
    desk.add(m)
    return m
  })

  // the barn and silo far beyond the fence, and the laundry on its line
  const barn = thing(barnGeometry(), structure(0.32, [-0.6, 0.45, 0.65], FARM))
  barn.rotation.y = -Math.PI / 2 + 0.55 // its gable end turned to the path
  const silo = thing(siloGeometry(), structure(0.25, [-0.6, 0.45, 0.65]))
  const laundry = new THREE.Group()
  laundry.rotation.y = 0.2
  scene.add(laundry)
  const line = clotheslineGeometry()
  const lineMat = structure(0.05, [0, 0.5, 1])
  laundry.add(new THREE.Mesh(line.frame, lineMat))
  const clothMat = new THREE.ShaderMaterial({
    vertexShader: GL.CLOTH_VERT,
    fragmentShader: GL.CLOTH_FRAG,
    side: THREE.DoubleSide,
    uniforms: { ...shared, uTime: { value: 0 }, uReveal: { value: 0 }, uFog: { value: 0.012 } },
  })
  laundry.add(new THREE.Mesh(line.cloth, clothMat))
  let laundryZ = -1e4

  // the cornfield: built once its stretch of the walk is known
  const cornMat = (vert: string) =>
    new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: GL.CORN_FRAG,
      side: THREE.DoubleSide,
      uniforms: { ...shared, uTime: { value: 0 }, uReveal: { value: 0 }, uLo: { value: srgb('#6a5734') }, uHi: { value: srgb('#d8c08a') }, uPaper: { value: paper } },
    })
  const stalkMat = cornMat(GL.CORN_STALK_VERT)
  const leafMat = cornMat(GL.CORN_LEAF_VERT)
  const cornStalks = new THREE.Mesh(new THREE.InstancedBufferGeometry(), stalkMat)
  const cornLeaves = new THREE.Mesh(new THREE.InstancedBufferGeometry(), leafMat)
  for (const m of [cornStalks, cornLeaves]) {
    m.frustumCulled = false
    m.visible = false
    scene.add(m)
  }
  let cornNear = -1e4
  let cornFar = -1e4
  let wallZ = -1e4
  let tableZ = -1e4
  const TABLE_X = -3.2
  const LAUNDRY_X = -10.6 // where the line starts; it runs 4.9 to the right, ending 5.7 left of the path

  const plaqueGeo = new THREE.PlaneGeometry(0.8, 0.4)
  let plaques: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = []
  const targets = new Map<string, THREE.Vector3>()

  // ---- camera, light, input ----
  let scroll = 0
  let spec: WorldLayout = {
    diveEnd: window.innerHeight,
    chapel: window.innerHeight * 5,
    fence: { from: 0, to: 0, posts: [] },
    house: window.innerHeight * 12,
    corn: { from: 0, to: 0 },
    table: window.innerHeight * 16,
    marsh: window.innerHeight * 20,
    shots: [],
  }
  let chapelZ = -1e4
  let fenceNear = -1e4
  let fenceFar = -1e4
  let houseZ = -1e4
  let shoreZ = -1e4
  let W = window.innerWidth
  let H = window.innerHeight
  const light = { x: W * 0.38, y: H * 0.62, tx: W * 0.38, ty: H * 0.62 }
  let lastMove = -1e9
  let flashAtMs = -1e9
  let yawNow = 0
  let pitchNow = 0
  const tmp = new THREE.Vector3()
  const look = new THREE.Vector3()

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return
    light.tx = e.clientX
    light.ty = e.clientY
    lastMove = performance.now()
  })
  // on a touch screen, a tap moves the light there for a while
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return
    light.tx = e.clientX
    light.ty = e.clientY
    lastMove = performance.now()
  })
  document.documentElement.addEventListener('pointerleave', () => {
    lastMove = -1e9
  })

  const halfFov = () => Math.tan(degToRad(camera.fov / 2))
  // the horizon where the first design had it: 60% down (68% on narrow screens)
  const heroPitch = () => Math.atan((2 * (W < 600 ? 0.68 : 0.6) - 1) * halfFov())

  /**
   * Where to look: a blend of the shots near the current scroll, each turning
   * toward its place and then off to the side, so the place sits opposite its
   * card. Far from every shot, straight ahead along the path.
   */
  function direct(s: number, x: number, y: number, z: number) {
    const shift = W >= 760 ? Math.atan(0.36 * halfFov() * camera.aspect) : 0 // phones: no sideways framing
    const lift = W >= 760 ? 0 : Math.atan(0.42 * halfFov()) // phones: the cards sit low, so the place goes up
    const sigma = 0.45 * H
    let yaw = 0
    let pitch = 0
    let wsum = 0.035
    let focus: THREE.Vector3 | null = null
    let best = 0
    for (const sh of spec.shots) {
      const p = targets.get(sh.target)
      if (!p) continue
      const dz = z - p.z
      if (dz < 1.5) continue // passed it
      const w = Math.exp(-(((s - sh.at) / sigma) ** 2)) * smoothstep(dz, 1.5, 6)
      if (w < 1e-3) continue
      yaw += w * (Math.atan2(p.x - x, dz) - (sh.card === 'left' ? 1 : -1) * shift)
      pitch += w * (Math.atan2(p.y - y, Math.hypot(dz, p.x - x)) * 0.35 - lift)
      wsum += w
      if (w > best) {
        best = w
        focus = p
      }
    }
    return { yaw: yaw / wsum, pitch: pitch / wsum, focus: (best > 0.3 ? focus : null) as THREE.Vector3 | null }
  }

  // how much of a place shows: none before the dive, then fading in from far away
  const reveal = (after: number, dz: number, from = 100, to = 72) => after * (1 - smoothstep(dz, to, from))

  function place(now: number) {
    const s = opts.reducedMotion ? 0 : scroll
    const t = opts.reducedMotion ? 0 : now / 1000
    const u = THREE.MathUtils.clamp(s / Math.max(1, spec.diveEnd), 0, 1)
    const dip = Math.sin(Math.PI * u) ** 2 // down into the grass and up again
    const after = smoothstep(u, 0.62, 1)
    const z = -s * K
    const dc = z - chapelZ
    const swing = -5.6 * (1 - smoothstep(dc, 2, 22)) * smoothstep(dc, -22, -12) // out round the church, past its far end, and back
    const x = Math.sin(z * 0.05) * 0.35 + swing
    const bankUp = smoothstep(s, spec.marsh - 1.4 * H, spec.marsh) // up onto the bank, to see over the reeds to the water
    const y = lerp(1.75, 1.45, smoothstep(u, 0.45, 1)) - 1.0 * dip + 0.85 * bankUp + Math.sin(t * 1.3) * 0.012
    camera.position.set(x, y, z)

    const d = direct(s, x, y, z)
    const wantYaw = d.yaw * after
    const wantPitch = lerp(heroPitch(), -0.025 + d.pitch - 0.11 * bankUp, smoothstep(u, 0.25, 1)) + 0.05 * dip
    yawNow = opts.reducedMotion ? wantYaw : yawNow + (wantYaw - yawNow) * 0.06
    pitchNow = opts.reducedMotion || u < 1 ? wantPitch : pitchNow + (wantPitch - pitchNow) * 0.06
    look.set(x + Math.sin(yawNow), y + Math.sin(pitchNow), z - Math.cos(yawNow))
    camera.lookAt(look)
    camera.updateMatrixWorld()

    // the light: the pointer, or a slow search of the field when the pointer rests
    if (!opts.reducedMotion && now - lastMove > 2600) {
      light.tx = W * (0.5 + 0.32 * Math.sin(t * 0.23))
      light.ty = H * (0.66 + 0.1 * Math.sin(t * 0.31 + 1.3))
      if (d.focus && after > 0.5) {
        // drift over the place being read now and then
        tmp.copy(d.focus).project(camera)
        if (Math.abs(tmp.x) < 1 && Math.abs(tmp.y) < 1) {
          light.tx = lerp(light.tx, ((tmp.x + 1) / 2) * W, 0.5)
          light.ty = lerp(light.ty, ((1 - tmp.y) / 2) * H, 0.5)
        }
      }
    }
    const k = opts.reducedMotion ? 1 : 0.12
    light.x += (light.tx - light.x) * k
    light.y += (light.ty - light.y) * k
    shared.uLightPx.value.set(light.x * ratio, (H - light.y) * ratio)
    shared.uR.value = 0.42 * Math.max(W, H) * ratio
    shared.uFlash.value = opts.reducedMotion ? 0 : Math.exp(-(now - flashAtMs) / 260)
    shared.uGrainT.value = (Math.floor(t * 24) * 37.17) % 997

    tmp.set(x + Math.sin(yawNow) * 1000, y, z - Math.cos(yawNow) * 1000).project(camera)
    shared.uHorizon.value = ((tmp.y + 1) / 2) * H * ratio
    shared.uSpan.value = 0.22 * H * ratio

    grassMat.uniforms.uTime.value = t
    grassMat.uniforms.uCamZ.value = z
    ground.position.set(x, 0, z - 60)

    // what shows of each place
    const show = (m: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>, r: number, behind: number) => {
      m.material.uniforms.uReveal.value = r
      m.visible = r > 0.002 && behind < 45
    }
    show(chapel, after, chapelZ - z)
    const toFence = Math.max(0, z - fenceNear)
    const rf = reveal(after, toFence)
    show(fence, rf, fenceFar - z)
    for (const p of plaques) show(p, rf, p.position.z - z)
    const rh = reveal(after, z - houseZ)
    for (const m of [house, shed, tree, gate]) show(m, rh, m.position.z - z)
    // the wall, the table and its drifting pages
    const rw = reveal(after, z - wallZ)
    wallMat.uniforms.uReveal.value = rw
    ruin.visible = rw > 0.002 && wallZ - z < 60
    const rt = reveal(after, z - tableZ)
    desk.visible = rt > 0.002 && tableZ - z < 45
    deskMat.uniforms.uReveal.value = rt
    flying.forEach((pg, i) => {
      const ph = t * 0.35 + i * 2.1
      pg.position.set(0.8 + Math.sin(ph) * 2.2, 1.2 + Math.sin(ph * 1.7) * 0.45, Math.cos(ph * 0.8) * 1.6)
      pg.rotation.set(Math.sin(t * 2.3 + i) * 0.9, t * 0.8 + i, Math.cos(t * 1.9 + i) * 0.8)
    })
    // the barn and silo, the laundry blowing on its line
    const rb = reveal(after, z - barn.position.z, 70, 50) // only once the church is behind
    show(barn, rb, barn.position.z - z)
    show(silo, rb, silo.position.z - z)
    const rl = reveal(after, z - laundryZ)
    lineMat.uniforms.uReveal.value = rl
    clothMat.uniforms.uReveal.value = rl
    clothMat.uniforms.uTime.value = t
    laundry.visible = rl > 0.002 && laundryZ - z < 45
    // the corn
    const rc = reveal(after, Math.max(0, z - cornNear), 80, 55)
    for (const m of [stalkMat, leafMat]) {
      m.uniforms.uReveal.value = rc
      m.uniforms.uTime.value = t
    }
    cornStalks.visible = cornLeaves.visible = rc > 0.002 && cornFar - z < 30
    // inside the corn half the grass is hidden under it anyway: skip drawing it, thinning gradually
    const inCorn = smoothstep(z, cornFar - 6, cornFar + 2) * (1 - smoothstep(z, cornNear - 2, cornNear + 6))
    grassGeo.instanceCount = Math.round(N * (ratio <= 0.75 ? 0.6 : 1) * (1 - 0.5 * inCorn))
    const rm = reveal(after, z - shoreZ, 48, 30)
    for (const m of marshMats) {
      m.uniforms.uReveal.value = rm
      if (m.uniforms.uTime) m.uniforms.uTime.value = t
    }
    marsh.visible = rm > 0.002
    mirror.visible = rm > 0.002 && z - shoreZ < 45 // reflections only matter by the water
    opts.onFrame?.({ x: light.x, y: light.y, flash: shared.uFlash.value })
  }

  function render(now: number) {
    place(now)
    renderer.render(scene, camera)
  }

  function resize() {
    W = window.innerWidth
    H = window.innerHeight
    renderer.setSize(W, H, false)
    camera.aspect = W / H
    camera.updateProjectionMatrix()
    if (opts.reducedMotion) render(performance.now())
  }
  window.addEventListener('resize', resize)
  resize()

  // ---- loop; the resolution follows the machine (down when frames are slow, back up when there is room) ----
  const maxRatio = ratio
  let raf = 0
  let last = performance.now()
  let avg = 16
  let checked = performance.now()
  let slow = 0
  let quick = 0
  let lastDrop = -1e9
  const setRatio = (r: number) => {
    ratio = r
    renderer.setPixelRatio(r)
    resize()
  }
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    render(now)
    avg += (Math.min(100, now - last) - avg) * 0.05
    last = now
    if (now - checked > 1000) {
      checked = now
      // a 60 Hz screen never goes below 16.7 ms a frame, so "keeping up" means staying near that
      slow = avg > 24 ? slow + 1 : 0
      quick = avg < 17.5 ? quick + 1 : 0
      if (slow >= 2 && ratio > 0.75) {
        setRatio(Math.max(0.75, ratio - 0.25))
        slow = 0
        lastDrop = now
      } else if (quick >= 5 && ratio < maxRatio && now - lastDrop > 20000) {
        setRatio(Math.min(maxRatio, ratio + 0.25))
        quick = 0
      }
    }
  }
  if (opts.reducedMotion) render(performance.now())
  else raf = requestAnimationFrame(loop)
  document.addEventListener('visibilitychange', () => {
    if (opts.reducedMotion) return
    if (document.hidden) {
      cancelAnimationFrame(raf)
      raf = 0
    } else if (!raf) {
      last = performance.now()
      checked = last
      raf = requestAnimationFrame(loop)
    }
  })

  return {
    layout(next) {
      spec = next
      targets.clear()
      // the church stands 4 units ahead when the last highlight is read
      chapelZ = -(next.chapel * K) - 4
      chapel.position.set(0, 0, chapelZ)
      targets.set('chapel', new THREE.Vector3(0, 4.5, chapelZ - 2))

      // the fence runs the length of the experience section; each job's post stands 5.5 units ahead of its card
      fenceNear = -(next.fence.from * K) - 2
      fenceFar = -(next.fence.to * K) - 16
      const jobs = next.fence.posts.map((p) => -(p.at * K) - 5.5)
      fence.geometry.dispose()
      fence.geometry = fenceGeometry(fenceNear, fenceFar, jobs)
      fence.position.set(FENCE_X, 0, 0)
      grassMat.uniforms.uReed.value.set(fenceNear, fenceFar, FENCE_X + 0.15, next.fence.posts.length ? 1 : 0)
      for (const p of plaques) {
        scene.remove(p)
        p.material.uniforms.uMap.value?.dispose()
        p.material.dispose()
      }
      plaques = next.fence.posts.map((p, i) => {
        const m = new THREE.Mesh(
          plaqueGeo,
          new THREE.ShaderMaterial({
            vertexShader: GL.SURFACE_VERT,
            fragmentShader: GL.PLAQUE_FRAG,
            uniforms: { ...shared, uMap: { value: plaqueTexture(p.label, 7 + i) }, uReveal: { value: 0 }, uFog: { value: 0.012 } },
          }),
        )
        m.position.set(FENCE_X - 0.082, 1.45, jobs[i] + 0.076) // on the post's turned face
        m.rotation.y = -Math.PI / 2 + 0.75 // nailed on askew, turned toward whoever walks up the path
        m.visible = false
        scene.add(m)
        targets.set(`post:${i}`, new THREE.Vector3(FENCE_X, 1.3, jobs[i]))
        return m
      })

      // the farm: the house 9 units ahead when the last education card is read
      houseZ = -(next.house * K) - 9
      house.position.set(HOUSE_X, 0, houseZ)
      tree.position.set(2.6, 0, houseZ + 7) // across the path from the house, its branches overhead
      gate.position.set(-3.3, 0, houseZ + 5)
      shed.position.set(-4.4, 0, houseZ - 7.5)
      targets.set('house', new THREE.Vector3(HOUSE_X + 2.4, 3.6, houseZ)) // framed on a point right of the house, so the house sits further left
      // the ruins stand far off on the left, well away from the church, before it
      wallZ = chapelZ + 8
      ruin.position.set(-28, 0, wallZ)
      // the table stands 4.6 units ahead, on the left, when the writing card is read; the grass is trodden round it
      tableZ = -(next.table * K) - 4.6
      desk.position.set(TABLE_X, 0, tableZ)
      targets.set('table', new THREE.Vector3(TABLE_X + 1.0, 1.0, tableZ)) // framed on a point right of the table, so the table sits further left, clear of the card
      grassMat.uniforms.uClear.value.set(TABLE_X + 0.4, tableZ, 3.2)
      // the laundry on the near side of the fence, well left of the path so it is not in front of the farmhouse
      // seen beyond it, between the tutor's post and the volunteer's; the grass trodden round the middle of the line
      laundryZ = (jobs[1] ?? fenceNear - 20) - 9.5
      laundry.position.set(LAUNDRY_X, 0, laundryZ)
      grassMat.uniforms.uClear2.value.set(LAUNDRY_X + 2.45, laundryZ - 0.5, 3.2)
      // the barn and silo stand far off behind the fence, in the reeds
      barn.position.set(24, 0, fenceNear - 38)
      silo.position.set(30.5, 0, fenceNear - 45)
      // the marsh: the walk ends at the water's edge
      shoreZ = -(next.marsh * K) - 1.5
      marsh.position.set(0, 0, shoreZ)
      mirror.position.set(0, 0, shoreZ)
      shared.uShore.value.set(shoreZ, 1)
      targets.set('gate', new THREE.Vector3(1.8, 1.8, shoreZ - 8))
      // the corn: rows either side of a trodden path, for the length of languages and skills
      // between the church and the fence: not before the camera has swung back from round the church
      cornNear = Math.min(-(next.corn.from * K) - 2, chapelZ - 24)
      cornFar = Math.max(-(next.corn.to * K) - 4, fenceNear + 4)
      if (next.corn.to > next.corn.from) {
        // on the right the field comes forward to just behind the church (the camera swings round it on the left), at most 15 units
        const besideZ = cornNear + THREE.MathUtils.clamp(chapelZ - 9 - cornNear, 0, 15)
        const corn = cornGeometry(cornNear, cornFar, small ? 0.5 : 1, small ? 40 : 70, besideZ)
        cornStalks.geometry.dispose()
        cornLeaves.geometry.dispose()
        cornStalks.geometry = corn.stalks
        cornLeaves.geometry = corn.leaves
        grassMat.uniforms.uPath.value.set(cornNear + 2, cornFar - 2, 1.0)
      }
      grassMat.uniforms.uYard.value.set(houseZ + 12, houseZ - 9, -3.4, next.shots.some((x) => x.target === 'house') ? 1 : 0)

      if (opts.reducedMotion) render(performance.now())
    },
    setScroll(y) {
      scroll = y
    },
    flash() {
      if (!opts.reducedMotion) flashAtMs = performance.now()
    },

  }
}
