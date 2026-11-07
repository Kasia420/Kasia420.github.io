import '@fontsource/cormorant-garamond/300.css'
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/400-italic.css'
import '@fontsource/courier-prime/400.css'
import 'lenis/dist/lenis.css'
import '../styles/tokens.css'
import '../styles/base.css'
import './design.css'

import Lenis from 'lenis'
import { bullets, extLink, mountCertificates, mountLanguages, mountPublications, mountSkills } from '../components/entries'
import { mountField, type Field } from '../components/field'
import { email, link, profile } from '../lib/content'
import { el } from '../lib/dom'
import { createWorld, type Shot } from '../scene/world'

const html = document.documentElement

// ---- motion: on, unless the system asks for less or the visitor switched it off (the switch remembers) ----
const MOTION_KEY = 'kasia-cv:motion'
const SCROLL_KEY = 'kasia-cv:scroll' // where the visitor was when they switched, so the reload comes back there
type Kind = 'local' | 'session'
const read = (kind: Kind, key: string): string | null => {
  try {
    return (kind === 'local' ? localStorage : sessionStorage).getItem(key)
  } catch {
    return null // storage blocked (private window, strict settings): the URL carries the choice instead
  }
}
const write = (kind: Kind, key: string, value: string | null): boolean => {
  try {
    const s = kind === 'local' ? localStorage : sessionStorage
    if (value === null) s.removeItem(key)
    else s.setItem(key, value)
    return true
  } catch {
    return false
  }
}
const choice = new URLSearchParams(location.search).get('motion') ?? read('local', MOTION_KEY)
const reducedMotion = choice === 'reduced' || (choice !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches)
if (reducedMotion) html.dataset.motion = 'reduced'
const savedY = read('session', SCROLL_KEY)
write('session', SCROLL_KEY, null)

const $ = <T extends Element = HTMLElement>(sel: string): T => {
  const n = document.querySelector<T>(sel)
  if (!n) throw new Error(`design: missing ${sel}`)
  return n
}
const need = <T extends { id: string }>(list: T[], id: string): T => {
  const hit = list.find((x) => x.id === id)
  if (!hit) throw new Error(`profile.json: no "${id}"`)
  return hit
}
const note = (text?: string) => (text ? [el('p', { class: 'entry__note', text })] : [])

// ---- the motion switch (the typeface switch of the review page lives in review.ts) ----
const motionBtn = $<HTMLButtonElement>('#motion-toggle')
motionBtn.textContent = reducedMotion ? 'Motion: off' : 'Motion: on'
motionBtn.addEventListener('click', () => {
  const next = reducedMotion ? 'full' : 'reduced'
  const params = new URLSearchParams(location.search)
  write('session', SCROLL_KEY, String(Math.round(window.scrollY)))
  if (write('local', MOTION_KEY, next)) params.delete('motion')
  else params.set('motion', next)
  const q = params.toString()
  const url = `${location.pathname}${q ? `?${q}` : ''}${location.hash}`
  if (url === `${location.pathname}${location.search}${location.hash}`) location.reload()
  else location.replace(url)
})

// ---- hero: the field, the name, one line ----
const p = profile.person
const heroName = $('#hero-name')
heroName.textContent = p.name
$('#hero-line').textContent = `${p.hook.split(':')[0]}.` // the opening words of her About, verbatim
$<HTMLAnchorElement>('#nav-lit').href = link('lost_in_translation_site')

// ---- highlights, read while walking toward the chapel ----
interface Stop {
  id: string
  kicker: string
  title: string
  meta?: string
  summary: string
  featured?: boolean
  actions?: () => HTMLElement[]
  more?: () => HTMLElement[]
}
const sp = need(profile.projects, 'speakleash')
const lit = need(profile.projects, 'lost-in-translation')
const ma = need(profile.projects, 'ma-thesis')
const gen = need(profile.certifications, 'cambridge-genai')
const langs = profile.languages.filter((l) => l.tier === 1)
const hiSkills = profile.skills.highlight_for_target_roles
const stops: Stop[] = [
  {
    id: lit.id,
    featured: true,
    kicker: 'Featured project',
    title: lit.title,
    summary: lit.linkedin_note ?? '',
    actions: () => [
      el('a', { class: 'btn', href: link('lost_in_translation_site'), target: '_blank', rel: 'noopener', text: "Open the project's site ↗" }),
      el('p', { class: 'links' }, [extLink('Repository', link('lost_in_translation_repo')), ' · ', extLink('Report', link('lost_in_translation_report'))]),
    ],
    more: () => [el('p', { class: 'entry__meta', text: lit.kind ?? '' }), ...bullets(lit.bullets_cv)],
  },
  {
    id: sp.id,
    kicker: sp.dates ?? '',
    title: sp.title,
    meta: sp.org,
    summary: sp.bullets?.[0] ?? '',
    more: () => [...bullets(sp.bullets?.slice(1)), ...note(sp.linkedin_note)],
  },
  { id: ma.id, kicker: 'In progress', title: 'MA thesis', summary: ma.linkedin_note ?? '', more: () => bullets(ma.bullets) },
  {
    id: gen.id,
    kicker: `Certificate · ${gen.date}`,
    title: gen.title,
    meta: gen.issuer,
    summary: gen.note_linkedin ?? '',
    actions: () => [el('p', { class: 'links' }, [extLink('Show credential', gen.credential)])],
  },
  {
    id: 'languages-stop',
    kicker: 'Languages',
    title: langs.map((l) => l.name).join(' · '),
    summary: langs.map((l) => `${l.name} ${l.cv}`).join(' · '),
    more: () => [el('ul', { class: 'entry__bullets' }, langs.map((l) => el('li', { text: `${l.name}: ${l.linkedin}` })))],
  },
  {
    id: 'skills-stop',
    kicker: 'Skills',
    title: hiSkills[0],
    summary: hiSkills.slice(1, 5).join(' · '),
    more: () => [el('ul', { class: 'entry__bullets' }, hiSkills.map((s) => el('li', { text: s })))],
  },
]
$('#stops').replaceChildren(
  ...stops.map((s, i) => {
    const extra: HTMLElement[] = []
    if (s.more) {
      const details = el('div', { class: 'stop__more', id: `more-${s.id}`, hidden: '' }, s.more())
      const btn = el('button', { class: 'stop__toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': `more-${s.id}`, text: 'More' })
      btn.addEventListener('click', () => {
        const on = details.hidden
        details.hidden = !on
        btn.setAttribute('aria-expanded', String(on))
        btn.textContent = on ? 'Less' : 'More'
        relayoutSoon()
      })
      extra.push(btn, details)
    }
    return el('div', { class: `stop stop--${i % 2 ? 'right' : 'left'}` }, [
      el('article', { class: `card card--stop${s.featured ? ' card--featured' : ''}`, 'aria-labelledby': `t-${s.id}` }, [
        el('p', { class: 'label', text: s.kicker }),
        el('h3', { class: 'card__title', id: `t-${s.id}`, text: s.title }),
        ...(s.meta ? [el('p', { class: 'entry__meta', text: s.meta })] : []),
        el('p', { class: 'card__text', text: s.summary }),
        ...(s.actions?.() ?? []),
        ...extra,
      ]),
    ])
  }),
)

// ---- experience along the fence (cards left, fence right), education at the farm (cards right, farm left) ----
const entryCard = (kicker: string, title: string, meta: string, body: HTMLElement[], tier: number, side: 'left' | 'right') =>
  el('div', { class: `stop stop--${side}` }, [
    el('article', { class: `card card--stop card--entry card--t${tier}` }, [
      el('p', { class: 'label', text: kicker }),
      el('h3', { class: 'card__title', text: title }),
      ...(meta ? [el('p', { class: 'entry__meta', text: meta })] : []),
      ...body,
    ]),
  ])
$('#experience-stops').replaceChildren(
  ...profile.experience.map((e) => entryCard(e.dates ?? '', e.title, [e.org, e.place].filter(Boolean).join(' · '), bullets(e.bullets), e.tier, 'left')),
)
$('#education-stops').replaceChildren(
  ...profile.education.map((e) =>
    entryCard(e.dates, e.degree, e.school, e.activities_linkedin ? [el('p', { class: 'entry__note', text: `Activities: ${e.activities_linkedin}` })] : [], e.tier, 'right'),
  ),
)
/** "Feb 2025 – May 2025" -> "2025", "2020 – 2023" -> "2020–2023": painted on the job's post */
const yearsOf = (dates?: string) => {
  const ys = [...new Set(dates?.match(/\b(?:19|20)\d{2}\b/g) ?? [])]
  return ys.length > 1 ? `${ys[0]}–${ys[ys.length - 1]}` : (ys[0] ?? '')
}

// ---- every other theme of the CV ----
$('#about-text').replaceChildren(...profile.about.paragraphs.map((t) => el('p', { text: t })))
mountCertificates($('#certificates-list'))
mountPublications($('#writing-list'))
mountLanguages($('#languages-list'))
mountSkills($('#skills-list'))
$('#target-roles').textContent = profile.target_roles
$('#contact-links').replaceChildren(
  el('li', {}, [extLink('LinkedIn', link('linkedin'))]),
  el('li', {}, [extLink('GitHub', link('github'))]),
  el('li', {}, [extLink('Lost in Translation', link('lost_in_translation_site'))]),
  el('li', {}, [el('a', { href: `mailto:${email()}`, text: email() })]),
)

// ---- the field ----
const lightName = (x: number, y: number, flash: number) => {
  const r = heroName.getBoundingClientRect()
  heroName.style.setProperty('--lx', `${(x - r.left).toFixed(1)}px`)
  heroName.style.setProperty('--ly', `${(y - r.top).toFixed(1)}px`)
  heroName.style.setProperty('--flash', flash.toFixed(3))
}
const canvas = $<HTMLCanvasElement>('.world')
const world = createWorld(canvas, {
  reducedMotion,
  onFrame: ({ x, y, flash }) => {
    if (window.scrollY < window.innerHeight) lightName(x, y, flash)
  },
})
let field: Field | null = null
if (world) html.classList.add('has-world') // the field draws its own grain
if (!world) {
  // no WebGL: the 2D field of the first design, in the hero only
  canvas.hidden = true
  const host = $('.hero__fallback')
  const c = el('canvas', { class: 'hero__field', 'aria-hidden': 'true' })
  host.append(c)
  field = mountField(host, c, {
    reducedMotion,
    onLight: (x, y, f) => {
      const h = host.getBoundingClientRect()
      lightName(h.left + x, h.top + y, f)
    },
  })
}

function relayout() {
  if (!world) return
  const pageTop = (n: Element) => n.getBoundingClientRect().top + window.scrollY
  const shotsOf = (sel: string, target: (i: number) => string): Shot[] =>
    [...document.querySelectorAll<HTMLElement>(sel)].map((n, i) => {
      const r = n.getBoundingClientRect()
      return {
        at: r.top + window.scrollY + r.height / 2 - window.innerHeight / 2,
        target: target(i),
        card: n.classList.contains('stop--right') ? 'right' : 'left',
      }
    })
  const highlights = shotsOf('#stops .stop', () => 'chapel')
  const jobs = shotsOf('#experience-stops .stop', (i) => `post:${i}`)
  const school = shotsOf('#education-stops .stop', () => 'house')
  const writing = shotsOf('#writing-stop', () => 'table')
  const exp = $('#experience')
  const lang = $('#languages')
  const end = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  world.layout({
    diveEnd: pageTop($('#highlights')),
    chapel: highlights.at(-1)?.at ?? 0,
    fence: {
      from: pageTop(exp) - window.innerHeight * 0.35, // the fence begins as the experience heading comes up, after the corn
      to: pageTop(exp) + exp.offsetHeight,
      posts: jobs.map((j, i) => ({ at: j.at, label: yearsOf(profile.experience[i]?.dates) })),
    },
    house: school.at(-1)?.at ?? 0,
    corn: { from: pageTop(lang) - window.innerHeight * 0.5, to: pageTop(lang) + lang.offsetHeight },
    table: writing[0]?.at ?? 0,
    marsh: end,
    shots: [...highlights, ...jobs, ...school, ...writing, { at: end, target: 'gate', card: 'left' }],
  })
  world.setScroll(window.scrollY)
}
let pending = 0
function relayoutSoon() {
  clearTimeout(pending)
  pending = window.setTimeout(relayout, 150)
}

let lenis: Lenis | null = null
if (!reducedMotion) {
  lenis = new Lenis({ autoRaf: true })
  lenis.on('scroll', (l: Lenis) => world?.setScroll(l.scroll))
} else {
  window.addEventListener('scroll', () => world?.setScroll(window.scrollY), { passive: true })
}
relayout()
void document.fonts.ready.then(() => {
  relayout()
  // back where the visitor was before switching motion
  const y = savedY === null ? NaN : Number(savedY)
  if (!Number.isFinite(y)) return
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true })
  else window.scrollTo(0, y)
})
window.addEventListener('resize', relayoutSoon)

// ---- the camera flash (at most about twice a second) ----
const flashEl = $('.flash')
let lastFlash = -1e9
function flash() {
  if (reducedMotion) return
  const now = performance.now()
  if (now - lastFlash < 450) return
  lastFlash = now
  world?.flash()
  field?.flash()
  flashEl.classList.remove('is-on')
  void flashEl.offsetWidth // restart the animation
  flashEl.classList.add('is-on')
}

// ---- moving through the field: every jump is a walk ----
const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
function travel(target: HTMLElement, dive = false) {
  const y = target.getBoundingClientRect().top + window.scrollY
  const arrive = () => {
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  }
  if (!lenis) {
    window.scrollTo(0, y)
    arrive()
    return
  }
  const d = Math.abs(y - window.scrollY)
  lenis.scrollTo(y, { duration: dive ? 2.6 : Math.min(3.8, 1.3 + d / 2400), easing: ease, onComplete: arrive })
}
document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href')?.slice(1) ?? ''
    const target = document.getElementById(id)
    if (!target) return
    e.preventDefault()
    travel(target)
    history.replaceState(null, '', `${location.pathname}${location.search}#${id}`)
  }),
)

// the first click takes you down into the grass
const dive = () => {
  flash()
  travel($('#highlights'), true)
}
$('#hero-enter').addEventListener('click', dive)
$('#top').addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('a, button')) dive()
})
// anywhere else in the dark, a click is a flash
window.addEventListener('click', (e) => {
  const t = e.target as HTMLElement
  if (t.closest('#top, a, button, input, select, textarea, .card, .panel, .bar, h1, h2, h3, p, li')) return
  flash()
})

// the light falls on the card under the pointer too
document.addEventListener(
  'pointermove',
  (e) => {
    const c = (e.target as HTMLElement).closest?.<HTMLElement>('.card, .panel')
    if (!c) return
    const r = c.getBoundingClientRect()
    c.style.setProperty('--mx', `${(e.clientX - r.left).toFixed(0)}px`)
    c.style.setProperty('--my', `${(e.clientY - r.top).toFixed(0)}px`)
  },
  { passive: true },
)

// the first time you reach the water, one flash shows the whole marsh
if (!reducedMotion) {
  const arrive = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      arrive.disconnect()
      setTimeout(flash, 700)
    },
    { threshold: 0.6 },
  )
  arrive.observe($('#contact'))
}

// each card and panel is caught by a flash the first time it comes into view
if (!reducedMotion) {
  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        e.target.classList.add('is-lit')
        seen.unobserve(e.target)
      }
    },
    { threshold: 0.35 },
  )
  document.querySelectorAll('.card, .panel').forEach((n) => seen.observe(n))
}
