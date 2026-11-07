import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const PROFILE = page('./content/profile.json')

/**
 * The editorial notes on the CV data (who decided what and when, where each line came from, what
 * was checked on a credential page) live in content/notes.local.json, which stays on this computer.
 * As a guard, any such note that finds its way back into profile.json is stripped before it can
 * reach the browser.
 */
const EDITORIAL = new Set(['_about_this_file', 'decided', 'source', 'verified', 'photo', 'contact_public', 'still_to_come'])
const strip = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(strip)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).filter(([k]) => !EDITORIAL.has(k)).map(([k, x]) => [k, strip(x)]))
      : v
const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function publicContent(): Plugin {
  return {
    name: 'kasia-cv:public-content',
    enforce: 'pre',
    load(id) {
      if (id.split('?')[0] !== PROFILE) return null
      return JSON.stringify(strip(JSON.parse(readFileSync(PROFILE, 'utf8'))))
    },
    // the page's description for search results and link previews: her own opening line, from the same file
    transformIndexHtml(html) {
      const hook: string = JSON.parse(readFileSync(PROFILE, 'utf8')).person.hook
      return html.replaceAll('%HOOK%', escapeAttr(hook))
    },
  }
}

export default defineConfig({
  // a GitHub user site is served from the domain root: https://kasia420.github.io/
  base: '/',
  plugins: [publicContent()],
  build: {
    target: 'es2022',
    // only the real page is published; the design review (design/) stays a local page for the dev server
    rolldownOptions: { input: { main: page('./index.html') } },
  },
})
