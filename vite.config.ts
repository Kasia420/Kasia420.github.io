import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const PROFILE = page('./content/profile.json')
const PROFILE_PL = page('./content/profile.pl.json')

/**
 * Only what the page shows reaches the browser. The editorial notes on the CV data (who decided what
 * and when, where each line came from) live in content/notes.local.json, which stays on this computer;
 * as a guard, any such note that finds its way back into the data is stripped here, together with the
 * fields the page never shows (the CV summary and the LinkedIn headline).
 */
const NOT_SHOWN = new Set([
  '_about_this_file',
  'decided',
  'source',
  'verified',
  'photo',
  'contact_public',
  'still_to_come',
  'cv_summary',
  'headline_linkedin',
])
const strip = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(strip)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).filter(([k]) => !NOT_SHOWN.has(k)).map(([k, x]) => [k, strip(x)]))
      : v
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'))

function publicContent(): Plugin {
  return {
    name: 'kasia-cv:public-content',
    enforce: 'pre',
    load(id) {
      const file = id.split('?')[0]
      if (file !== PROFILE && file !== PROFILE_PL) return null
      return JSON.stringify(strip(readJson(file)))
    },
    // the words every page needs before any script runs (search results, link previews, no-JavaScript visitors)
    transformIndexHtml(html) {
      const en = readJson(PROFILE)
      const polish = /<html[^>]*\blang="pl"/.test(html)
      const hook: string = polish ? readJson(PROFILE_PL).person.hook : en.person.hook
      const links: Record<string, string> = en.person.links
      const words: Record<string, string> = {
        HOOK: hook,
        TAGLINE: `${hook.split(':')[0]}.`, // the opening words of her About, as on the page
        NAME: en.person.name,
        LIT_SITE: links.lost_in_translation_site,
        LIT_REPO: links.lost_in_translation_repo,
        GITHUB: links.github,
        LINKEDIN: links.linkedin,
        // written out for people, not as a link, so the address stays out of reach of simple harvesters
        EMAIL_TEXT: `${en.person.email.user} [at] ${en.person.email.domain}`,
      }
      return html.replace(/%([A-Z_]+)%/g, (all, key: string) => (key in words ? escape(words[key]) : all))
    },
  }
}

export default defineConfig({
  // a GitHub user site is served from the domain root: https://kasia420.github.io/
  base: '/',
  plugins: [publicContent()],
  build: {
    target: 'es2022',
    // the English page and the Polish one; the design review (design/) stays a local page for the dev server
    rolldownOptions: { input: { main: page('./index.html'), pl: page('./pl/index.html') } },
  },
})
