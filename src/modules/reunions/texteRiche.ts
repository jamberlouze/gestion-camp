// Notes des points et des réunions : texte brut (barre d'ajout, anciennes
// notes) ou HTML de l'éditeur (gras, titres, listes, cases à cocher). Le
// HTML n'est jamais affiché sans passer par DOMPurify.

/** La note vient-elle de l'éditeur ? */
export const estHtml = (v: string) => /^\s*<(p|h[1-6]|ul|ol|blockquote|hr|div)[\s>/]/i.test(v)

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Note prête pour l'éditeur : une ligne de texte brut = un paragraphe. */
export function versHtml(v: string | null): string {
  if (!v) return ''
  return estHtml(v) ? v : v.split('\n').map((l) => `<p>${echapper(l)}</p>`).join('')
}

/** Texte seul (recherche). */
export function texteBrut(v: string | null): string {
  if (!v) return ''
  if (!estHtml(v)) return v
  const doc = new DOMParser().parseFromString(v.replace(/<\/(p|li|h\d|blockquote)>/gi, ' </$1>'), 'text/html')
  return doc.body.textContent ?? ''
}
