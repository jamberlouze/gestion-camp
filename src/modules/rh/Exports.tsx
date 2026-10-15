import { useEffect, useRef, useState } from 'react'
import { messageErreur } from '@/lib/donnees'
import { IconeExporter } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useRh } from './contexte'
import { useDossiers } from './donnees'
import { useDocumentsConformite } from './donneesConformite'
import { rangeesAcq, rangeesListe } from './listes'
import { aujourdhui, estAncien, libelleDate } from './outils'
import type { DocumentConformite, Embauche } from './types'

/** Feuille .xlsx d'une seule page (SheetJS chargé à la demande). */
async function telechargerXlsx(rangees: (string | number)[][], nomFeuille: string, nomFichier: string) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet(rangees)
  ws['!cols'] = rangees[0].map((_, i) => ({ wch: Math.min(40, Math.max(8, ...rangees.slice(0, 200).map((r) => String(r[i] ?? '').length + 1))) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, nomFeuille)
  XLSX.writeFile(wb, nomFichier.replace(/[\\/:*?"<>|]/g, '-'))
}

/**
 * Menu « Exporter » de l'onglet Employés (saison et compagnie choisies) :
 * liste de la saison, ACQ, VAJ (fenêtre), Employeur D (fenêtre, accès paie).
 */
export function MenuExporter({ embauches, titre, ouvrirVaj, ouvrirEmployeurD }: { embauches: Embauche[]; titre: string; ouvrirVaj: () => void; ouvrirEmployeurD: (() => void) | null }) {
  const { personneParId, posteParId, compagnieParId, dates, embauchesDe, saisonParId } = useRh()
  const dossiers = useDossiers()
  const documents = useDocumentsConformite()
  const [ouvert, setOuvert] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const boite = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ouvert) return
    const fermer = (ev: MouseEvent) => !boite.current?.contains(ev.target as Node) && setOuvert(false)
    const touche = (ev: KeyboardEvent) => ev.key === 'Escape' && setOuvert(false)
    document.addEventListener('mousedown', fermer)
    document.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('mousedown', fermer)
      document.removeEventListener('keydown', touche)
    }
  }, [ouvert])

  const actives = embauches.filter((e) => e.statut !== 'annulee')
  const pret = !!dossiers.data && !!documents.data
  const dossierDe = new Map((dossiers.data ?? []).map((d) => [d.personne_id, d]))
  const docsDe = new Map<string, DocumentConformite[]>()
  for (const d of documents.data ?? []) docsDe.set(d.personne_id, [...(docsDe.get(d.personne_id) ?? []), d])
  const nomCompagnie = (e: Embauche) => (e.entreprise_id && compagnieParId.get(e.entreprise_id)?.nom) || ''
  const nomPoste = (e: Embauche) => (e.poste_id && posteParId.get(e.poste_id)?.nom) || ''

  const lancer = async (quoi: 'liste' | 'acq') => {
    setOuvert(false)
    setErreur(null)
    try {
      if (quoi === 'liste') {
        const rangees = rangeesListe(
          actives.map((e) => ({
            embauche: e,
            personne: personneParId.get(e.personne_id)!,
            dossier: dossierDe.get(e.personne_id) ?? null,
            compagnie: nomCompagnie(e),
            poste: nomPoste(e),
            disponibilites: dates.filter((d) => e.disponibilites.includes(d.id)).map(libelleDate),
          })),
        )
        await telechargerXlsx(rangees, 'Liste', `Liste ${titre} (${aujourdhui()}).xlsx`)
      } else {
        const rangees = rangeesAcq(
          actives.map((e) => {
            const p = personneParId.get(e.personne_id)!
            return {
              personne: p,
              dossier: dossierDe.get(e.personne_id) ?? null,
              compagnie: nomCompagnie(e),
              poste: nomPoste(e),
              ancien: estAncien(p, embauchesDe.get(p.id) ?? [], saisonParId, saisonParId.get(e.saison_id)?.rang),
              documents: docsDe.get(e.personne_id) ?? [],
            }
          }),
        )
        await telechargerXlsx(rangees, 'ACQ', `ACQ ${titre} (${aujourdhui()}).xlsx`)
      }
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  const article = 'block w-full px-3 py-2 text-left text-sm hover:bg-pierre-50 disabled:opacity-50'
  return (
    <div className="relative" ref={boite}>
      <button className={ui.boutonSecondaire} aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        <IconeExporter className="size-4" /> Exporter ▾
      </button>
      {ouvert && (
        <div className="absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-lg border border-pierre-200 bg-white py-1 shadow-lg">
          <button className={article} disabled={!pret || !actives.length} onClick={() => lancer('liste')}>
            Liste de la saison (.xlsx)
            <span className="block text-xs text-pierre-500">Coordonnées, diète, tailles, urgence, disponibilités ; sans NAS ni compte.</span>
          </button>
          <button className={article} disabled={!pret || !actives.length} onClick={() => lancer('acq')}>
            ACQ (.xlsx)
            <span className="block text-xs text-pierre-500">Version simplifiée pour l'ACQ (études, CV, cartes).</span>
          </button>
          <button
            className={article}
            onClick={() => {
              setOuvert(false)
              ouvrirVaj()
            }}
          >
            VAJ…
            <span className="block text-xs text-pierre-500">Lignes à coller et « VAJ faite le … ».</span>
          </button>
          {ouvrirEmployeurD && (
            <button
              className={article}
              onClick={() => {
                setOuvert(false)
                ouvrirEmployeurD()
              }}
            >
              🔒 Employeur D (.xls)…
              <span className="block text-xs text-pierre-500">« Données d'emploi » des embauches complètes.</span>
            </button>
          )}
        </div>
      )}
      {erreur && <p className={`${ui.erreur} absolute right-0 mt-1 w-72`}>{erreur}</p>}
    </div>
  )
}
