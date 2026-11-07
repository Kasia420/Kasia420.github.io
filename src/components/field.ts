/**
 * The night field: straw-coloured stalks under a black sky, drawn on a canvas.
 *
 * The pointer is a flashlight. A click fires a camera flash that overexposes
 * the field and fades, like a night-flash photograph. On touch screens, and
 * whenever the pointer rests, the light drifts by itself. With reduced motion
 * the field is one still frame: no sway, no drift, no flash.
 *
 * Everything is generated in code (no photographs), from a fixed seed, so the
 * field looks the same on every visit.
 */
export interface Field {
  flash(): void
}

interface Stalk {
  x: number
  y: number
  z: number // 0 far … 1 near
  h: number
  w: number
  rgb: [number, number, number]
  phase: number
  amp: number
  head: boolean
}

const PAPER: [number, number, number] = [246, 241, 231]
const STRAW_DARK: [number, number, number] = [107, 90, 53]
const BONE_WARM: [number, number, number] = [217, 199, 161]

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

export function mountField(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  opts: { reducedMotion: boolean; onLight?: (x: number, y: number, flash: number) => void },
): Field {
  const ctx = canvas.getContext('2d')
  let W = 0
  let H = 0
  let horizon = 0
  let stalks: Stalk[] = []
  const light = { x: 0, y: 0, tx: 0, ty: 0 }
  let lastMove = -1e9
  let flashAt = -1e9
  let raf = 0
  let visible = true

  function build() {
    W = host.clientWidth || 1200
    H = host.clientHeight || 720
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    horizon = H * (W < 600 ? 0.68 : 0.6) // phones: keep the text in the sky
    const r = mulberry32(11)
    const n = Math.round(Math.min(1500, Math.max(420, W * 1.15)))
    stalks = Array.from({ length: n }, (): Stalk => {
      const z = r() ** 0.8
      return {
        x: r() * (W + 40) - 20,
        y: horizon + z ** 1.7 * (H - horizon) + (r() - 0.5) * 6,
        z,
        h: (18 + 150 * z ** 1.25) * (0.7 + r() * 0.6),
        w: 0.5 + 1.9 * z,
        rgb: mix(STRAW_DARK, BONE_WARM, r()),
        phase: r() * Math.PI * 2,
        amp: 0.08 + r() * 0.12,
        head: r() < 0.38,
      }
    }).sort((a, b) => a.z - b.z)
    if (!light.x) {
      light.x = light.tx = W * 0.38
      light.y = light.ty = H * 0.62
    }
  }

  function frame(now: number) {
    if (!ctx) return
    const t = opts.reducedMotion ? 0 : now / 1000
    if (!opts.reducedMotion && now - lastMove > 2600) {
      // idle or touch: the light searches the field on its own
      light.tx = W * (0.5 + 0.32 * Math.sin(t * 0.23))
      light.ty = H * (0.66 + 0.1 * Math.sin(t * 0.31 + 1.3))
    }
    light.x += (light.tx - light.x) * 0.12
    light.y += (light.ty - light.y) * 0.12
    const flash = opts.reducedMotion ? 0 : Math.exp(-(now - flashAt) / 260)

    ctx.clearRect(0, 0, W, H)
    // a faint glow along the horizon
    const sky = ctx.createLinearGradient(0, horizon - H * 0.25, 0, horizon)
    sky.addColorStop(0, 'rgba(201,173,106,0)')
    sky.addColorStop(1, `rgba(201,173,106,${0.035 + flash * 0.18})`)
    ctx.fillStyle = sky
    ctx.fillRect(0, horizon - H * 0.25, W, H * 0.25)
    // the pool of light on the ground
    const R = Math.max(W, H) * 0.42
    const pool = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, R)
    pool.addColorStop(0, `rgba(201,173,106,${0.1 + flash * 0.2})`)
    pool.addColorStop(1, 'rgba(201,173,106,0)')
    ctx.fillStyle = pool
    ctx.fillRect(0, horizon, W, H - horizon)

    ctx.lineCap = 'round'
    for (const s of stalks) {
      const d = Math.hypot(s.x - light.x, (s.y - s.h * 0.5 - light.y) * 1.25) / R
      const lit = Math.max(0, 1 - d) ** 1.6
      const b = Math.min(1.3, 0.05 + lit * 1.05 + flash * (0.9 + 0.3 * s.z))
      if (b < 0.03) continue
      const over = Math.min(1, Math.max(0, b - 0.9) * 2.2) // overexposed toward paper white
      const c = mix([s.rgb[0] * b, s.rgb[1] * b, s.rgb[2] * b], PAPER, over)
      const colour = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
      const sway = Math.sin(t * 1.1 + s.phase + s.x * 0.004) * s.amp + Math.sin(t * 0.37 + s.x * 0.0015) * 0.08
      const tipX = s.x + sway * s.h
      const tipY = s.y - s.h
      ctx.strokeStyle = colour
      ctx.lineWidth = s.w
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.quadraticCurveTo(s.x + sway * s.h * 0.35, s.y - s.h * 0.55, tipX, tipY)
      ctx.stroke()
      if (s.head) {
        ctx.fillStyle = colour
        ctx.beginPath()
        ctx.ellipse(tipX, tipY + s.w * 2, s.w * 1.5, s.w * 4.2, sway * 0.9, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    opts.onLight?.(light.x, light.y, flash)
  }

  const loop = (now: number) => {
    frame(now)
    raf = requestAnimationFrame(loop)
  }
  const start = () => {
    if (!raf && visible && !opts.reducedMotion) raf = requestAnimationFrame(loop)
  }
  const stop = () => {
    cancelAnimationFrame(raf)
    raf = 0
  }

  host.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return
    const rect = host.getBoundingClientRect()
    light.tx = e.clientX - rect.left
    light.ty = e.clientY - rect.top
    lastMove = performance.now()
  })
  host.addEventListener('pointerleave', () => {
    lastMove = -1e9
  })

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) start()
    else stop()
  }).observe(host)

  let pending = 0
  new ResizeObserver(() => {
    cancelAnimationFrame(pending)
    pending = requestAnimationFrame(() => {
      build()
      if (opts.reducedMotion) frame(0)
    })
  }).observe(host)

  build()
  if (opts.reducedMotion) frame(0)
  else start()

  return {
    flash() {
      if (opts.reducedMotion) return
      flashAt = performance.now()
      host.classList.remove('is-flash')
      void host.offsetWidth // restart the CSS flash
      host.classList.add('is-flash')
    },
  }
}
