/**
 * The design review page only (design/index.html): the second typeface, B · Sepia archive,
 * and the switch between the two takes. The real page is set in A · Flash and loads none of this.
 */
import '@fontsource/old-standard-tt/400.css'
import '@fontsource/old-standard-tt/700.css'
import '@fontsource/old-standard-tt/400-italic.css'
import '@fontsource/ibm-plex-mono/400.css'

type Take = 'flash' | 'archive'
const html = document.documentElement

function setTake(t: Take) {
  html.dataset.take = t
  document.querySelectorAll<HTMLButtonElement>('[data-set-take]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setTake === t)))
  const params = new URLSearchParams(location.search)
  if (t === 'flash') params.delete('take')
  else params.set('take', t)
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`)
}
// new letterforms move the cards, so the walk is laid out again
const relayout = () => window.dispatchEvent(new Event('resize'))

document.querySelectorAll<HTMLButtonElement>('[data-set-take]').forEach((b) =>
  b.addEventListener('click', () => {
    setTake(b.dataset.setTake === 'archive' ? 'archive' : 'flash')
    void document.fonts.ready.then(relayout)
  }),
)
setTake(new URLSearchParams(location.search).get('take') === 'archive' ? 'archive' : 'flash')
void document.fonts.ready.then(relayout)
