/**
 * The words the page itself uses (buttons, labels), in English and Polish. Everything
 * about Kasia comes from content/profile.json and, on the Polish page, profile.pl.json.
 * The language is the page's own: index.html is English, pl/index.html Polish.
 */
export type Lang = 'en' | 'pl'
export const lang: Lang = document.documentElement.lang.startsWith('pl') ? 'pl' : 'en'

const ui = {
  en: {
    motionOn: 'Motion: on',
    motionOff: 'Motion: off',
    featured: 'Featured project',
    highlights: 'Highlights',
    inProgress: 'In progress',
    maThesis: 'MA thesis',
    certificate: 'Certificate',
    languages: 'Languages',
    skills: 'Skills',
    details: 'Details',
    hideDetails: 'Hide details',
    openSite: "Open the project's site",
    repository: 'Repository',
    report: 'Report',
    showCredential: 'Show credential',
    readOn: 'Read on Academia.edu',
    newTab: 'opens in a new tab',
    activities: 'Activities',
    alsoLinkedIn: 'Also on LinkedIn',
    langLevel: ' ', // "English C1 (academic)"
  },
  pl: {
    motionOn: 'Animacje: wł.',
    motionOff: 'Animacje: wył.',
    featured: 'Wyróżniony projekt',
    highlights: 'Najważniejsze',
    inProgress: 'W toku',
    maThesis: 'Praca magisterska',
    certificate: 'Certyfikat',
    languages: 'Języki',
    skills: 'Umiejętności',
    details: 'Szczegóły',
    hideDetails: 'Ukryj szczegóły',
    openSite: 'Otwórz stronę projektu',
    repository: 'Repozytorium',
    report: 'Raport',
    showCredential: 'Zobacz certyfikat',
    readOn: 'Czytaj na Academia.edu',
    newTab: 'otwiera się w nowej karcie',
    activities: 'Aktywności',
    alsoLinkedIn: 'Także na LinkedIn',
    langLevel: ': ', // "Angielski: C1 (akademicki)"
  },
} as const

export type Key = keyof (typeof ui)['en']
export const t = (k: Key): string => ui[lang][k]
