import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { ui } from '@/lib/ui'

/**
 * Connexion en deux étapes : courriel, puis code à 6 chiffres reçu par
 * courriel. Seules les personnes déjà invitées peuvent recevoir un code.
 */
export function PageConnexion() {
  const [courriel, setCourriel] = useState('')
  const [code, setCode] = useState('')
  const [etape, setEtape] = useState<'courriel' | 'code'>('courriel')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function demanderCode(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    setErreur(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: courriel.trim(),
      // Le lien du courriel ramène ici ; le code à 6 chiffres fonctionne aussi.
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    })
    setEnvoi(false)
    if (error) {
      setErreur(
        /signups not allowed|not found/i.test(error.message)
          ? "Cette adresse n'a pas été invitée. Demandez une invitation à un administrateur."
          : error.message,
      )
      return
    }
    setEtape('code')
  }

  async function verifierCode(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    setErreur(null)
    const { error } = await supabase.auth.verifyOtp({
      email: courriel.trim(),
      token: code.trim(),
      type: 'email',
    })
    setEnvoi(false)
    if (error) setErreur('Code invalide ou expiré.')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className={`${ui.carte} w-full max-w-sm p-6`}>
        <div className="mb-6 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-lg font-semibold">Gestion du camp</h1>
            <p className="text-sm text-pierre-500">Accès réservé à l'équipe</p>
          </div>
        </div>

        {etape === 'courriel' ? (
          <form onSubmit={demanderCode} className="space-y-4">
            <div>
              <label className={ui.etiquette} htmlFor="courriel">
                Adresse courriel
              </label>
              <input
                id="courriel"
                type="email"
                required
                autoComplete="email"
                autoFocus
                className={ui.champ}
                value={courriel}
                onChange={(e) => setCourriel(e.target.value)}
              />
            </div>
            {erreur && <p className={ui.erreur}>{erreur}</p>}
            <button className={`${ui.bouton} w-full`} disabled={envoi}>
              {envoi ? 'Envoi…' : 'Recevoir un code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifierCode} className="space-y-4">
            <p className="text-sm text-pierre-700">
              Un courriel a été envoyé à <strong>{courriel}</strong>. Entrez le code reçu, ou
              cliquez simplement sur le lien du courriel.
            </p>
            <div>
              <label className={ui.etiquette} htmlFor="code">
                Code à 6 chiffres
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                className={`${ui.champ} text-center text-xl tracking-[0.4em]`}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            {erreur && <p className={ui.erreur}>{erreur}</p>}
            <button className={`${ui.bouton} w-full`} disabled={envoi}>
              {envoi ? 'Vérification…' : 'Se connecter'}
            </button>
            <button
              type="button"
              className="w-full text-sm text-pierre-500 hover:text-pierre-800"
              onClick={() => {
                setEtape('courriel')
                setCode('')
                setErreur(null)
              }}
            >
              Changer d'adresse
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
