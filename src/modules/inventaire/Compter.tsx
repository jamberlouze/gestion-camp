import { useState } from 'react'
import { Compteur } from '@/lib/Compteur'
import { Dialogue } from '@/lib/Dialogue'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { useCompter, type Donnees } from './donnees'
import { compteAvant, compteDuJour, dateCourte, manque, nomArticle, total } from './outils'
import type { ChampsCompte } from './types'

const CHAMPS = [
  { champ: 'bon', libelle: 'En bon état' },
  { champ: 'brise', libelle: 'Brisés / à réparer' },
  { champ: 'incomplet', libelle: 'Incomplets' },
] as const

/**
 * Compter un article sur place (téléphone) : seuls les champs touchés sont
 * envoyés, datés du jour du comptage, en passant à l'article suivant, au
 * précédent ou en fermant. Marche sans réseau (file de l'inventaire).
 */
export function Compter({
  d,
  jour,
  ordre,
  id,
  aller,
  fiche,
  fermer,
}: {
  d: Donnees
  /** Jour de l'inventaire (AAAA-MM-JJ). */
  jour: string
  /** Articles affichés, dans l'ordre de la liste (pour Précédent / Suivant). */
  ordre: { id: string }[]
  id: string
  aller: (id: string) => void
  fiche: (id: string) => void
  fermer: () => void
}) {
  const compter = useCompter()
  const article = d.article.get(id)
  const historique = d.historique(id)
  const duJour = compteDuJour(historique, jour)
  const avant = compteAvant(historique, jour)
  const [touches, setTouches] = useState<ChampsCompte>({})
  if (!article) return null

  const valeur = (c: (typeof CHAMPS)[number]['champ']) => touches[c] ?? duJour?.[c] ?? null
  const note = touches.note !== undefined ? (touches.note ?? '') : (duJour?.note ?? '')
  const i = ordre.findIndex((a) => a.id === id)
  const precedentId = i > 0 ? ordre[i - 1].id : null
  const suivantId = i >= 0 && i < ordre.length - 1 ? ordre[i + 1].id : null

  const enregistrer = () => {
    const champs: ChampsCompte = { ...touches }
    if (champs.note !== undefined) champs.note = champs.note?.trim() || null
    const change = (Object.keys(champs) as (keyof ChampsCompte)[]).some((k) => champs[k] !== (duJour?.[k] ?? (k === 'note' ? null : undefined)))
    if (change) compter.mutate({ article_id: id, jour, champs })
    setTouches({})
  }
  const partir = (vers: () => void) => {
    enregistrer()
    vers()
  }

  const lieu = article.lieu_id ? d.lieu.get(article.lieu_id)?.nom : null
  const section = article.section_id ? d.section.get(article.section_id)?.nom : null
  const cie = article.entreprise_id ? d.compagnie.get(article.entreprise_id) : undefined
  const enCours = { bon: valeur('bon'), brise: valeur('brise'), incomplet: valeur('incomplet') }
  const compte = enCours.bon != null || enCours.brise != null || enCours.incomplet != null
  const somme = { bon: enCours.bon ?? 0, brise: enCours.brise ?? 0, incomplet: enCours.incomplet ?? 0 }
  const m = compte ? manque(article, somme) : 0

  return (
    <Dialogue titre={nomArticle(article)} fermer={() => partir(fermer)}>
      <div className="-mt-3 mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-pierre-500">
        {[section, lieu].filter(Boolean).join(' · ')}
        {cie && <PuceCompagnie compagnie={cie} court />}
        <button className="text-foret-700 underline" onClick={() => partir(() => fiche(id))}>
          Fiche
        </button>
      </div>
      {article.note && <p className="mb-3 rounded-lg bg-pierre-50 px-3 py-2 text-sm text-pierre-700">{article.note}</p>}

      <div className="space-y-3">
        {CHAMPS.map((c) => (
          <div key={c.champ} className="flex items-center justify-between gap-3">
            <span className={`text-sm font-medium ${c.champ === 'bon' ? 'text-pierre-800' : 'text-pierre-600'}`}>{c.libelle}</span>
            <Compteur grand libelle={c.libelle} valeur={valeur(c.champ)} changer={(n) => setTouches({ ...touches, [c.champ]: n })} />
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="text-pierre-600">
          Total : <strong className="tabular-nums text-pierre-900">{compte ? total(somme) : '—'}</strong>
          {article.necessaire != null && <span className="text-pierre-500"> · il en faut {article.necessaire}</span>}
          {m > 0 && <span className="ml-1 font-medium text-red-700">(manque {m})</span>}
        </span>
        <span className="text-xs text-pierre-500">
          {avant
            ? `Avant (${dateCourte(avant.jour)}) : ${avant.bon} bons${avant.brise ? `, ${avant.brise} brisés` : ''}${avant.incomplet ? `, ${avant.incomplet} incomplets` : ''}`
            : 'Jamais compté avant'}
        </span>
      </div>

      <label className={`${ui.etiquette} mt-4`} htmlFor="note-compte">
        Note (état, ce qui manque…)
      </label>
      <textarea id="note-compte" rows={2} className={ui.champ} value={note} onChange={(e) => setTouches({ ...touches, note: e.target.value })} />

      {duJour?.compte_par_nom && (
        <p className="mt-2 text-xs text-pierre-500">
          Compté le {dateCourte(jour)} par {duJour.compte_par_nom}
        </p>
      )}

      <div className="mt-5 flex items-center gap-2">
        <button className={ui.boutonSecondaire} disabled={!precedentId} onClick={() => precedentId && partir(() => aller(precedentId))} aria-label="Article précédent">
          ←
        </button>
        <button className={`${ui.bouton} flex-1`} onClick={() => partir(suivantId ? () => aller(suivantId) : fermer)}>
          {suivantId ? 'Suivant →' : 'Terminé'}
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-pierre-400">
        {i + 1} sur {ordre.length} dans la liste · compte du {dateCourte(jour)}
      </p>
    </Dialogue>
  )
}
