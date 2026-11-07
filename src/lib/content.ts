/**
 * Types for content/profile.json: the single source of every word on the site
 * (Kasia's CV and LinkedIn, merged). Components read from here; nothing about
 * her is typed into the code.
 */
import raw from '../../content/profile.json'

export type Tier = 1 | 2 | 3

export interface Entry {
  id: string
  tier: Tier
  title: string
  org?: string
  dates?: string
  place?: string
  bullets?: string[]
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
    headline_linkedin: string
    hook: string
    links: Record<string, string>
    /** kept in two parts so the whole address never sits in the site's files */
    email: { user: string; domain: string }
  }
  about: { paragraphs: string[]; cv_summary: string }
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

export const profile = raw as unknown as Profile

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
  if (/native/i.test(level)) return 7
  const steps = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  const found = level.match(/[ABC][12]/g) ?? []
  return Math.max(0, ...found.map((l) => steps.indexOf(l) + 1))
}
