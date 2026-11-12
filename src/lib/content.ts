/**
 * Types for content/profile.json: the single source of every word on the site
 * (Kasia's CV and LinkedIn, merged). Components read from here; nothing about
 * her is typed into the code. On the Polish page, content/profile.pl.json lays
 * the Polish wording over it; anything it leaves out stays as in English.
 */
import raw from '../../content/profile.json'
import rawPl from '../../content/profile.pl.json'
import { lang } from './i18n'

export type Tier = 1 | 2 | 3

export interface Entry {
  id: string
  tier: Tier
  title: string
  org?: string
  dates?: string
  place?: string
  bullets?: string[]
  /** the text a highlight card shows */
  summary?: string
  linkedin_note?: string
  kind?: string
  bullets_cv?: string[]
  links?: string[]
}

export interface Education {
  id: string
  tier: Tier
  degree: string
  school: string
  dates: string
  activities_linkedin?: string
}

export interface Publication {
  id: string
  tier: Tier
  title: string
  kind: string
  venue: string
  date: string
  link: string
  description: string
}

export interface Certification {
  id: string
  tier: Tier
  title: string
  issuer: string
  date: string | null
  credential: string
  note_linkedin?: string
}

export interface Language {
  name: string
  cv: string
  linkedin: string
  tier: Tier
}

export interface Profile {
  target_roles: string
  person: {
    name: string
    location: string
    hook: string
    links: Record<string, string>
    /** kept in two parts so the whole address never sits in the site's files */
    email: { user: string; domain: string }
  }
  about: { paragraphs: string[] }
  projects: Entry[]
  experience: Entry[]
  education: Education[]
  publications: Publication[]
  certifications: Certification[]
  skills: {
    cv_groups: { name: string; items: string[] }[]
    linkedin: string[]
    highlight_for_target_roles: string[]
  }
  languages: Language[]
}

/**
 * Lays one language over another: objects key by key, lists of entries by their id
 * (or by position when they have none), lists of words replaced whole.
 */
function overlay<T>(base: T, top: unknown): T {
  if (top === undefined || top === null) return base
  if (Array.isArray(base) && Array.isArray(top)) {
    if (!base.every((x) => x && typeof x === 'object')) return top as T
    return base.map((b, i) => {
      const id = (b as { id?: string }).id
      return overlay(b, id === undefined ? top[i] : (top as { id?: string }[]).find((x) => x?.id === id))
    }) as T
  }
  if (base && typeof base === 'object' && typeof top === 'object' && !Array.isArray(top)) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
    for (const [k, v] of Object.entries(top as Record<string, unknown>)) out[k] = overlay(out[k], v)
    return out as T
  }
  return top as T
}

export const profile = (lang === 'pl' ? overlay(raw, rawPl) : raw) as unknown as Profile

export function link(key: string): string {
  const url = profile.person.links[key]
  if (!url) throw new Error(`profile.json: no link "${key}"`)
  return url
}

/** The e-mail address, joined only when the page runs. */
export function email(): string {
  return [profile.person.email.user, profile.person.email.domain].join('@')
}

/** CEFR position of a language level, for the language scale (native sits beyond C2). */
export function cefrStep(level: string): number {
  if (/native|ojczysty/i.test(level)) return 7
  const steps = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  const found = level.match(/[ABC][12]/g) ?? []
  return Math.max(0, ...found.map((l) => steps.indexOf(l) + 1))
}
