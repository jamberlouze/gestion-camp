import { useEffect, useRef } from 'react'
import type { Langue } from './habillage'

// Cloudflare Turnstile (anti-robot, gratuit) des formulaires publics. Le
// jeton obtenu est vérifié par le Worker (worker/commun/turnstile.js) ; il ne
// sert qu'une fois : changer `cle` en redemande un.

interface ApiTurnstile {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  remove: (id: string) => void
}

let chargement: Promise<void> | null = null
function chargerTurnstile(): Promise<void> {
  chargement ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      chargement = null
      reject(new Error('Turnstile'))
    }
    document.head.appendChild(s)
  })
  return chargement
}

export function Turnstile({ langue, cle, changer }: { langue: Langue; cle: number; changer: (jeton: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const site = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
  useEffect(() => {
    if (!site) return
    let id: string | undefined
    let fini = false
    changer('')
    chargerTurnstile()
      .then(() => {
        const api = (window as unknown as { turnstile?: ApiTurnstile }).turnstile
        if (fini || !ref.current || !api) return
        id = api.render(ref.current, {
          sitekey: site,
          language: langue,
          callback: (jeton: string) => changer(jeton),
          'expired-callback': () => changer(''),
          'error-callback': () => changer(''),
        })
      })
      .catch(() => changer(''))
    return () => {
      fini = true
      if (id) (window as unknown as { turnstile?: ApiTurnstile }).turnstile?.remove(id)
    }
  }, [site, langue, cle, changer])
  return <div ref={ref} className="min-h-16" />
}
