import { useState } from 'react'
import { Link } from 'react-router'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { commencerComptage, majComptage, supprimerComptage, useRelire, type Donnees } from './donnees'
import { bilan, dateCourte, nomNouveauComptage } from './outils'
import type { Comptage } from './types'

/** Onglet Comptages : un par saison ; commencer, terminer, rouvrir, renommer, supprimer (en ligne). */
export function Comptages({ d, ecriture }: { d: Donnees; ecriture: boolean }) {
  const relire = useRelire()
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const enCours = d.comptages.find((c) => c.statut === 'en_cours')
  const actifs = d.articles.filter((a) => a.actif).length

  async function faire(f: () => Promise<unknown>) {
    setErreur(null)
    setOccupe(true)
    try {
      await f()
      await relire()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }

  const terminer = async (c: Comptage) => {
    if (await confirmer({ titre: `Terminer le comptage ${c.nom} ?`, message: 'Ses nombres ne pourront plus être modifiés (on peut le rouvrir).', libelleOk: 'Terminer' }))
      faire(() => majComptage(c.id, { statut: 'termine', fin: new Date().toLocaleDateString('en-CA') }))
  }
  const rouvrir = (c: Comptage) => faire(() => majComptage(c.id, { statut: 'en_cours', fin: null }))
  const supprimer = async (c: Comptage) => {
    const n = d.lignes.filter((l) => l.comptage_id === c.id).length
    if (
      await confirmer({
        titre: `Supprimer le comptage ${c.nom} ?`,
        message: n ? `Ses ${n} articles comptés sont effacés. Les articles restent dans l'inventaire.` : undefined,
        libelleOk: 'Supprimer',
        danger: true,
      })
    )
      faire(() => supprimerComptage(c.id))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-pierre-600">Un comptage par saison. Un seul en cours à la fois ; un comptage terminé garde ses nombres pour comparer.</p>
        {ecriture && !enCours && (
          <button className={ui.bouton} disabled={occupe} onClick={() => faire(() => commencerComptage(nomNouveauComptage(d.comptages)))}>
            Commencer le comptage {nomNouveauComptage(d.comptages)}
          </button>
        )}
      </div>
      {erreur && <p className={ui.erreur}>{erreur}</p>}

      {d.comptages.length === 0 ? (
        <p className={`${ui.carte} p-8 text-center text-sm text-pierre-500`}>Aucun comptage pour l'instant.</p>
      ) : (
        <ul className={`${ui.carte} divide-y divide-pierre-100`}>
          {d.comptages.map((c) => {
            const b = bilan(d.lignes.filter((l) => l.comptage_id === c.id))
            return (
              <li key={c.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {ecriture ? (
                      <ChampTexte
                        aria-label="Nom du comptage"
                        obligatoire
                        className="w-32 rounded-md border border-transparent px-1.5 py-0.5 font-semibold hover:border-pierre-300 focus:border-foret-600 focus:outline-none"
                        valeur={c.nom}
                        enregistrer={(nom) => faire(() => majComptage(c.id, { nom }))}
                      />
                    ) : (
                      <span className="font-semibold">{c.nom}</span>
                    )}
                    {c.statut === 'en_cours' ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">En cours</span>
                    ) : (
                      <span className="rounded-full bg-pierre-100 px-2 py-0.5 text-xs font-medium text-pierre-700">Terminé</span>
                    )}
                    <span className="text-xs text-pierre-500">
                      {dateCourte(c.debut)}
                      {c.fin && c.fin !== c.debut ? ` au ${dateCourte(c.fin)}` : ''}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-pierre-600">
                    {b.articles} article{b.articles > 1 ? 's' : ''} compté{b.articles > 1 ? 's' : ''}
                    {c.statut === 'en_cours' ? ` sur ${actifs}` : ''} · {b.bon} en bon état
                    {b.brise ? ` · ${b.brise} brisés` : ''}
                    {b.incomplet ? ` · ${b.incomplet} incomplets` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link className={ui.boutonSecondaire} to={`/inventaire?comptage=${c.id}`}>
                    Voir
                  </Link>
                  {ecriture && c.statut === 'en_cours' && (
                    <button className={ui.boutonSecondaire} disabled={occupe} onClick={() => terminer(c)}>
                      Terminer
                    </button>
                  )}
                  {ecriture && c.statut === 'termine' && !enCours && (
                    <button className={ui.boutonSecondaire} disabled={occupe} onClick={() => rouvrir(c)}>
                      Rouvrir
                    </button>
                  )}
                  {ecriture && <BoutonSupprimer disabled={occupe} onClick={() => supprimer(c)} />}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
