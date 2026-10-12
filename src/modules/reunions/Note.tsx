import DOMPurify from 'dompurify'
import { useLayoutEffect, useRef, useState } from 'react'
import './texteRiche.css'
import { estHtml } from './texteRiche'

// HTML de l'éditeur jamais affiché sans passer par DOMPurify.

const BALISES = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'blockquote', 'hr', 'label', 'input', 'span', 'div']
const ATTRIBUTS = ['href', 'type', 'checked', 'start', 'data-type', 'data-checked']

let crochetsPoses = false
function nettoyer(html: string) {
  if (!crochetsPoses) {
    crochetsPoses = true
    DOMPurify.addHook('afterSanitizeAttributes', (n) => {
      // Cases à cocher affichées, pas modifiables ; liens dans un autre onglet.
      if (n.tagName === 'INPUT') n.setAttribute('disabled', '')
      if (n.tagName === 'A') {
        n.setAttribute('target', '_blank')
        n.setAttribute('rel', 'noopener noreferrer')
      }
    })
  }
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: BALISES, ALLOWED_ATTR: ATTRIBUTS, ALLOW_DATA_ATTR: false })
}

/**
 * Une note affichée (texte brut ou mis en forme). `replier` : une longue
 * note est coupée, avec « Afficher tout ».
 */
export function NoteAffichee({ valeur, className = '', replier }: { valeur: string | null; className?: string; replier?: boolean }) {
  const boite = useRef<HTMLDivElement>(null)
  const [deborde, setDeborde] = useState(false)
  const [ouverte, setOuverte] = useState(false)
  const html = valeur && estHtml(valeur)

  useLayoutEffect(() => {
    const b = boite.current
    if (replier && b) setDeborde(b.scrollHeight > b.clientHeight + 4)
  }, [replier, valeur])

  if (!valeur) return null
  const coupee = replier && !ouverte
  return (
    <div className={className}>
      <div ref={boite} className={coupee ? 'max-h-36 overflow-hidden print:max-h-none' : undefined}>
        {html ? (
          <div className="texte-riche" dangerouslySetInnerHTML={{ __html: nettoyer(valeur) }} />
        ) : (
          <p className="whitespace-pre-line">{valeur}</p>
        )}
      </div>
      {replier && (deborde || ouverte) && (
        <button type="button" className="mt-0.5 text-xs font-medium text-foret-800 hover:underline print:hidden" onClick={() => setOuverte(!ouverte)}>
          {ouverte ? 'Réduire' : 'Afficher tout'}
        </button>
      )}
    </div>
  )
}
