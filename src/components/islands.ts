import { el } from '../lib/dom'

/**
 * Islands of light (after the reference site): organic blobs that slowly
 * morph and drift on the black page; where two overlap they add up like light
 * (screen blending). Every island is a real <button>; choosing one shows its
 * full entry in the panel below. The blob drawing is decorative (aria-hidden).
 * Reduced motion: the blobs stand still.
 */
export interface IslandItem {
  id: string
  kicker: string
  title: string
  detail: () => Node[]
}

// layout on wide screens: centre (in % of the stage) and relative size
const SLOTS = [
  { x: 17, y: 30, s: 1.15 },
  { x: 47, y: 22, s: 1.0 },
  { x: 79, y: 33, s: 1.12 },
  { x: 27, y: 74, s: 0.98 },
  { x: 58, y: 70, s: 1.18 },
  { x: 86, y: 78, s: 0.92 },
]

function blobPath(seed: number[], t: number, amp: number): string {
  const N = 40
  const pts: [number, number][] = []
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    const r =
      100 *
      (1 +
        amp *
          (0.55 * Math.sin(2 * a + seed[0] + t * seed[3]) +
            0.3 * Math.sin(3 * a + seed[1] - t * seed[4]) +
            0.15 * Math.sin(5 * a + seed[2] + t * seed[5])))
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  // closed Catmull-Rom spline as cubic Béziers
  const f = (n: number) => n.toFixed(1)
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % N]
    const p3 = pts[(i + 2) % N]
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`
  }
  return `${d}Z`
}

export function mountIslands(root: HTMLElement, items: IslandItem[], opts: { reducedMotion: boolean }): void {
  const stage = el('div', { class: 'islands__stage' })
  const panel = el('div', { class: 'islands__detail', id: 'island-detail', 'aria-live': 'polite' })
  root.classList.add('islands')
  root.replaceChildren(stage, panel)

  const islands = items.slice(0, SLOTS.length).map((item, i) => {
    const slot = SLOTS[i]
    const seed = [i * 1.7, i * 2.9 + 1, i * 0.7 + 2, 0.35 + (i % 3) * 0.08, 0.28 + (i % 2) * 0.1, 0.5 + (i % 4) * 0.07]
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', blobPath(seed, 0, 0.09))
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '-112 -112 224 224')
    svg.setAttribute('class', 'island__blob')
    svg.setAttribute('aria-hidden', 'true')
    svg.append(path)
    const btn = el('button', { class: 'island', type: 'button', 'aria-pressed': 'false', 'aria-controls': 'island-detail' }, [
      svg,
      el('span', { class: 'island__kicker', text: item.kicker }),
      el('span', { class: 'island__title', text: item.title }),
    ])
    btn.style.setProperty('--x', `${slot.x}%`)
    btn.style.setProperty('--y', `${slot.y}%`)
    btn.style.setProperty('--s', String(slot.s))
    btn.addEventListener('click', () => select(i))
    stage.append(btn)
    return { item, btn, path, seed, hover: 0 }
  })

  for (const isl of islands) {
    isl.btn.addEventListener('pointerenter', () => (isl.hover = 1))
    isl.btn.addEventListener('pointerleave', () => (isl.hover = 0))
    isl.btn.addEventListener('focus', () => (isl.hover = 1))
    isl.btn.addEventListener('blur', () => (isl.hover = 0))
  }

  function select(i: number) {
    islands.forEach((isl, k) => isl.btn.setAttribute('aria-pressed', String(k === i)))
    const { item } = islands[i]
    panel.replaceChildren(
      el('p', { class: 'label', text: item.kicker }),
      el('h3', { class: 'islands__heading', text: item.title }),
      ...item.detail(),
    )
  }
  select(0)

  if (opts.reducedMotion) return
  let raf = 0
  const amps = islands.map(() => 0.09)
  const loop = (now: number) => {
    const t = now / 1000
    islands.forEach((isl, i) => {
      amps[i] += ((isl.hover ? 0.14 : 0.09) - amps[i]) * 0.08
      isl.path.setAttribute('d', blobPath(isl.seed, t, amps[i]))
      const dx = Math.sin(t * (0.21 + i * 0.03) + i) * 14
      const dy = Math.cos(t * (0.17 + i * 0.025) + i * 2) * 10
      isl.btn.style.setProperty('--dx', `${dx.toFixed(1)}px`)
      isl.btn.style.setProperty('--dy', `${dy.toFixed(1)}px`)
    })
    raf = requestAnimationFrame(loop)
  }
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !raf) raf = requestAnimationFrame(loop)
    else if (!entry.isIntersecting && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }).observe(stage)
}
