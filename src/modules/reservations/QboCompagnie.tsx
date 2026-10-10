import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { ui } from '@/lib/ui'
import { useDonnees } from './contexte'
import { appelerQbo, useModifierCompagnie, useQboConfiguration, useQboConnexions } from './donnees'
import { dateLongue } from './format'
import type { Compagnie, QboReglages, ReferenceQbo } from './types'

interface Listes {
  articles: ReferenceQbo[]
  taxes: (ReferenceQbo & { description: string | null })[]
  termes: (ReferenceQbo & { jours: number | null })[]
}

const quand = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

/**
 * QuickBooks Online d'une compagnie qui facture (un dossier QBO chacune) :
 * connexion OAuth (faite par le Worker), puis l'article, le code de taxes
 * et les conditions de paiement des devis et des factures.
 */
export function QboCompagnie({ c }: { c: Compagnie }) {
  const { ecriture } = useDonnees()
  const client = useQueryClient()
  const configuration = useQboConfiguration()
  const connexions = useQboConnexions()
  const modifier = useModifierCompagnie()
  const connexion = connexions.data?.find((x) => x.compagnie_id === c.entreprise_id)
  const [listes, setListes] = useState<Listes | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const realm = connexion?.realm_id

  useEffect(() => {
    if (!realm) return
    let actif = true
    appelerQbo<Listes>('listes', { compagnie: c.entreprise_id })
      .then((l) => actif && setListes(l))
      .catch((e: Error) => actif && setErreur(e.message))
    return () => {
      actif = false
    }
  }, [realm, c.entreprise_id])

  const connecter = async () => {
    setErreur(null)
    setOccupe(true)
    try {
      const { url } = await appelerQbo<{ url: string }>('connexion', { compagnie: c.entreprise_id })
      window.location.href = url
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      setOccupe(false)
    }
  }

  const deconnecter = async () => {
    const ok = await confirmer({
      titre: `Déconnecter ${c.nom_court} de QuickBooks ?`,
      message: "L'app ne pourra plus créer de devis ni lire les factures de ce dossier tant qu'il n'est pas reconnecté. Rien n'est effacé dans QuickBooks.",
      libelleOk: 'Déconnecter',
    })
    if (!ok) return
    setOccupe(true)
    try {
      await appelerQbo('deconnexion', { compagnie: c.entreprise_id })
      setListes(null)
      await client.invalidateQueries({ queryKey: ['reservations', 'qbo-connexions'] })
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setOccupe(false)
    }
  }

  const choisir = (cle: keyof QboReglages, options: ReferenceQbo[], id: string) => {
    const o = options.find((x) => x.id === id)
    const qbo = { ...c.qbo }
    if (o) qbo[cle] = { id: o.id, nom: o.nom }
    else delete qbo[cle]
    modifier.mutate({ id: c.entreprise_id, champs: { qbo } })
  }

  const liste = (cle: keyof QboReglages, libelle: string, aide: string, options: ReferenceQbo[] | undefined) => (
    <label className="block">
      <span className={ui.etiquette}>{libelle}</span>
      <select
        className={ui.champ}
        value={c.qbo[cle]?.id ?? ''}
        disabled={!ecriture || !options}
        onChange={(e) => choisir(cle, options ?? [], e.target.value)}
      >
        <option value="">{options ? '— À choisir' : (c.qbo[cle]?.nom ?? '—')}</option>
        {options?.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nom}
          </option>
        ))}
        {/* Valeur choisie absente de la liste (retirée dans QBO) : gardée visible. */}
        {options && c.qbo[cle] && !options.some((o) => o.id === c.qbo[cle]!.id) && <option value={c.qbo[cle]!.id}>{c.qbo[cle]!.nom} (introuvable dans QBO)</option>}
      </select>
      <span className="mt-0.5 block text-xs text-pierre-400">{aide}</span>
    </label>
  )

  return (
    <div className="space-y-3 border-t border-pierre-100 pt-3">
      <span className={ui.etiquette}>QuickBooks Online</span>
      {configuration.isSuccess && !configuration.data.configure ? (
        <p className="text-sm text-pierre-500">L'application Intuit n'est pas encore configurée dans le Worker (README, section 12).</p>
      ) : configuration.isError ? (
        <p className="text-sm text-pierre-500">Le Worker ne répond pas : {configuration.error.message}</p>
      ) : !connexion ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-pierre-600">Pas encore relié à son dossier QuickBooks.</span>
          {ecriture && (
            <button className={ui.bouton} disabled={occupe || !configuration.data} onClick={connecter}>
              {occupe ? 'Redirection…' : `Connecter QuickBooks${configuration.data?.environnement === 'sandbox' ? ' (compagnie d’essai)' : ''}`}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-pierre-700">
            ✓ Relié au dossier QBO n° {connexion.realm_id}
            {connexion.environnement === 'sandbox' && <span className="ml-1 rounded-full bg-amber-50 px-1.5 text-xs text-amber-800">compagnie d'essai</span>}
            <span className="text-pierre-400">
              {' '}
              · le {dateLongue(connexion.connecte_le.slice(0, 10))}
              {connexion.connecte_par_nom && ` par ${connexion.connecte_par_nom}`}
              {connexion.derniere_synchro && ` · dernière synchro ${quand(connexion.derniere_synchro)}`}
            </span>
          </p>
          {connexion.erreur && <p className={ui.erreur}>{connexion.erreur}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            {liste('article', 'Article par défaut', 'Lignes des devis et des factures (Q9 : un article par produit viendra plus tard).', listes?.articles)}
            {liste('taxes', 'Code de taxes', 'TPS et TVQ du Québec (14,975 %).', listes?.taxes)}
            {liste('terme', 'Conditions de paiement', 'Payable sur réception (F3, F7).', listes?.termes)}
          </div>
          {ecriture && (
            <div className="flex flex-wrap gap-2">
              <button className={ui.boutonSecondaire} disabled={occupe} onClick={connecter}>
                Reconnecter
              </button>
              <button className="text-xs text-red-700 underline" disabled={occupe} onClick={deconnecter}>
                Déconnecter
              </button>
            </div>
          )}
        </div>
      )}
      {erreur && <p className={ui.erreur}>{erreur}</p>}
    </div>
  )
}
