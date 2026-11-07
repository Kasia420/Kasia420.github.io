import { cefrStep, link, profile, type Entry } from '../lib/content'
import { el } from '../lib/dom'

/** Everything below the highlights, rendered from content/profile.json. */

export const bullets = (items?: string[]): HTMLElement[] =>
  items && items.length ? [el('ul', { class: 'entry__bullets' }, items.map((b) => el('li', { text: b })))] : []

export const extLink = (text: string, href: string) => el('a', { href, target: '_blank', rel: 'noopener', text: `${text} ↗` })

export function entry(e: Entry): HTMLElement {
  const meta = [e.org, e.dates, e.place].filter(Boolean).join(' · ')
  return el('article', { class: `entry entry--t${e.tier}` }, [
    el('header', { class: 'entry__head' }, [
      el('h3', { class: 'entry__title', text: e.title }),
      ...(meta ? [el('p', { class: 'entry__meta', text: meta })] : []),
    ]),
    ...bullets(e.bullets),
  ])
}

export function mountTimeline(root: HTMLElement, entries: Entry[]): void {
  root.replaceChildren(...entries.map(entry))
}

export function mountEducation(root: HTMLElement): void {
  root.replaceChildren(
    ...profile.education.map((ed) =>
      el('article', { class: `entry entry--t${ed.tier}` }, [
        el('header', { class: 'entry__head' }, [
          el('h3', { class: 'entry__title', text: ed.degree }),
          el('p', { class: 'entry__meta', text: `${ed.school} · ${ed.dates}` }),
        ]),
        ...(ed.activities_linkedin ? [el('p', { class: 'entry__note', text: `Activities: ${ed.activities_linkedin}` })] : []),
      ]),
    ),
  )
}

export function mountPublications(root: HTMLElement): void {
  root.replaceChildren(
    ...profile.publications.map((p) =>
      el('article', { class: 'card card--publication' }, [
        el('p', { class: 'label', text: `${p.kind} · ${p.venue} · ${p.date}` }),
        el('h3', { class: 'card__title', text: p.title }),
        el('p', { class: 'card__text', text: p.description }),
        extLink('Read on Academia.edu', link(p.link)),
      ]),
    ),
  )
}

export function mountCertificates(root: HTMLElement): void {
  root.replaceChildren(
    ...profile.certifications.map((c) =>
      el('article', { class: `card card--cert card--t${c.tier}` }, [
        el('p', { class: 'label', text: [c.issuer, c.date].filter(Boolean).join(' · ') }),
        el('h3', { class: 'card__title', text: c.title }),
        ...(c.note_linkedin ? [el('p', { class: 'card__text', text: c.note_linkedin })] : []),
        extLink('Show credential', c.credential),
      ]),
    ),
  )
}

/** CEFR scale A1 … C2, with "native" beyond the end. One series, so no legend. */
export function mountLanguages(root: HTMLElement): void {
  const steps = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  root.replaceChildren(
    ...profile.languages.map((l) => {
      const n = cefrStep(l.cv)
      const native = n === 7
      return el('div', { class: `lang lang--t${l.tier}` }, [
        el('span', { class: 'lang__name', text: l.name }),
        el(
          'span',
          { class: 'lang__scale', role: 'img', 'aria-label': `${l.name}: ${l.cv}` },
          steps.map((s, i) => el('i', { class: `lang__step${native || i < n ? ' is-on' : ''}`, title: s })),
        ),
        el('span', { class: 'lang__level', text: l.cv }),
      ])
    }),
  )
}

export function mountSkills(root: HTMLElement): void {
  const hi = new Set(profile.skills.highlight_for_target_roles.map((s) => s.toLowerCase()))
  const isHi = (s: string) => [...hi].some((h) => s.toLowerCase().startsWith(h))
  root.replaceChildren(
    ...profile.skills.cv_groups.map((g) =>
      el('div', { class: 'skills__group' }, [
        el('p', { class: 'label', text: g.name }),
        el('ul', { class: 'skills__list' }, g.items.map((s) => el('li', { class: isHi(s) ? 'is-hi' : '', text: s }))),
      ]),
    ),
    el('div', { class: 'skills__group' }, [
      el('p', { class: 'label', text: 'Also on LinkedIn' }),
      el(
        'ul',
        { class: 'skills__list' },
        profile.skills.linkedin.map((s) => el('li', { class: isHi(s) ? 'is-hi' : '', text: s })),
      ),
    ]),
  )
}
