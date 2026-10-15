import { Fragment, type ReactNode } from 'react'

// Textes modifiables du module RH (codes d'éthique, entente de bénévolat,
// introduction de l'intention de retour), affichés dans les pages
// publiques et dans Réglages. Syntaxe volontairement simple :
//   « - » en début de ligne : puce ; « ␣␣- » (deux espaces) : sous-puce ;
//   ligne vide : nouveau paragraphe ; **gras** ; {{champ}} remplacé ;
//   une adresse https://… devient un lien.

type Bloc = { genre: 'paragraphe'; lignes: string[] } | { genre: 'liste'; elements: { texte: string; sous: string[] }[] }

function blocs(texte: string): Bloc[] {
  const res: Bloc[] = []
  let courant: Bloc | null = null
  for (const brute of texte.replace(/\r/g, '').split('\n')) {
    const sous = /^\s{2,}[-•]\s+(.*)$/.exec(brute)
    const puce = /^[-•]\s+(.*)$/.exec(brute)
    if (!brute.trim()) {
      courant = null
    } else if (sous && courant?.genre === 'liste' && courant.elements.length) {
      courant.elements.at(-1)!.sous.push(sous[1])
    } else if (puce || sous) {
      if (courant?.genre !== 'liste') res.push((courant = { genre: 'liste', elements: [] }))
      courant.elements.push({ texte: (puce ?? sous)![1], sous: [] })
    } else {
      if (courant?.genre !== 'paragraphe') res.push((courant = { genre: 'paragraphe', lignes: [] }))
      courant.lignes.push(brute.trim())
    }
  }
  return res
}

/** Une ligne : {{champs}} remplacés, **gras**, adresses en liens. */
function enLigne(ligne: string, valeurs: Record<string, string>): ReactNode[] {
  const remplie = ligne.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => valeurs[k] ?? '')
  return remplie.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s<>()]+)/g).map((morceau, i) => {
    if (/^\*\*[^*]+\*\*$/.test(morceau)) return <strong key={i}>{morceau.slice(2, -2)}</strong>
    if (/^https?:\/\//.test(morceau)) {
      const lien = morceau.replace(/[.,;:!?]+$/, '')
      return (
        <Fragment key={i}>
          <a href={lien} className="text-foret-700 underline" target="_blank" rel="noreferrer">
            {lien.replace(/^https?:\/\//, '')}
          </a>
          {morceau.slice(lien.length)}
        </Fragment>
      )
    }
    return morceau
  })
}

export function TexteFormate({ texte, valeurs = {}, className = '' }: { texte: string; valeurs?: Record<string, string>; className?: string }) {
  return (
    <div className={`space-y-2 text-sm leading-relaxed text-pierre-800 ${className}`}>
      {blocs(texte).map((b, i) =>
        b.genre === 'paragraphe' ? (
          <p key={i}>
            {b.lignes.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {enLigne(l, valeurs)}
              </Fragment>
            ))}
          </p>
        ) : (
          <ul key={i} className="list-disc space-y-0.5 pl-5">
            {b.elements.map((el, j) => (
              <li key={j}>
                {enLigne(el.texte, valeurs)}
                {el.sous.length > 0 && (
                  <ul className="mt-0.5 list-[circle] space-y-0.5 pl-5">
                    {el.sous.map((s, k) => (
                      <li key={k}>{enLigne(s, valeurs)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  )
}
